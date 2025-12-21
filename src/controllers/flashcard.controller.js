import { asyncHandler } from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";
// Note: GoogleGenerativeAI is loaded lazily in getGeminiModel()
import { Groq } from "groq-sdk";

// Initialize Gemini (Lazy Load to avoid crash before env loads)
let geminiModel;
function getGeminiModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }
  if (!geminiModel) {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });
  }
  return geminiModel;
}

// Initialize Groq
// Initialize Groq (Lazy)
let groqClient;
function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

// Global counter for load balancing
let requestCounter = 0;

// ==================== PROMPT GENERATION ====================
function generateFlashcardPrompt(topic, cardCount = 10) {
  return `
You are a flashcard generator. Create ${cardCount} educational flashcards about "${topic}".

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations.

Each flashcard should have:
- A "front" (question, term, or concept to learn)
- A "back" (answer, definition, or explanation)

The flashcards should be:
- Educational and accurate
- Clear and concise
- Progressive in difficulty (easy to hard)
- Covering different aspects of the topic

Return this exact JSON structure:
{
  "topic": "${topic}",
  "cards": [
    {
      "front": "Question or term here",
      "back": "Answer or explanation here"
    }
  ]
}

Generate ${cardCount} flashcards now.
`;
}

// ==================== HELPER FUNCTIONS ====================
async function extractTextFromResult(result, provider) {
  try {
    if (provider === "GEMINI") {
      const response = result?.response;
      if (typeof response?.text === "function") return await response.text();
      return JSON.stringify(result);
    }
    if (provider === "GROQ") {
      return result.choices?.[0]?.message?.content || "";
    }
    return "";
  } catch (err) {
    console.warn(`Failed to extract text from ${provider} result`, err);
    return "";
  }
}

function parseFlashcardJSON(text) {
  let cleanedText = (text || "").trim();
  cleanedText = cleanedText.replace(/^```json\n?/g, "").replace(/^```\n?/g, "").replace(/\n?```$/g, "").trim();

  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    const firstBrace = cleanedText.indexOf("{");
    const lastBrace = cleanedText.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleanedText.substring(firstBrace, lastBrace + 1));
    }
    throw e;
  }
}

// ==================== CONTROLLERS ====================

// Generate Flashcards
export const generateFlashcards = asyncHandler(async (req, res) => {
  const { topic, cardCount = 10 } = req.body;
  const userId = req.userId;

  requestCounter++;
  const useGroq = requestCounter % 2 === 0;
  const currentProvider = useGroq ? "GROQ (Llama)" : "GEMINI";

  if (!topic || topic.trim().length === 0) {
    return res.status(400).json({ error: "Topic is required" });
  }

  const validCardCount = Math.min(Math.max(parseInt(cardCount, 10) || 10, 5), 30);

  console.log(`\n🎴 Flashcard Request #${requestCounter} | Provider: ${currentProvider}`);
  console.log(`📝 Generating ${validCardCount} flashcards on: "${topic}"`);

  let rawText = "";

  try {
    const prompt = generateFlashcardPrompt(topic, validCardCount);

    if (useGroq) {
      const completion = await getGroqClient().chat.completions.create({
        model: process.env.LLAMA_MODEL_NAME || "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a high-quality JSON-only flashcard generator. Return only valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_completion_tokens: 8192,
      });
      rawText = await extractTextFromResult(completion, "GROQ");
    } else {
      const result = await getGeminiModel().generateContent(prompt);
      rawText = await extractTextFromResult(result, "GEMINI");
    }

    console.log(`✅ ${currentProvider} response received. Length: ${rawText.length}`);

    // Parse the response
    let flashcardData;
    try {
      flashcardData = parseFlashcardJSON(rawText);
      
      if (!flashcardData.cards || !Array.isArray(flashcardData.cards)) {
        throw new Error("Missing 'cards' array in response");
      }
    } catch (parseError) {
      console.error(`❌ Failed to parse JSON from ${currentProvider}`);
      return res.status(500).json({ error: "AI generation failed (Parsing Error). Please try again." });
    }

    // Validate cards
    const validatedCards = flashcardData.cards
      .filter(card => card.front && card.back)
      .map((card, index) => ({
        front: String(card.front).trim(),
        back: String(card.back).trim(),
        cardNumber: index + 1
      }));

    if (validatedCards.length === 0) {
      throw new Error("No valid flashcards parsed from AI response");
    }

    // Save to database
    const flashcardSet = await prisma.flashcardSet.create({
      data: {
        title: `${topic} Flashcards`,
        topic: topic,
        userId,
        cards: {
          create: validatedCards.map(card => ({
            front: card.front,
            back: card.back,
            cardNumber: card.cardNumber
          }))
        }
      },
      include: {
        cards: { orderBy: { cardNumber: "asc" } }
      }
    });

    console.log(`💾 Flashcard set saved! ID: ${flashcardSet.id}`);

    res.status(201).json({
      id: flashcardSet.id,
      title: flashcardSet.title,
      topic: flashcardSet.topic,
      cardCount: flashcardSet.cards.length,
      cards: flashcardSet.cards
    });

  } catch (error) {
    console.error("❌ Flashcard Generation Error:", error);
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("api key") || msg.includes("unauthorized")) {
      return res.status(500).json({ error: "Server Configuration Error (API Key)." });
    }
    if (msg.includes("quota") || msg.includes("too many requests")) {
      return res.status(429).json({ error: "System busy. Please try again." });
    }
    res.status(500).json({ error: "Failed to generate flashcards." });
  }
});

// Get user's flashcard sets
export const getMyFlashcardSets = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const sets = await prisma.flashcardSet.findMany({
    where: { userId },
    include: {
      cards: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  res.json({
    sets: sets.map(set => ({
      id: set.id,
      title: set.title,
      topic: set.topic,
      cardCount: set.cards.length,
      createdAt: set.createdAt
    }))
  });
});

// Get single flashcard set
export const getFlashcardSet = asyncHandler(async (req, res) => {
  const { setId } = req.params;
  const userId = req.userId;

  const id = parseInt(setId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid Set ID" });
  }

  const set = await prisma.flashcardSet.findFirst({
    where: { id, userId },
    include: { cards: { orderBy: { cardNumber: "asc" } } }
  });

  if (!set) {
    return res.status(404).json({ error: "Flashcard set not found" });
  }

  res.json({
    id: set.id,
    title: set.title,
    topic: set.topic,
    cardCount: set.cards.length,
    cards: set.cards,
    createdAt: set.createdAt
  });
});

// Delete flashcard set
export const deleteFlashcardSet = asyncHandler(async (req, res) => {
  const { setId } = req.params;
  const userId = req.userId;

  const id = parseInt(setId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid Set ID" });
  }

  const set = await prisma.flashcardSet.findFirst({ where: { id, userId } });
  if (!set) {
    return res.status(404).json({ error: "Flashcard set not found" });
  }

  await prisma.flashcardSet.delete({ where: { id } });
  res.json({ message: "Flashcard set deleted successfully" });
});

// Update study progress for a card
export const updateCardProgress = asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const { known } = req.body;

  const id = parseInt(cardId, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: "Invalid Card ID" });
  }

  const card = await prisma.flashcard.update({
    where: { id },
    data: {
      timesReviewed: { increment: 1 },
      timesCorrect: known ? { increment: 1 } : undefined,
      lastReviewed: new Date()
    }
  });

  res.json({
    id: card.id,
    timesReviewed: card.timesReviewed,
    timesCorrect: card.timesCorrect
  });
});
