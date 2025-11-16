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


