const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateText(prompt, temp = 0.7) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        temperature: temp
      }
    });
    return response.text;
  } catch (error) {
    if (error.status === 429 || (error.message && error.message.includes('RESOURCE_EXHAUSTED'))) {
      // Retry once after 2s
      await new Promise(resolve => setTimeout(resolve, 2000));
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          temperature: temp
        }
      });
      return response.text;
    }
    throw error;
  }
}

async function embedText(text) {
  const result = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text
  });

  const values = result.embeddings?.[0]?.values || result.embedding?.values;
  if (!values) {
    throw new Error("Missing embeddings from response.");
  }

  return values;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  let similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  return Math.max(-1, Math.min(1, similarity));
}

function getModel(temp) {
  return {
    model: "gemini-2.0-flash",
    config: {
      temperature: temp
    }
  };
}

module.exports = {
  generateText,
  embedText,
  cosineSimilarity,
  getModel
};
