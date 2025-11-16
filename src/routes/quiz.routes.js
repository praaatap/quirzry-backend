import express from "express";
import { generateQuiz, getMyQuizzes } from "../controllers/quiz.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

router.post("/generate", generateQuiz);
router.get("/my-quizzes", getMyQuizzes);

export default router;
