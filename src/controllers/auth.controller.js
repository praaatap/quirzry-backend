import prisma from "../config/prisma.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import googleClient from "../config/google.js";
import asyncHandler from "../middleware/asyncHandler.js";

// ==================== SIGNUP ====================
export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  console.log(`📝 Signup attempt for: ${email}`);

  if (!name || !email || !password) {
    console.log("❌ Missing required fields");
    return res.status(400).json({ error: "All fields are required" });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log("❌ Email already registered");
    return res.status(400).json({ error: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  console.log(`✅ User created: ${user.name} (ID: ${user.id})`);
  res.status(201).json({
    message: "Signup successful",
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ==================== SIGNIN ====================
export const signin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log(`🔐 Signin attempt for: ${email}`);

  if (!email || !password) {
    console.log("❌ Missing email or password");
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("❌ User not found");
    return res.status(404).json({ error: "User not found" });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    console.log("❌ Invalid password");
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  console.log(`✅ User signed in: ${user.name} (ID: ${user.id})`);
  res.json({
    message: "Signin successful",
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ==================== GOOGLE SIGN-IN ====================
export const googleAuth = asyncHandler(async (req, res) => {
  const { token } = req.body;
  console.log("🔐 Google sign-in attempt");

  if (!token) {
    console.log("❌ No token provided");
    return res.status(400).json({ error: "Token is required" });
  }

  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    console.log("❌ Invalid Google token");
    return res.status(401).json({ error: "Invalid Google token" });
  }

  const { email, name } = payload;
  if (!email || !name) {
    console.log("❌ Invalid token payload");
    return res.status(400).json({ error: "Invalid Google token payload" });
  }

  console.log(`✅ Google user verified: ${name} (${email})`);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      email,
      name,
      password: await bcrypt.hash(`google-user-${Date.now()}`, 10),
    },
  });

  const appToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  console.log(`✅ User authenticated: ${user.name} (ID: ${user.id})`);
  res.json({
    message: "Google sign-in successful",
    token: appToken,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ==================== VERIFY TOKEN (NEW) ====================
export const verifyToken = asyncHandler(async (req, res) => {
  const userId = req.userId; // From authenticateToken middleware
  
  console.log(`🔐 Token verification for user ID: ${userId}`);

  // Fetch user details to confirm token is valid and user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  });

  if (!user) {
    console.log("❌ User not found in database");
    return res.status(404).json({ error: "User not found" });
  }

  console.log(`✅ Token verified for user: ${user.name}`);
  
  res.status(200).json({
    valid: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

// ==================== SAVE FCM TOKEN ====================
export const saveFcmToken = asyncHandler(async (req, res) => {
  const { fcmToken } = req.body;
  const userId = req.userId; // From JWT middleware

  if (!fcmToken) {
    return res.status(400).json({ error: "FCM token is required" });
  }

  console.log(`💾 Saving FCM token for user ${userId}`);

  // Update user's FCM token in database
  const user = await prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  });

  console.log(`✅ FCM token saved for ${user.name}`);

  res.json({
    message: "FCM token saved successfully",
  });
});

// ==================== RESET PASSWORD ====================
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;
  console.log(`🔑 Password reset attempt for: ${email}`);

  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email and new password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log("❌ User not found");
    return res.status(404).json({ error: "User not found" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email },
    data: { password: hashedPassword },
  });

  console.log(`✅ Password reset for user: ${email}`);
  res.json({ message: "Password reset successful" });
});
