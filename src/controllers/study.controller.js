import { asyncHandler } from "../utils/asyncHandler.js";
import { generateStudySetPrompt } from "../prompts/studyPrompts.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
let geminiModel;
function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }
  if (!geminiModel) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Using 1.5-flash as it is fast and cheap, perfect for large context
    geminiModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
  }
  return geminiModel;
}

export const generateStudySet = asyncHandler(async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().length < 50) {
    return res.status(400).json({ error: "Please provide more text to analyze (min 50 chars)." });
  }

  console.log(`🧠 Generating Study Set for text length: ${text.length}`);

  try {
    const model = getGeminiModel();
    const prompt = generateStudySetPrompt(text);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResult = response.text();

    let studyData;
    try {
      studyData = JSON.parse(textResult);
    } catch (e) {
      // Fallback cleanup if model returns markdown
      const cleaned = textResult.replace(/```json/g, "").replace(/```/g, "");
      studyData = JSON.parse(cleaned);
    }

    res.json(studyData);

  } catch (error) {
    console.error("❌ Study Set Generation Error:", error);
    res.status(500).json({ error: "Failed to generate study set. Please try again." });
  }
});
