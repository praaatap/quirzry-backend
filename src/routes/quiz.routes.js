import express from "express";
import { 
  generateQuiz, 
  getMyQuizzes, 
  getQuiz, 
  deleteQuiz,
  getQuizCount,
  resetQuizCount 
} from "../controllers/quiz.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/generate", generateQuiz);
router.get("/my-quizzes", getMyQuizzes);
router.get("/:quizId", getQuiz);
router.delete("/:quizId", deleteQuiz);


router.get("/count/total", getQuizCount);
router.post("/count/reset", resetQuizCount);

export default router;
