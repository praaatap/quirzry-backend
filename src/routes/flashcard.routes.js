import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
  generateFlashcards,
  getMyFlashcardSets,
  getFlashcardSet,
  deleteFlashcardSet,
  updateCardProgress
} from "../controllers/flashcard.controller.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Generate new flashcard set
router.post("/generate", generateFlashcards);

// Get user's flashcard sets
router.get("/sets", getMyFlashcardSets);

// Get single flashcard set
router.get("/sets/:setId", getFlashcardSet);

// Delete flashcard set
router.delete("/sets/:setId", deleteFlashcardSet);

// Update card study progress
router.patch("/cards/:cardId/progress", updateCardProgress);

export default router;
