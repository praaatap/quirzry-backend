import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Groq } from "groq-sdk";
import { generateQuizPrompt } from "../prompts/quizGenrationPrompt.js"; 

// ==================== CONFIGURATION ====================
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  },
});

// 2. Initialize Groq
const groq = new Groq({
  apiKey: GROQ_API_KEY,
});

// Global counter to toggle between models
let requestCounter = 0;

// ==================== HELPER FUNCTIONS ====================

// Unified text extractor for both Gemini and Groq responses
async function extractTextFromResult(result, provider) {
  try {
    if (provider === "GEMINI") {
      const response = result?.response;
      if (typeof response?.text === "function") return await response.text();
      return JSON.stringify(result);
    } 
    
    if (provider === "GROQ") {
        return result.choices?.[0]?.message?.content || "";
    }

    return "";
  } catch (err) {
    console.warn(`Failed to extract text from ${provider} result`, err);
    return "";
  }
}

// Clean and Parse JSON from LLM response
function parseQuizJSON(text) {
  let cleanedText = (text || "").trim();

  // Remove markdown code fences
  cleanedText = cleanedText.replace(/^```json\n?/g, "").replace(/^```\n?/g, "").replace(/\n?```$/g, "").trim();

  // Attempt direct parse
  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    // Attempt to extract JSON substring
    const firstBrace = cleanedText.indexOf("{");
    const lastBrace = cleanedText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleanedText.substring(firstBrace, lastBrace + 1));
    }
    throw e;
  }
}

// ==================== MAIN CONTROLLER ====================

export const generateQuiz = asyncHandler(async (req, res) => {
  const { topic, questionCount = 15, difficulty = "medium" } = req.body;
  const userId = req.userId;

  // Increment Request Counter
  requestCounter++;
  
  // Logic: Odd = Gemini, Even = Groq/Llama
  const useGroq = requestCounter % 2 === 0;
  const currentProvider = useGroq ? "GROQ (Llama)" : "GEMINI";

  // Validation
  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const validQuestionCount = Math.min(Math.max(parseInt(questionCount, 10) || 15, 10), 50);

  console.log(`\n🎯 Request #${requestCounter} | Provider: ${currentProvider}`);
  console.log(`📝 Generating ${validQuestionCount} questions on: "${topic}" (${difficulty})`);

  let rawText = "";

  try {
    const prompt = generateQuizPrompt(topic, validQuestionCount, difficulty);

    if (useGroq) {
      // --- GROQ EXECUTION ---
      const completion = await groq.chat.completions.create({
        model: process.env.LLAMA_MODEL_NAME || "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a high-quality JSON-only quiz generator. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_completion_tokens: 8192,
      });
      rawText = await extractTextFromResult(completion, "GROQ");
    } else {
      // --- GEMINI EXECUTION ---
      const result = await geminiModel.generateContent(prompt);
      rawText = await extractTextFromResult(result, "GEMINI");
    }

    console.log(`✅ ${currentProvider} response received. Length: ${rawText.length}`);

    // --- COMMON PARSING LOGIC ---
    let quizData;
    try {
      quizData = parseQuizJSON(rawText);
      
      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error("Missing 'questions' array in response");
      }
    } catch (parseError) {
      console.error(`❌ Failed to parse JSON from ${currentProvider}`);
      return res.status(500).json({ error: "AI generation failed (Parsing Error). Please try again." });
    }

    // --- COMMON VALIDATION LOGIC ---
    const validatedQuestions = [];
    
    for (let i = 0; i < quizData.questions.length; i++) {
      const q = quizData.questions[i];
      try {
        if (!q.questionText || !Array.isArray(q.options) || q.options.length !== 4) continue;

        let correctAnswerIndex = q.correctAnswer;
        
        // Fix string-based answers or string-based indices
        if (typeof correctAnswerIndex === 'string') {
            // Check if it's a number string "0"
            if (!isNaN(parseInt(correctAnswerIndex))) {
                correctAnswerIndex = parseInt(correctAnswerIndex);
            } else {
                // It's the text of the answer, find index
                correctAnswerIndex = q.options.findIndex(opt => opt.trim() === correctAnswerIndex.trim());
            }
        }

        if (correctAnswerIndex < 0 || correctAnswerIndex > 3 || isNaN(correctAnswerIndex)) {
            // Fallback: If AI messed up, set to 0 (First option)
            console.warn(`⚠️ Invalid answer index at Q${i}, defaulting to 0`);
            correctAnswerIndex = 0;
        }

        validatedQuestions.push({
          questionText: q.questionText.trim(),
          options: q.options.map(o => String(o).trim()),
          correctAnswer: correctAnswerIndex
        });
      } catch (e) {
        continue; // Skip bad questions
      }
    }

    if (validatedQuestions.length === 0) {
      throw new Error("No valid questions parsed from AI response");
    }

    // --- DB SAVING (PRISMA) ---
    const quiz = await prisma.quiz.create({
      data: {
        title: `${topic} Quiz`,
        userId,
        questions: {
          create: validatedQuestions.map((q, index) => ({
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            questionNumber: index + 1,
          })),
        },
      },
      include: {
        questions: { orderBy: { questionNumber: "asc" } },
      },
    });

    console.log(`💾 Quiz saved! ID: ${quiz.id}`);

    res.status(201).json({
      quizId: quiz.id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      questions: quiz.questions,
    });

  } catch (error) {
    console.error("❌ Generation Error:", error);
    // Determine if it's an API Key/Quota issue
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("api key") || msg.includes("unauthorized")) {
       return res.status(500).json({ error: "Server Configuration Error (API Key)." });
    }
    if (msg.includes("quota") || msg.includes("too many requests")) {
       return res.status(429).json({ error: "System busy. Please try again." });
    }
    res.status(500).json({ error: "Failed to generate quiz." });
  }
});

// ==================== NEW: HISTORY & STATS CONTROLLERS ====================


// RENAME: getQuizHistory → getMyQuizResults
export const getMyQuizResults = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const history = await prisma.quizResult.findMany({
    where: { userId: userId },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`✅ Found ${history.length} quiz results for user ${userId}`);
  res.json(history);
});



// Gets quizzes created by the user (Not played history)
export const getMyQuizzes = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const quizzes = await prisma.quiz.findMany({
    where: { userId },
    include: { questions: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      createdAt: q.createdAt,
      questionCount: q.questions.length,
    })),
  });
});
export const getQuiz = asyncHandler(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.userId || req.user?.id; // Handle both middleware types

  // FIX: Validate ID before calling Prisma
  const id = parseInt(quizId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid Quiz ID provided" });
  }

  const quiz = await prisma.quiz.findFirst({
    where: { id: id, userId },
    include: { questions: { orderBy: { questionNumber: "asc" } } },
  });

  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  res.json({
    id: quiz.id,
    title: quiz.title,
    createdAt: quiz.createdAt,
    questionCount: quiz.questions.length,
    questions: quiz.questions,
  });
});

export const deleteQuiz = asyncHandler(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.userId;
  
  const quiz = await prisma.quiz.findFirst({ where: { id: parseInt(quizId, 10), userId } });
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  await prisma.quiz.delete({ where: { id: parseInt(quizId, 10) } });
  res.json({ message: "Quiz deleted successfully" });
});

export const resetQuizCount = asyncHandler(async (req, res) => {
  const userId = req.userId;
  await prisma.user.update({ where: { id: userId }, data: { quizCount: 0 } });
  res.json({ success: true, message: "Quiz count reset", quizCount: 0 });
});

export const getQuizCount = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { quizCount: true } });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    success: true,
    quizCount: user.quizCount || 0,
    shouldShowAd: (user.quizCount || 0) >= 1,
    remainingFreeQuizzes: Math.max(0, 1 - (user.quizCount || 0))
  });
});



export const saveQuizResult = async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      quizId, 
      quizTitle, 
      score, 
      totalQuestions, 
      timeTaken, 
      questions, // Full list of questions
      userSelectedAnswers // List of user's selected indices (e.g. [0, 1, -1, 2])
    } = req.body;

    const percentage = totalQuestions > 0 ? (score / totalQuestions) * 100 : 0;

    const result = await prisma.quizResult.create({
      data: {
        userId,
        quizId: quizId ? parseInt(quizId) : null,
        quizTitle,
        score,
        totalQuestions,
        percentage,
        timeTaken,
        // Save the detailed history as JSON
        questionsJson: questions || [],
        userAnswersJson: userSelectedAnswers || [] 
      }
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Save Result Error:", error);
    res.status(500).json({ error: "Failed to save result" });
  }
};

