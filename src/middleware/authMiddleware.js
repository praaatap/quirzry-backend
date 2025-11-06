import jwt from "jsonwebtoken";

// JWT Authentication Middleware
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log("❌ No token provided");
    return res.status(401).json({ error: "Authentication token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      console.log("❌ Invalid token:", err.message);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    // Attach user ID to the request object
    req.userId = user.userId;
    console.log(`✅ Authenticated user ID: ${user.userId}`);
    next();
  });
};