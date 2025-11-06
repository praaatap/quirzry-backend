import express from "express";
import {
  getAllUsers,
  searchUsers,
} from "../controllers/user.controller.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All user routes are protected
router.use(authenticateToken);

router.get("/users", getAllUsers);
router.get("/search-users", searchUsers);

export default router;