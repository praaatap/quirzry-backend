// Global Error Handler
export const errorHandler = (err, req, res, next) => {
  console.error("❌ Unexpected Error:", err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};

// 404 Not Found Handler
export const notFoundHandler = (req, res) => {
  console.log(`⚠️ 404: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Endpoint not found" });
};