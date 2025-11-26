import express from "express";
import {
  sendChallenge,
  getChallengeStatus,
  acceptChallenge,
  rejectChallenge,
  cancelChallenge,
  getMyChallenges,
} from "../controllers/challenge.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All challenge routes require authentication
router.use(authenticateToken);

// ✅ Challenge routes (WITHOUT /challenges prefix)
router.post("/send", sendChallenge);                    // → /api/challenges/send
router.get("/my", getMyChallenges);                     // → /api/challenges/my
router.get("/:challengeId", getChallengeStatus);        // → /api/challenges/:id
router.post("/:challengeId/accept", acceptChallenge);   // → /api/challenges/:id/accept
router.post("/:challengeId/reject", rejectChallenge);   // → /api/challenges/:id/reject
router.post("/:challengeId/cancel", cancelChallenge);   // → /api/challenges/:id/cancel

export default router;
