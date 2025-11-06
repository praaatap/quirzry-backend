import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Helper to get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  const serviceAccountPath = join(
    __dirname,
    "../../serviceAccountKey.json"
  );
  const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized successfully");
} catch (error) {
  console.error("⚠️ Firebase Admin initialization failed:", error.message);
  console.log("⚠️ Push notifications will not work without Firebase setup");
  console.log("   (Did you forget the 'serviceAccountKey.json' file?)");
}

export default admin;