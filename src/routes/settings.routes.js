import express from "express";
import {
  getUserSettings,
  updateUserSettings,
  clearQuizHistory,
  downloadUserData,
  deleteUserAccount,
  getUserStatistics,
} from "../controllers/settings.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Settings routes
router.get("/settings", getUserSettings);
router.put("/settings", updateUserSettings);

// Statistics route
router.get("/settings/statistics", getUserStatistics);

// Data management routes
router.delete("/settings/clear-history", clearQuizHistory);
router.get("/settings/download-data", downloadUserData);
router.delete("/settings/delete-account", deleteUserAccount);

export default router;
