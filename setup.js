// setup.js
const { MongoClient } = require("mongodb");
const { QdrantClient } = require("@qdrant/js-client-rest");
const { Ollama } = require("ollama");

class SetupManager {
  constructor() {
    this.mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
    this.dbName = process.env.DB_NAME || "sampledb";
    this.qdrantUrl = process.env.QDRANT_URL || "http://localhost:6333";
    this.ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  }

  async checkMongoDB() {
    try {
      console.log("🔍 Checking MongoDB connection...");
      const client = new MongoClient(this.mongoUri);
      await client.connect();

      const adminDb = client.db().admin();
      const result = await adminDb.ping();

      await client.close();
      console.log("✅ MongoDB is running and accessible");
      return true;
    } catch (error) {
      console.log("❌ MongoDB connection failed:", error.message);
      console.log("💡 Make sure MongoDB is running on:", this.mongoUri);
      return false;
    }
  }

  async checkQdrant() {
    try {
      console.log("🔍 Checking Qdrant connection...");
      const client = new QdrantClient({ url: this.qdrantUrl });
      await client.getCollections();
      console.log("✅ Qdrant is running and accessible");
      return true;
    } catch (error) {
      console.log("❌ Qdrant connection failed:", error.message);
      console.log(
        "💡 Start Qdrant with: docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant"
      );
      return false;
    }
  }

  async checkOllama() {
    try {
      console.log("🔍 Checking Ollama connection...");
      const ollama = new Ollama({ host: this.ollamaUrl });
      const models = await ollama.list();

      console.log("✅ Ollama is running");
      console.log(
        `📋 Available models: ${models.models.map((m) => m.name).join(", ")}`
      );

      // Check for recommended models
      const hasTextModel = models.models.some(
        (m) =>
          m.name.includes("llama") ||
          m.name.includes("mistral") ||
          m.name.includes("phi")
      );

      const hasEmbeddingModel = models.models.some(
        (m) => m.name.includes("embed") || m.name.includes("nomic")
      );

      if (!hasTextModel) {
        console.log("⚠️  No text generation model found. Install one with:");
        console.log("   ollama pull llama2");
        console.log("   or");
        console.log("   ollama pull mistral");
      }

      if (!hasEmbeddingModel) {
        console.log("⚠️  No embedding model found. Install one with:");
        console.log("   ollama pull nomic-embed-text");
        console.log("   or");
        console.log("   ollama pull mxbai-embed-large");
      }

      return true;
    } catch (error) {
      console.log("❌ Ollama connection failed:", error.message);
      console.log("💡 Make sure Ollama is running with: ollama serve");
      return false;
    }
  }

  async createEnvironmentFile() {
    const fs = require("fs");
    const envContent = `# MongoDB Configuration
MONGO_URI=${this.mongoUri}
DB_NAME=${this.dbName}

# Qdrant Configuration  
QDRANT_URL=${this.qdrantUrl}

# Ollama Configuration
OLLAMA_URL=${this.ollamaUrl}
OLLAMA_MODEL=llama2

# Server Configuration
PORT=3000
`;

    try {
      fs.writeFileSync(".env", envContent);
      console.log("✅ Created .env file with default configuration");
    } catch (error) {
      console.log("⚠️  Could not create .env file:", error.message);
    }
  }

  async setupSampleData() {
    try {
      console.log("🔍 Setting up sample data...");
      const MongoDBQASystem = require("./mongodb-qa-system");
      const qaSystem = new MongoDBQASystem(this.mongoUri, this.dbName);

      await new Promise((resolve) => setTimeout(resolve, 2000));
      await qaSystem.setupSampleDatabase();
      await qaSystem.extractAndIndexDatabase();
      await qaSystem.close();

      console.log("✅ Sample data created and indexed successfully");
    } catch (error) {
      console.log("❌ Failed to setup sample data:", error.message);
    }
  }

  async run() {
    console.log("🚀 MongoDB QA System Setup");
    console.log("=".repeat(40));

    const mongoOk = await this.checkMongoDB();
    const qdrantOk = await this.checkQdrant();
    const ollamaOk = await this.checkOllama();

    console.log("\n📝 Setup Results:");
    console.log(`MongoDB: ${mongoOk ? "✅" : "❌"}`);
    console.log(`Qdrant: ${qdrantOk ? "✅" : "❌"}`);
    console.log(`Ollama: ${ollamaOk ? "✅" : "❌"}`);

    if (mongoOk && qdrantOk && ollamaOk) {
      console.log("\n🎉 All services are ready!");

      await this.createEnvironmentFile();

      const readline = require("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(
        "\n❓ Would you like to setup sample data? (y/n): ",
        async (answer) => {
          if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
            await this.setupSampleData();
          }

          console.log("\n🚀 Setup complete! You can now run:");
          console.log("   npm run server  # Start the web interface");
          console.log("   npm start       # Run CLI version");

          rl.close();
        }
      );
    } else {
      console.log(
        "\n❌ Some services are not ready. Please fix the issues above and try again."
      );
      process.exit(1);
    }
  }
}

const Set = new SetupManager();

Set.run().catch((error) => {
  console.error("❌ Setup failed:", error.message);
  process.exit(1);
});
