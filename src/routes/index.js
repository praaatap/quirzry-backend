import express from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import challengeRoutes from "./challenge.routes.js";
import quizRoutes from './quiz.routes.js';
import settingsRoutes from './settings.routes.js';
import flashcardRoutes from './flashcard.routes.js';
import studyRoutes from './study.routes.js';

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
      flashcards: "/api/flashcards/*",
      settings: "/api/settings/*",
      study: "/api/study/*",
    },
  });
});

// --- Mount Routers ---
router.use("/", authRoutes);
router.use("/", userRoutes);
router.use("/challenges", challengeRoutes);
router.use("/quiz", quizRoutes);
router.use("/flashcards", flashcardRoutes);
router.use("/", settingsRoutes); 
router.use("/study", studyRoutes); 

export default router;

