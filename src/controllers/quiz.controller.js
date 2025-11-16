import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

export const generateQuiz = asyncHandler(async (req, res) => {
  const { topic, questionCount = 10 } = req.body;
  const userId = req.userId;

  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  console.log(`🎯 Generating quiz on topic: ${topic} for user ${userId}`);

  try {
    // TODO: Integrate with Gemini AI here
    // For now, return mock data
    const mockQuestions = generateMockQuestions(topic, questionCount);

    // Save quiz to database
    const quiz = await prisma.quiz.create({
      data: {
        title: `${topic} Quiz`,
        userId,
        questions: {
          create: mockQuestions.map((q, index) => ({
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            questionNumber: index + 1,
          })),
        },
      },
      include: {
        questions: true,
      },
    });

    console.log(`✅ Quiz generated successfully: ID ${quiz.id}`);

    res.json({
      title: quiz.title,
      questions: quiz.questions.map(q => ({
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
      })),
    });
  } catch (error) {
    console.error('❌ Quiz generation error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

export const getMyQuizzes = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const quizzes = await prisma.quiz.findMany({
    where: { userId },
    include: {
      questions: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 20, // Limit to 20 most recent
  });

  res.json({
    quizzes: quizzes.map(q => ({
      id: q.id,
      title: q.title,
      createdAt: q.createdAt,
      questionCount: q.questions.length,
    })),
  });
});

// Mock question generator (replace with Gemini AI later)
function generateMockQuestions(topic, count) {
  const questions = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    questions.push({
      questionText: `Question ${i + 1} about ${topic}?`,
      options: [
        `Answer A for ${topic}`,
        `Answer B for ${topic}`,
        `Answer C for ${topic}`,
        `Answer D for ${topic}`,
      ],
      correctAnswer: Math.floor(Math.random() * 4),
    });
  }
  return questions;
}
