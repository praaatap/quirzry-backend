export function generateStudySetPrompt(text) {
  return `ANALYZE THE FOLLOWING TEXT AND GENERATE A COMPREHENSIVE STUDY SET.

TEXT TO ANALYZE:
"${text.substring(0, 15000)}"

RETURN ONLY A JSON OBJECT WITH THIS STRUCTURE:
{
  "summary": "A concise, bullet-point summary of the key concepts (max 5 points).",
  "podcastScript": [
    { "speaker": "Host", "text": "Introductory sentence setting the stage." },
    { "speaker": "Expert", "text": "Explaining the first core concept simply." },
    { "speaker": "Host", "text": "Asking a clarifying question." },
    { "speaker": "Expert", "text": "Answering with an analogy or example." }
    // ... continue for 6-8 exchanges
  ],
  "flashcards": [
    { "front": "Concept/Term 1", "back": "Definition/Explanation" },
    { "front": "Concept/Term 2", "back": "Definition/Explanation" }
    // ... generate 5-8 flashcards
  ],
  "quiz": [
    {
      "questionText": "Question 1?",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0 // Index of correct option
    }
    // ... generate 5 questions
  ]
}

CRITICAL INSTRUCTIONS:
1. The podcast script must be CONVERSATIONAL, engaging, and sound like a real podcast (think NPR or high-quality educational YouTube). Use "Host" and "Expert" as speakers.
2. Flashcards should focus on high-yield facts.
3. Quiz questions should test understanding, not just rote memory.
4. Summary should be digestible.
5. JSON MUST BE VALID.
`;
}
