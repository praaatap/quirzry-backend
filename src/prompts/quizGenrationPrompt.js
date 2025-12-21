// quizController.js
import { Groq } from "groq-sdk";
import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

// Initialize Groq client (Lazy Load to avoid crash before env loads)
let groq;
function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }
  if (!groq) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }
  return groq;
}

/**
 * Helper: safely extract text from the model result (adapted for groq SDK shapes)
 */
async function extractTextFromResult(result) {
  try {
    if (!result) return "";

    // Common groq response shape: result.choices[0].message.content (string)
    const choice = result.choices && result.choices[0];
    if (choice) {
      if (choice.message && typeof choice.message.content === "string") {
        return choice.message.content;
      }
      if (choice.delta && typeof choice.delta.content === "string") {
        return choice.delta.content;
      }
      if (typeof choice.text === "string") {
        return choice.text;
      }
    }

    // Top-level fallbacks
    if (typeof result.text === "string") return result.text;
    if (typeof result.content === "string") return result.content;

    // Last fallback: stringify
    return JSON.stringify(result);
  } catch (err) {
    console.warn("Failed to extract text from result, falling back to JSON stringify", err);
    try {
      return JSON.stringify(result);
    } catch (e) {
      return String(result);
    }
  }
}

/**
 * Generate optimized prompt for quiz generation
 * (Same strict JSON-only spec your original code used)
 */
export const generateQuizPrompt = (topic, questionCount, difficulty) => {
  const difficultyDescriptions = {
    easy: 'suitable for beginners with basic knowledge. Questions should be straightforward with clear answers.',
    medium: 'suitable for intermediate learners with some experience. Questions should require understanding and application of concepts.',
    hard: 'suitable for advanced learners with deep understanding. Questions should be challenging and require critical thinking.'
  };

  const difficultyExamples = {
    easy: `Example: "What does HTML stand for?"`,
    medium: `Example: "How does the JavaScript event loop handle asynchronous operations?"`,
    hard: `Example: "Explain the implications of using WeakMap versus Map in terms of garbage collection and memory management."`
  };

  return `You are an expert educational quiz generator with deep knowledge across multiple subjects. Generate a high-quality, pedagogically sound quiz based on the following specifications:

**QUIZ SPECIFICATIONS**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Topic: ${topic}
• Number of Questions: ${questionCount}
• Difficulty Level: ${difficulty.toUpperCase()}
  └─ ${difficultyDescriptions[difficulty]}
  └─ ${difficultyExamples[difficulty]}

**QUESTION REQUIREMENTS**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ✅ Each question must be clear, specific, and educational
2. ✅ Each question must have exactly 4 distinct options (A, B, C, D)
3. ✅ Only ONE option should be definitively correct
4. ✅ All options must be plausible and relevant (avoid obviously wrong answers)
5. ✅ Questions should test ${difficulty === 'easy' ? 'basic recall and understanding' : difficulty === 'medium' ? 'application and analysis' : 'synthesis and evaluation'}
6. ✅ Use proper grammar, punctuation, and formatting
7. ✅ Questions should progressively cover different aspects of the topic
8. ✅ Avoid ambiguous or trick questions
9. ✅ Options should be similar in length and complexity
10. ✅ Distribute correct answers evenly across all positions (0, 1, 2, 3)

**CONTENT GUIDELINES**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Focus on practical, real-world applications when possible
• Include diverse question types: definitions, applications, comparisons, scenarios
• Ensure factual accuracy and up-to-date information
• Make questions engaging and thought-provoking
• Avoid cultural bias or assumptions

**OUTPUT FORMAT** (CRITICAL - STRICT JSON ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON in this exact format:

{
  "questions": [
    {
      "questionText": "Your well-crafted question here?",
      "options": [
        "First option",
        "Second option",
        "Third option",
        "Fourth option"
      ],
      "correctAnswer": 2
    }
  ]
}

**CRITICAL RULES**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  "correctAnswer" MUST be an INTEGER (0, 1, 2, or 3) representing the index
⚠️  DO NOT include markdown code blocks (\`\`\`json or \`\`\`)
⚠️  DO NOT include any explanatory text before or after the JSON
⚠️  DO NOT include explanations for answers
⚠️  Ensure all strings are properly escaped
⚠️  Return ONLY the raw JSON object

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generate exactly ${questionCount} questions now following all requirements above.`;
};

/**
 * Simple fallback prompt (not strictly necessary but kept for robustness)
 */
export const generateSimpleQuizPrompt = (topic, questionCount, difficulty) => {
  return `Generate a ${difficulty} difficulty quiz about "${topic}" with ${questionCount} questions.

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "questionText": "Question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": 0
    }
  ]
}

Rules:
- correctAnswer must be 0, 1, 2, or 3
- No markdown formatting
- No explanations`;
};

// ==================== GENERATE QUIZ USING Llama (via Groq) ====================
export const generateQuiz = asyncHandler(async (req, res) => {
  const { topic, questionCount = 15, difficulty = "medium" } = req.body;
  const userId = req.userId;

  // Validation
  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const validQuestionCount = Math.min(Math.max(parseInt(questionCount, 10) || 15, 10), 50);

  console.log(`🎯 Generating ${validQuestionCount} questions on: ${topic} for user ${userId}`);

  try {
    // Build prompt
    const prompt = generateQuizPrompt(topic, validQuestionCount, difficulty);

    console.log("🤖 Calling Llama (via Groq)...");
    // Call Groq chat completion using Llama instant model
    const result = await getGroqClient().chat.completions.create({
      model: process.env.LLAMA_MODEL_NAME || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: "You are a high-quality JSON-only quiz generator. Return only valid JSON following the spec." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      top_p: 0.95,
      max_completion_tokens: 8192,
      // stream: false  // leave false for synchronous response; if you prefer streaming set true and handle chunks
    });

    const text = await extractTextFromResult(result);

    console.log("✅ Llama (Groq) response received");
    console.log("📄 Raw response length:", text ? text.length : 0);

    // ---------- Parsing and validation ----------
    let quizData;
    try {
      let cleanedText = (text || "").trim();

      // Remove code fences if present
      if (cleanedText.startsWith("```json")) {
        cleanedText = cleanedText.replace(/^```json\n?/g, "");
      }
      if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.replace(/^```\n?/g, "");
      }
      if (cleanedText.endsWith("```")) {
        cleanedText = cleanedText.replace(/\n?```$/g, "");
      }

      cleanedText = cleanedText.trim();

      // Try direct parse, then fallback to extracting first JSON block
      try {
        quizData = JSON.parse(cleanedText);
      } catch (firstParseErr) {
        const firstBrace = cleanedText.indexOf("{");
        const lastBrace = cleanedText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonSubstring = cleanedText.substring(firstBrace, lastBrace + 1);
          quizData = JSON.parse(jsonSubstring);
        } else {
          throw firstParseErr;
        }
      }

      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error("Invalid response structure: missing questions array");
      }
      if (quizData.questions.length === 0) {
        throw new Error("No questions generated");
      }

      console.log(`✅ Parsed ${quizData.questions.length} questions`);
    } catch (parseError) {
      console.error("❌ Failed to parse model response:", parseError.message);
      console.error("Raw response (first 1000 chars):", (text || "").substring(0, 1000));
      return res.status(500).json({
        error: "Failed to generate valid quiz questions. Please try again.",
        details: process.env.NODE_ENV === "development" ? parseError.message : undefined,
      });
    }

    // Validate and clean each question
    const validatedQuestions = [];
    for (let i = 0; i < quizData.questions.length; i++) {
      const q = quizData.questions[i];
      try {
        if (!q || typeof q !== "object") {
          throw new Error(`Invalid question object at index ${i}`);
        }
        if (!q.questionText || typeof q.questionText !== "string") {
          throw new Error(`Invalid questionText at index ${i}`);
        }
        if (!q.options || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error(`Invalid options at index ${i} — expected 4 options`);
        }

        let correctAnswerIndex;
        if (typeof q.correctAnswer === "number") {
          correctAnswerIndex = q.correctAnswer;
        } else if (typeof q.correctAnswer === "string") {
          correctAnswerIndex = q.options.indexOf(q.correctAnswer);
          if (correctAnswerIndex === -1) {
            const trimmedMatch = q.options.map((o) => String(o).trim()).indexOf(q.correctAnswer.trim());
            if (trimmedMatch === -1) {
              throw new Error(`correctAnswer "${q.correctAnswer}" not found in options at index ${i}`);
            }
            correctAnswerIndex = trimmedMatch;
          }
        } else {
          throw new Error(`Invalid correctAnswer type at index ${i}`);
        }

        if (typeof correctAnswerIndex !== "number" || correctAnswerIndex < 0 || correctAnswerIndex > 3) {
          throw new Error(`correctAnswer index out of range at index ${i}`);
        }

        validatedQuestions.push({
          questionText: q.questionText.trim(),
          options: q.options.map((opt) => String(opt).trim()),
          correctAnswer: correctAnswerIndex,
        });
      } catch (validationError) {
        console.warn(`⚠️ Skipping invalid question ${i}:`, validationError.message);
        continue;
      }
    }

    if (validatedQuestions.length === 0) {
      return res.status(500).json({
        error: "No valid questions could be generated. Please try again.",
      });
    }

    console.log(`✅ Validated ${validatedQuestions.length} questions`);

    // Save quiz to database
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
        questions: {
          orderBy: {
            questionNumber: "asc",
          },
        },
      },
    });

    console.log(`✅ Quiz saved to database: ID ${quiz.id}`);

    res.status(201).json({
      quizId: quiz.id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      questions: quiz.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        questionNumber: q.questionNumber,
      })),
    });
  } catch (error) {
    console.error("❌ Quiz generation error:", error);
    console.error("❌ Error stack:", error?.stack);

    if (error.message?.includes("API key") || error.message?.includes("api key")) {
      return res.status(500).json({
        error: "API configuration error. Please contact support.",
      });
    }

    if (error.message?.includes("quota")) {
      return res.status(429).json({
        error: "Service temporarily unavailable. Please try again later.",
      });
    }

    return res.status(500).json({
      error: "Failed to generate quiz. Please try again.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// ==================== GET MY QUIZZES ====================
export const getMyQuizzes = asyncHandler(async (req, res) => {
  const userId = req.userId;
  console.log(`📋 Fetching quizzes for user ${userId}`);

  const quizzes = await prisma.quiz.findMany({
    where: { userId },
    include: {
      questions: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  console.log(`✅ Found ${quizzes.length} quizzes`);

  res.json({
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      createdAt: q.createdAt,
      questionCount: q.questions.length,
    })),
  });
});

// ==================== GET SPECIFIC QUIZ ====================
export const getQuiz = asyncHandler(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.userId;

  console.log(`📖 Fetching quiz ${quizId} for user ${userId}`);

  const quiz = await prisma.quiz.findFirst({
    where: {
      id: parseInt(quizId, 10),
      userId,
    },
    include: {
      questions: {
        orderBy: {
          questionNumber: "asc",
        },
      },
    },
  });

  if (!quiz) {
    console.log("❌ Quiz not found");
    return res.status(404).json({ error: "Quiz not found" });
  }

  console.log(`✅ Quiz found: ${quiz.title}`);

  res.json({
    id: quiz.id,
    title: quiz.title,
    createdAt: quiz.createdAt,
    questionCount: quiz.questions.length,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      questionNumber: q.questionNumber,
    })),
  });
});

// ==================== DELETE QUIZ ====================
export const deleteQuiz = asyncHandler(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.userId;

  console.log(`🗑️ Deleting quiz ${quizId} for user ${userId}`);

  const quiz = await prisma.quiz.findFirst({
    where: {
      id: parseInt(quizId, 10),
      userId,
    },
  });

  if (!quiz) {
    console.log("❌ Quiz not found");
    return res.status(404).json({ error: "Quiz not found" });
  }

  await prisma.quiz.delete({
    where: {
      id: parseInt(quizId, 10),
    },
  });

  console.log(`✅ Quiz deleted: ${quizId}`);

  res.json({ message: "Quiz deleted successfully" });
});
