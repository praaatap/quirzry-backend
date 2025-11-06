import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import prisma from "./config/prisma.js";
import logger from "./middleware/loggerMiddleware.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errorMiddleware.js";
import mainRouter from "./routes/index.js";

// Initialize environment variables
dotenv.config();

// Initialize Firebase Admin (it's imported in config/firebase.js)
import "./config/firebase.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== GLOBAL MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(logger);

// ==================== ROUTES ====================
app.use("/", mainRouter);

// ==================== ERROR HANDLERS ====================
// Handle 404 (Not Found) - Must be after routes
app.use(notFoundHandler);

// Global Error Handler - Must be last middleware
app.use(errorHandler);

// ==================== START SERVER ====================
const server = app.listen(PORT, () => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 API URL: http://localhost:${PORT}`);
  console.log(`🕐 Started at: ${new Date().toLocaleString()}`);
  console.log(`${"=".repeat(50)}\n`);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down...`);
  server.close(async () => {
    console.log("✅ HTTP server closed");
    await prisma.$disconnect();
    console.log("✅ Database disconnected");
    process.exit(0);
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));