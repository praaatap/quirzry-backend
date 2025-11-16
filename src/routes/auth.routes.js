import express from "express";
import {
  signup,
  signin,
  googleAuth,
  saveFcmToken,
  resetPassword,
  verifyToken,
} from "../controllers/auth.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
// No authentication required

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/auth/google-auth", googleAuth);
router.post("/reset-password", resetPassword);

// ==================== PROTECTED ROUTES ====================
// Require valid JWT token

// ✅ NEW: Token verification endpoint
router.get("/auth/verify", authenticateToken, verifyToken);

// Save FCM token for push notifications
router.post("/auth/save-token", authenticateToken, saveFcmToken);

export default router;
