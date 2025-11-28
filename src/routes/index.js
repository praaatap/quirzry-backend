import express from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import challengeRoutes from "./challenge.routes.js";
import quizRoutes from './quiz.routes.js';
import settingsRoutes from './settings.routes.js'; // ADD THIS

const router = express.Router();

// --- Home Route ---
router.get("/", (req, res) => {
  res.json({
    message: "🚀 Quirzy API Server Running!",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth/*",
      users: "/api/users",
      challenges: "/api/challenges/*",
      quiz: "/api/quiz/*",
      settings: "/api/settings/*", // Document the new endpoint
    },
  });
});

// --- Mount Routers ---
router.use("/", authRoutes);
router.use("/", userRoutes);
router.use("/challenges", challengeRoutes);
router.use("/quiz", quizRoutes);
router.use("/", settingsRoutes); 

export default router;
