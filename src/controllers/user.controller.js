import prisma from "../config/prisma.js";
import asyncHandler from "../middleware/asyncHandler.js";

// --- Get All Users (for testing) ---
export const getAllUsers = asyncHandler(async (req, res) => {
  console.log("📋 Fetching all users");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log(`✅ Found ${users.length} users`);
  res.json(users);
});

// --- Search Users ---
export const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const currentUserId = req.userId; // From authenticateToken middleware

  console.log(`🔍 Search query: "${q}" by user ID: ${currentUserId}`);

  if (!q || q.trim() === "") {
    console.log("❌ Empty search query");
    return res.status(400).json({ error: "Search query (q) is required" });
  }

  const searchTerm = q.trim();
  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { email: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        {
          id: { not: currentUserId },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    take: 10,
    orderBy: {
      name: "asc",
    },
  });

  console.log(`✅ Found ${users.length} users matching "${searchTerm}"`);
  users.forEach((user) => {
    console.log(`   - ${user.name} (${user.email})`);
  });

  res.json({ users });
});


export const downloadUserData = async (req, res) => {
  try {
    // 1. Get the user ID from the authenticated request
    const userId = req.user.uid;

    if (!userId) {
      return res.status(400).json({ error: "User ID not found" });
    }

    // 2. Fetch all related user data
    // We use 'include' to fetch relations like quizzes they created or results they achieved
    const userData = await prisma.user.findUnique({
      where: { firebaseUid: userId },
      include: {
        stats: true,     // User statistics
        results: {       // Quiz results history
          include: {
            quiz: {
              select: { title: true, category: true }
            }
          }
        },
        quizzes: true,   // Quizzes created by this user
      },
    });

    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // 3. Format the data for export (remove sensitive hash/internal IDs if needed)
    const exportData = {
      exportDate: new Date().toISOString(),
      profile: {
        name: userData.name,
        email: userData.email,
        joined: userData.createdAt,
      },
      statistics: userData.stats,
      quizHistory: userData.results.map(r => ({
        quiz: r.quiz.title,
        category: r.quiz.category,
        score: r.score,
        date: r.completedAt,
      })),
      createdQuizzes: userData.quizzes,
    };

    // 4. Send the file
    // Set headers to trigger a file download on the client
    const fileName = `quirzy_export_${Date.now()}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    
    // Send the JSON string
    return res.status(200).send(JSON.stringify(exportData, null, 2));

  } catch (error) {
    console.error("Export data error:", error);
    return res.status(500).json({ error: "Failed to generate data export" });
  }
};