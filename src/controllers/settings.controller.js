import prisma from "../config/prisma.js";

// Get user settings
export const getUserSettings = async (req, res) => {
  try {
    const userId = req.user.userId; // This should be the numeric id from JWT

    let settings = await prisma.userSettings.findUnique({
      where: { userId: parseInt(userId) },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId: parseInt(userId),
          notificationsEnabled: true,
          emailNotifications: true,
          soundEnabled: true,
          darkMode: false,
          language: 'English',
          autoSaveProgress: true,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

// Update user settings
export const updateUserSettings = async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const {
      notificationsEnabled,
      emailNotifications,
      soundEnabled,
      darkMode,
      language,
      autoSaveProgress,
    } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        notificationsEnabled,
        emailNotifications,
        soundEnabled,
        darkMode,
        language,
        autoSaveProgress,
      },
      create: {
        userId,
        notificationsEnabled: notificationsEnabled ?? true,
        emailNotifications: emailNotifications ?? true,
        soundEnabled: soundEnabled ?? true,
        darkMode: darkMode ?? false,
        language: language ?? 'English',
        autoSaveProgress: autoSaveProgress ?? true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message,
    });
  }
};

// Clear quiz history
export const clearQuizHistory = async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);

    const result = await prisma.quizResult.deleteMany({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      message: "Quiz history cleared successfully",
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("Error clearing history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear history",
      error: error.message,
    });
  }
};


// download user data
export const downloadUserData = async (req, res) => {
  try {
    // We rely on auth middleware to set numeric DB id on req.userId
    const userId = req.userId ?? (req.user && req.user.id) ?? null;
    console.log("downloadUserData -> req.userId:", userId);

    if (!userId) {
      return res.status(401).json({ error: "Unauthenticated: userId not found on request" });
    }

    // Fetch user and related data using relation names from your Prisma schema
    const userData = await prisma.user.findUnique({
      where: { id: Number(userId) },
      include: {
        settings: true,              // UserSettings?
        quizResults: true,           // QuizResult[]
        quizzes: true,               // Quiz[]
        sentChallenges: true,        // Challenge[] (as challenger)
        receivedChallenges: true,    // Challenge[] (as opponent)
      },
    });

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // Build export payload (defensive about missing fields)
    const exportData = {
      exportDate: new Date().toISOString(),
      profile: {
        id: userData.id,
        name: userData.name ?? null,
        email: userData.email ?? null,
        joined: userData.createdAt ?? null,
      },
      settings: userData.settings ?? null,
      quizHistory: Array.isArray(userData.quizResults)
        ? userData.quizResults.map(r => ({
            id: r.id,
            quizTitle: r.quizTitle ?? null,   // stored on QuizResult
            score: r.score ?? null,
            totalQuestions: r.totalQuestions ?? null,
            percentage: r.percentage ?? null,
            timeTaken: r.timeTaken ?? null,
            date: r.createdAt ?? null,
          }))
        : [],
      createdQuizzes: Array.isArray(userData.quizzes)
        ? userData.quizzes.map(q => ({
            id: q.id,
            title: q.title,
            createdAt: q.createdAt,
            updatedAt: q.updatedAt,
          }))
        : [],
      sentChallenges: Array.isArray(userData.sentChallenges)
        ? userData.sentChallenges.map(c => ({
            id: c.id,
            opponentId: c.opponentId,
            status: c.status,
            quizId: c.quizId ?? null,
            createdAt: c.createdAt,
            expiresAt: c.expiresAt,
            acceptedAt: c.acceptedAt ?? null,
          }))
        : [],
      receivedChallenges: Array.isArray(userData.receivedChallenges)
        ? userData.receivedChallenges.map(c => ({
            id: c.id,
            challengerId: c.challengerId,
            status: c.status,
            quizId: c.quizId ?? null,
            createdAt: c.createdAt,
            expiresAt: c.expiresAt,
            acceptedAt: c.acceptedAt ?? null,
          }))
        : [],
    };

    // Send downloadable JSON
    const fileName = `quirzy_export_user_${userData.id}_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error("downloadUserData - unexpected error:", error);
    return res.status(500).json({ error: "Failed to generate data export", detail: String(error) });
  }
};

// Delete user account
export const deleteUserAccount = async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);
    const { confirmEmail } = req.body;

    // Get user to verify email
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify email confirmation
    if (confirmEmail !== user.email) {
      return res.status(400).json({
        success: false,
        message: "Email confirmation does not match",
      });
    }

    // Delete all user data in a transaction
    await prisma.$transaction([
      prisma.userSettings.deleteMany({ where: { userId } }),
      prisma.quizResult.deleteMany({ where: { userId } }),
      prisma.question.deleteMany({
        where: {
          quiz: { userId },
        },
      }),
      prisma.quiz.deleteMany({ where: { userId } }),
      prisma.challenge.deleteMany({
        where: {
          OR: [
            { challengerId: userId },
            { opponentId: userId },
          ],
        },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    });
  }
};

// Get user statistics
export const getUserStatistics = async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);

    const [totalQuizzes, quizResults, perfectScores] = await Promise.all([
      prisma.quiz.count({ where: { userId } }),
      prisma.quizResult.findMany({ where: { userId } }),
      prisma.quizResult.count({
        where: {
          userId,
          percentage: 100,
        },
      }),
    ]);

    const averageScore = quizResults.length > 0
      ? quizResults.reduce((sum, result) => sum + result.percentage, 0) / quizResults.length
      : 0;

    const totalPoints = quizResults.reduce((sum, result) => sum + result.score, 0);

    res.status(200).json({
      success: true,
      data: {
        totalQuizzes: quizResults.length,
        averageScore: Math.round(averageScore),
        perfectScores,
        totalPoints,
        createdQuizzes: totalQuizzes,
      },
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};