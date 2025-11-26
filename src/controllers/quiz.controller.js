import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateQuizPrompt } from "../prompts/quizGenrationPrompt.js";

const GEMINI_KEY='AIzaSyBdFlmixwotYjNoE1RvNetnnFkN6Llynl0';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI("AIzaSyC7e42D3PNt-rNn-KpZNkT4wwlar0imOyA");
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  },
});

// Helper: safely extract text from the model result
async function extractTextFromResult(result) {
  // Some SDKs return result.response.text() as a function that returns a Promise,
  // others return a string directly. Handle both.
  try {
    const response = result?.response;
    if (!response) {
      // If SDK returns top-level string or object, try to stringify
      if (typeof result === "string") return result;
      return JSON.stringify(result);
    }

    if (typeof response.text === "function") {
      // async text() function
      return await response.text();
    }

    // If response is a string already
    if (typeof response === "string") return response;

    // Otherwise stringify the response object
    return JSON.stringify(response);
  } catch (err) {
    // fallback
    console.warn("Failed to extract text from result, falling back to JSON stringify", err);
    try {
      return JSON.stringify(result);
    } catch (e) {
      return String(result);
    }
  }
}

// ==================== GENERATE QUIZ WITH GEMINI AI ====================
export const generateQuiz = asyncHandler(async (req, res) => {
  const { topic, questionCount = 15 } = req.body;
  const userId = req.userId;

  // Validation
  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const validQuestionCount = Math.min(Math.max(parseInt(questionCount, 10) || 15, 10), 50);

  console.log(`🎯 Generating ${validQuestionCount} questions on: ${topic} for user ${userId}`);

  try {
    // Generate prompt for Gemini
    const prompt = generateQuizPrompt(topic, validQuestionCount, "medium");

    console.log("🤖 Calling Gemini AI...");

    // Call Gemini AI API
    const result = await model.generateContent(prompt);
    const text = await extractTextFromResult(result);

    console.log("✅ Gemini response received");
    console.log("📄 Raw response length:", text ? text.length : 0);

    // Parse and validate the response
    let quizData;
    try {
      // Clean the response text (remove markdown code fences if present)
      let cleanedText = (text || "").trim();

      // Remove leading ```json or ``` code fences and trailing ``` fences
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

      // If cleanedText looks like JSON already, parse. Otherwise attempt to find JSON substring.
      // First attempt: direct parse
      try {
        quizData = JSON.parse(cleanedText);
      } catch (firstParseErr) {
        // Try to find the first { ... } JSON block in the cleanedText
        const firstBrace = cleanedText.indexOf("{");
        const lastBrace = cleanedText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const jsonSubstring = cleanedText.substring(firstBrace, lastBrace + 1);
          quizData = JSON.parse(jsonSubstring);
        } else {
          throw firstParseErr;
        }
      }

      // Validate structure
      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error("Invalid response structure: missing questions array");
      }

      if (quizData.questions.length === 0) {
        throw new Error("No questions generated");
      }

      console.log(`✅ Parsed ${quizData.questions.length} questions`);
    } catch (parseError) {
      console.error("❌ Failed to parse Gemini response:", parseError.message);
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
        // Validate question structure
        if (!q || typeof q !== "object") {
          throw new Error(`Invalid question object at index ${i}`);
        }

        if (!q.questionText || typeof q.questionText !== "string") {
          throw new Error(`Invalid questionText at index ${i}`);
        }

        if (!q.options || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new Error(`Invalid options at index ${i} — expected 4 options`);
        }

        // Handle correctAnswer as either index (number) or value (string)
        let correctAnswerIndex;
        if (typeof q.correctAnswer === "number") {
          correctAnswerIndex = q.correctAnswer;
        } else if (typeof q.correctAnswer === "string") {
          // Find the index of the correct answer in options
          correctAnswerIndex = q.options.indexOf(q.correctAnswer);
          if (correctAnswerIndex === -1) {
            // Try a trimmed compare
            const trimmedMatch = q.options.map((o) => String(o).trim()).indexOf(q.correctAnswer.trim());
            if (trimmedMatch === -1) {
              throw new Error(`correctAnswer "${q.correctAnswer}" not found in options at index ${i}`);
            }
            correctAnswerIndex = trimmedMatch;
          }
        } else {
          throw new Error(`Invalid correctAnswer type at index ${i}`);
        }

        // Validate index is in range
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

    // Return response
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

    // Handle specific error types
    if (error.message?.includes("API key")) {
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

  // Check if quiz exists and belongs to user
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

  // Delete quiz (questions will be cascaded)
  await prisma.quiz.delete({
    where: {
      id: parseInt(quizId, 10),
    },
  });

  console.log(`✅ Quiz deleted: ${quizId}`);

  res.json({ message: "Quiz deleted successfully" });
});
// ==================== RESET QUIZ COUNT (FOR TESTING) ====================
export const resetQuizCount = asyncHandler(async (req, res) => {
  const userId = req.userId;

  console.log(`🔄 Resetting quiz count for user ${userId}`);

  await prisma.user.update({
    where: { id: userId },
    data: { quizCount: 0 }
  });

  console.log(`✅ Quiz count reset to 0 for user ${userId}`);

  res.json({
    success: true,
    message: "Quiz count reset successfully",
    quizCount: 0
  });
});

export const getQuizCount = asyncHandler(async (req, res) => {
  const userId = req.userId;

  console.log(`📊 Fetching quiz count for user ${userId}`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      quizCount: true,
      name: true,
      email: true 
    }
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  console.log(`✅ Quiz count: ${user.quizCount || 0}`);

  res.json({
    success: true,
    quizCount: user.quizCount || 0,
    shouldShowAd: (user.quizCount || 0) >= 1, // First quiz is free
    remainingFreeQuizzes: Math.max(0, 1 - (user.quizCount || 0))
  });
});
