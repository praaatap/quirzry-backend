import express from "express";
import { generateStudySet } from "../controllers/study.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authenticateToken);

router.post("/generate", generateStudySet);

export default router;
