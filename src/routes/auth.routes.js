import express from "express";
import {
  signup,
  signin,
  googleAuth,
  saveFcmToken,
  resetPassword,
} from "../controllers/auth.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- Public Routes ---
router.post("/signup", signup);
router.post("/signin", signin);
router.post("/auth/google-auth", googleAuth);
router.post("/reset-password", resetPassword);

// --- Protected Routes ---
router.post("/auth/save-token", authenticateToken, saveFcmToken);

export default router;