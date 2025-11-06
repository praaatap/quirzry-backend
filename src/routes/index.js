import express from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import challengeRoutes from "./challenge.routes.js";

const router = express.Router();

// --- Home Route ---
router.get("/", (req, res) => {
  res.json({
    message: "🚀 Quirzy API Server Running!",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    // ... (you can keep your endpoints list here)
  });
});

// --- Mount Routers ---
router.use("/", authRoutes);
router.use("/", userRoutes);
router.use("/challenge", challengeRoutes);

export default router;