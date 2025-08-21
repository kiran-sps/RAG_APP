// embedding-service.js
const { Ollama } = require("ollama");

class OllamaEmbeddingService {
  constructor(host = "http://localhost:11434") {
    this.ollama = new Ollama({ host });
    this.embeddingModel = "nomic-embed-text"; // You can change this
    this.initialized = false;
  }

  async initialize() {
    try {
      // Check if embedding model is available
      const models = await this.ollama.list();
      const hasEmbeddingModel = models.models.some(
        (model) =>
          model.name.includes("nomic-embed") || model.name.includes("embed")
      );

      if (hasEmbeddingModel) {
        console.log(`✅ Using Ollama embedding model: ${this.embeddingModel}`);
        this.initialized = true;
        return true;
      } else {
        console.log(
          "⚠️  No embedding model found in Ollama. You can install one with:"
        );
        console.log("   ollama pull nomic-embed-text");
        console.log("   or");
        console.log("   ollama pull mxbai-embed-large");
        return false;
      }
    } catch (error) {
      console.log(
        "⚠️  Could not connect to Ollama for embeddings:",
        error.message
      );
      return false;
    }
  }

  async generateEmbedding(text) {
    if (!this.initialized) {
      // Fallback to simple embedding
      return this.simpleEmbedding(text);
    }

    try {
      const response = await this.ollama.embeddings({
        model: this.embeddingModel,
        prompt: text,
      });
      return response.embedding;
    } catch (error) {
      console.error("Error generating Ollama embedding:", error);
      return this.simpleEmbedding(text);
    }
  }

  // Fallback simple embedding
  simpleEmbedding(text) {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/);
    const embedding = new Array(384).fill(0);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode * (i + 1) + j) % 384;
        embedding[index] += Math.sin(charCode * 0.1) * 0.1;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }
}

module.exports = OllamaEmbeddingService;
