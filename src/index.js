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

// Prometheus client
import client from "prom-client";

// Initialize environment variables
dotenv.config();

// Initialize Firebase Admin (imported in config/firebase.js)
import "./config/firebase.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/mobile-test',(req,res)=> {
  res.json({
    message:"Mobile test",
    data:{
     working:true 
    }
  })
})

// ==================== PROMETHEUS METRICS ====================

// Collect default metrics (CPU, memory, etc.)
client.collectDefaultMetrics();

// Create a histogram to track HTTP request durations
const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "code"],
  buckets: [50, 100, 200, 300, 400, 500, 1000, 2000], // ms
});

// Middleware to start histogram timer and record metrics after response
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on("finish", () => {
    // Use req.route?.path or req.baseUrl + req.route?.path for route label if available
    const route = req.route?.path || req.originalUrl || req.url;
    end({ method: req.method, route, code: res.statusCode });
  });
  next();
});

// ==================== GLOBAL MIDDLEWARE ====================
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());
app.use(logger);

// ==================== ROUTES ====================
app.use("/", mainRouter);

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

// ==================== ERROR HANDLERS ====================
// Handle 404 (Not Found)
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

// ==================== START SERVER ====================
const server = app.listen(PORT, "0.0.0.0", () => {
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
