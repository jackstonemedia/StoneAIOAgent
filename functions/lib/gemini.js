const { GoogleGenAI } = require("@google/genai");

// Initialize with environment variable
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Returns a wrapper or config for the model.
 * Since @google/genai uses ai.models.generateContent directly, we just return the config.
 */
function getModel(temp = 0.7) {
  return {
    model: "gemini-3.1-pro-preview",
    config: {
      temperature: temp
    }
  };
}

/**
 * Generates text using the Gemini model.
 * Retries once on 429 errors.
 */
async function generateText(prompt, temp = 0.7) {
  const modelConfig = getModel(temp);
  
  try {
    const response = await ai.models.generateContent({
      model: modelConfig.model,
      contents: prompt,
      config: modelConfig.config
    });
    return response.text;
  } catch (error) {
    if (error.status === 429 || (error.message && error.message.includes("429"))) {
      console.warn("Rate limit hit (429), retrying once after 2 seconds...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      const retryResponse = await ai.models.generateContent({
        model: modelConfig.model,
        contents: prompt,
        config: modelConfig.config
      });
      return retryResponse.text;
    }
    throw error;
  }
}

/**
 * Generates embeddings for the given text.
 */
async function embedText(text) {
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: text,
  });
  
  if (result.embeddings && result.embeddings.length > 0) {
    return result.embeddings[0].values;
  }
  throw new Error("Failed to generate embedding");
}

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  getModel,
  generateText,
  embedText,
  cosineSimilarity
};
