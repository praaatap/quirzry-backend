import prisma from "../config/prisma.js";
import firebaseAdmin from "../config/firebase.js";
import asyncHandler from "../middleware/asyncHandler.js";

// --- Send Challenge ---
export const sendChallenge = asyncHandler(async (req, res) => {
  const { opponentId, quizId } = req.body;
  const challengerId = req.userId;

  console.log(`⚔️ Challenge request from user ${challengerId} to ${opponentId}`);

  if (!opponentId) {
    console.log("❌ No opponent ID provided");
    return res.status(400).json({ error: "Opponent ID is required" });
  }

  const opponent = await prisma.user.findUnique({
    where: { id: parseInt(opponentId) },
    select: { id: true, name: true, fcmToken: true },
  });

  if (!opponent) {
    console.log("❌ Opponent not found");
    return res.status(404).json({ error: "Opponent not found" });
  }

  const challenger = await prisma.user.findUnique({
    where: { id: challengerId },
    select: { id: true, name: true },
  });

  if (quizId) {
    const quiz = await prisma.quiz.findUnique({
      where: { id: parseInt(quizId) },
    });
    if (!quiz) {
      console.log("❌ Quiz not found");
      return res.status(404).json({ error: "Quiz not found" });
    }
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const challenge = await prisma.challenge.create({
    data: {
      challengerId,
      opponentId: parseInt(opponentId),
      quizId: quizId ? parseInt(quizId) : null,
      expiresAt,
    },
  });

  console.log(`✅ Challenge created: ID ${challenge.id}`);

  // Send FCM notification
  if (opponent.fcmToken && firebaseAdmin.apps.length > 0) {
    try {
      const message = {
        data: {
          type: "challenge_invite",
          challengeId: challenge.id.toString(),
          challengerName: challenger.name,
          challengerId: challengerId.toString(),
        },
        notification: {
          title: "🎯 New Challenge!",
          body: `${challenger.name} has challenged you to a quiz battle!`,
        },
        token: opponent.fcmToken,
      };
      await firebaseAdmin.messaging().send(message);
      console.log(`✅ Notification sent to ${opponent.name}`);
    } catch (error) {
      console.error("❌ Failed to send FCM notification:", error.message);
    }
  } else {
    console.log("⚠️ No FCM token or Firebase not initialized");
  }

  res.json({
    message: "Challenge sent successfully",
    challenge: {
      id: challenge.id,
      opponentName: opponent.name,
      expiresAt: challenge.expiresAt,
    },
  });
});

// --- Get Challenge Status ---
export const getChallengeStatus = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.userId;

  console.log(`📊 Getting challenge ${challengeId} for user ${userId}`);

  const challenge = await prisma.challenge.findFirst({
    where: {
      id: parseInt(challengeId),
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    include: {
      challenger: { select: { id: true, name: true, email: true } },
      opponent: { select: { id: true, name: true, email: true } },
    },
  });

  if (!challenge) {
    console.log("❌ Challenge not found");
    return res.status(404).json({ error: "Challenge not found" });
  }

  console.log(`✅ Challenge found: ${challenge.status}`);
  res.json({ challenge });
});

// --- Accept Challenge ---
export const acceptChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.userId;

  console.log(`✅ Accept challenge ${challengeId} by user ${userId}`);

  const challenge = await prisma.challenge.findFirst({
    where: {
      id: parseInt(challengeId),
      opponentId: userId,
      status: "pending",
    },
    include: {
      challenger: { select: { name: true, fcmToken: true } },
    },
  });

  if (!challenge) {
    console.log("❌ Challenge not found or already accepted");
    return res
      .status(404)
      .json({ error: "Challenge not found or already accepted" });
  }

  if (new Date() > challenge.expiresAt) {
    await prisma.challenge.update({
      where: { id: parseInt(challengeId) },
      data: { status: "expired" },
    });
    console.log("❌ Challenge has expired");
    return res.status(400).json({ error: "Challenge has expired" });
  }

  const updatedChallenge = await prisma.challenge.update({
    where: { id: parseInt(challengeId) },
    data: { status: "accepted", acceptedAt: new Date() },
  });

  console.log(`✅ Challenge ${challengeId} accepted`);

  // Notify challenger
  if (challenge.challenger.fcmToken && firebaseAdmin.apps.length > 0) {
    try {
      const opponent = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const message = {
        data: {
          type: "challenge_accepted",
          challengeId: challenge.id.toString(),
          opponentName: opponent.name,
        },
        notification: {
          title: "✅ Challenge Accepted!",
          body: `${opponent.name} accepted your challenge. Game on!`,
        },
        token: challenge.challenger.fcmToken,
      };
      await firebaseAdmin.messaging().send(message);
      console.log(`✅ Acceptance notification sent`);
    } catch (error) {
      console.error("❌ Failed to send notification:", error.message);
    }
  }

  res.json({
    message: "Challenge accepted successfully",
    challenge: updatedChallenge,
  });
});

// --- Reject Challenge ---
export const rejectChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.userId;

  console.log(`❌ Reject challenge ${challengeId} by user ${userId}`);

  const challenge = await prisma.challenge.findFirst({
    where: {
      id: parseInt(challengeId),
      opponentId: userId,
      status: "pending",
    },
    include: {
      challenger: { select: { name: true, fcmToken: true } },
    },
  });

  if (!challenge) {
    console.log("❌ Challenge not found");
    return res.status(404).json({ error: "Challenge not found" });
  }

  await prisma.challenge.update({
    where: { id: parseInt(challengeId) },
    data: { status: "rejected" },
  });

  console.log(`✅ Challenge ${challengeId} rejected`);

  // Notify challenger
  if (challenge.challenger.fcmToken && firebaseAdmin.apps.length > 0) {
    try {
      const opponent = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      const message = {
        data: {
          type: "challenge_rejected",
          challengeId: challenge.id.toString(),
        },
        notification: {
          title: "❌ Challenge Declined",
          body: `${opponent.name} declined your challenge.`,
        },
        token: challenge.challenger.fcmToken,
      };
      await firebaseAdmin.messaging().send(message);
      console.log(`✅ Rejection notification sent`);
    } catch (error) {
      console.error("❌ Failed to send notification:", error.message);
    }
  }

  res.json({ message: "Challenge rejected" });
});

// --- Cancel Challenge ---
export const cancelChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const userId = req.userId;

  console.log(`🚫 Cancel challenge ${challengeId} by user ${userId}`);

  const challenge = await prisma.challenge.findFirst({
    where: {
      id: parseInt(challengeId),
      challengerId: userId,
      status: "pending",
    },
  });

  if (!challenge) {
    console.log("❌ Challenge not found or cannot be cancelled");
    return res
      .status(404)
      .json({ error: "Challenge not found or cannot be cancelled" });
  }

  await prisma.challenge.update({
    where: { id: parseInt(challengeId) },
    data: { status: "cancelled" },
  });

  console.log(`✅ Challenge ${challengeId} cancelled`);
  res.json({ message: "Challenge cancelled successfully" });
});

// --- Get My Challenges ---
export const getMyChallenges = asyncHandler(async (req, res) => {
  const userId = req.userId;
  console.log(`📋 Getting challenges for user ${userId}`);

  const challenges = await prisma.challenge.findMany({
    where: {
      OR: [{ challengerId: userId }, { opponentId: userId }],
    },
    include: {
      challenger: { select: { id: true, name: true, email: true } },
      opponent: { select: { id: true, name: true, email: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log(`✅ Found ${challenges.length} challenges`);
  res.json({ challenges });
});


