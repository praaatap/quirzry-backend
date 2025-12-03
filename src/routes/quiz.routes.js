import express from "express";
import { 
  generateQuiz, 
  getMyQuizzes, 
  getQuiz, 
  deleteQuiz,
  getQuizCount,
  resetQuizCount,
  getMyQuizResults,
  saveQuizResult // Ensure this is imported
} from "../controllers/quiz.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply auth middleware to all routes below
router.use(authenticateToken);

// --- Quiz Generation & Management ---
router.post("/generate", generateQuiz);
router.get("/my-quizzes", getMyQuizzes);

// --- Quiz Counters ---
router.get("/count/total", getQuizCount);
router.post("/count/reset", resetQuizCount);

// --- Results & History ---
// FIX: Map POST to saveQuizResult, not getMyQuizResults
router.post("/result", saveQuizResult); 

// FIX: Specific route BEFORE dynamic ID route
router.get("/results", getMyQuizResults);

// --- Dynamic ID Route (Must be last) ---
router.get("/:quizId", getQuiz);
router.delete("/:quizId", deleteQuiz);

export default router;