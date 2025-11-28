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

// Download user data
export const downloadUserData = async (req, res) => {
  try {
    const userId = parseInt(req.user.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        quizResults: {
          orderBy: { createdAt: 'desc' },
        },
        settings: true,
        quizzes: {
          include: {
            questions: true,
          },
        },
        sentChallenges: true,
        receivedChallenges: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userData = {
      profile: {
        name: user.name,
        email: user.email,
        quizCount: user.quizCount,
        createdAt: user.createdAt,
      },
      settings: user.settings,
      quizHistory: user.quizResults,
      createdQuizzes: user.quizzes,
      challenges: {
        sent: user.sentChallenges,
        received: user.receivedChallenges,
      },
      statistics: {
        totalQuizzes: user.quizResults.length,
        averageScore: user.quizResults.length > 0
          ? user.quizResults.reduce((sum, result) => sum + result.percentage, 0) / user.quizResults.length
          : 0,
      },
    };

    res.status(200).json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("Error downloading data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download data",
      error: error.message,
    });
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
