// mongodb-qa-system.js
const { QdrantClient } = require("@qdrant/js-client-rest");
const { Ollama } = require("ollama");
const { MongoClient, ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

class MongoDBQASystem {
  constructor(
    mongoUri = "mongodb://localhost:27017",
    dbName = "sampledb",
    ollamaModel = "phi"
  ) {
    this.qdrantClient = new QdrantClient({
      url: "http://localhost:6333",
    });
    this.ollama = new Ollama({ host: "http://localhost:11434" });
    this.ollamaModel = ollamaModel;
    this.collectionName = "mongodb_content";
    this.mongoUri = mongoUri;
    this.dbName = dbName;
    this.mongoClient = null;
    this.db = null;

    // Model-specific configurations
    this.modelConfigs = {
      phi: {
        temperature: 0.6,
        top_k: 10,
        top_p: 0.3,
        repeat_penalty: 1.1,
        num_ctx: 2048,
        num_predict: 256,
      },
      llama2: {
        temperature: 0.2,
        top_k: 40,
        top_p: 0.9,
        repeat_penalty: 1.1,
        num_ctx: 4096,
        num_predict: 512,
      },
      mistral: {
        temperature: 0.1,
        top_k: 20,
        top_p: 0.5,
        repeat_penalty: 1.1,
        num_ctx: 4096,
        num_predict: 512,
      },
    };

    this.init();
  }

  async init() {
    try {
      await this.connectToMongoDB();
      await this.createQdrantCollection();
      console.log("MongoDB QA System initialized successfully!");
    } catch (error) {
      console.error("Error initializing system:", error);
    }
  }

  async connectToMongoDB() {
    try {
      this.mongoClient = new MongoClient(this.mongoUri);
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(this.dbName);
      console.log(`Connected to MongoDB database: ${this.dbName}`);
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }
  }

  async createQdrantCollection() {
    try {
      const collections = await this.qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (collection) => collection.name === this.collectionName
      );

      if (!collectionExists) {
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: 384,
            distance: "Cosine",
          },
        });
        console.log(`Created Qdrant collection: ${this.collectionName}`);
      } else {
        console.log(`Qdrant collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      console.error("Error creating Qdrant collection:", error);
    }
  }

  async generateEmbedding(text) {
    try {
      // Try to use Ollama embedding model first
      const response = await this.ollama.embeddings({
        model: "nomic-embed-text",
        prompt: text,
      });
      return response.embedding;
    } catch (error) {
      // Fallback to simple embedding
      return this.simpleEmbedding(text);
    }
  }

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

    const magnitude = Math.sqrt(
      embedding.reduce((sum, val) => sum + val * val, 0)
    );
    return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
  }

  async setupSampleDatabase() {
    try {
      const employees = [
        {
          _id: new ObjectId(),
          name: "John Doe",
          department: "Engineering",
          salary: 85000,
          hire_date: new Date("2023-01-15"),
          skills: ["JavaScript", "Node.js", "MongoDB"],
          location: "New York",
        },
        {
          _id: new ObjectId(),
          name: "Jane Smith",
          department: "Marketing",
          salary: 70000,
          hire_date: new Date("2023-03-20"),
          skills: ["Digital Marketing", "Analytics", "Content Creation"],
          location: "Los Angeles",
        },
        {
          _id: new ObjectId(),
          name: "Bob Johnson",
          department: "Engineering",
          salary: 90000,
          hire_date: new Date("2022-11-10"),
          skills: ["Python", "Machine Learning", "Docker"],
          location: "San Francisco",
        },
      ];

      const departments = [
        {
          _id: new ObjectId(),
          name: "Engineering",
          budget: 500000,
          location: "Building A",
          head: "Sarah Connor",
        },
        {
          _id: new ObjectId(),
          name: "Marketing",
          budget: 200000,
          location: "Building B",
          head: "Mike Ross",
        },
      ];

      await this.db.collection("employees").deleteMany({});
      await this.db.collection("departments").deleteMany({});

      await this.db.collection("employees").insertMany(employees);
      await this.db.collection("departments").insertMany(departments);

      console.log("Sample MongoDB database created successfully!");
    } catch (error) {
      console.error("Error setting up sample database:", error);
    }
  }

  async extractAndIndexDatabase() {
    try {
      const collections = await this.db.listCollections().toArray();
      const points = [];

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;

        if (collectionName.startsWith("system.")) continue;

        console.log(`Processing collection: ${collectionName}`);

        const collection = this.db.collection(collectionName);
        const documents = await collection.find({}).toArray();

        for (const doc of documents) {
          let textContent = `Collection: ${collectionName}\n`;
          textContent += `Document: ${this.formatDocumentForText(doc)}`;

          const embedding = await this.generateEmbedding(textContent);

          const point = {
            id: uuidv4(),
            vector: embedding,
            payload: {
              text: textContent,
              collection: collectionName,
              document_id: doc._id.toString(),
              data: doc,
            },
          };
          points.push(point);
        }
      }

      if (points.length > 0) {
        await this.qdrantClient.upsert(this.collectionName, {
          wait: true,
          points: points,
        });
        console.log(`Indexed ${points.length} documents in Qdrant`);
      }
    } catch (error) {
      console.error("Error extracting and indexing database:", error);
    }
  }

  formatDocumentForText(doc) {
    const formatted = [];

    for (const [key, value] of Object.entries(doc)) {
      if (key === "_id") {
        formatted.push(`${key}: ${value.toString()}`);
      } else if (Array.isArray(value)) {
        formatted.push(`${key}: [${value.join(", ")}]`);
      } else if (value instanceof Date) {
        formatted.push(`${key}: ${value.toISOString().split("T")[0]}`);
      } else if (typeof value === "object" && value !== null) {
        formatted.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        formatted.push(`${key}: ${value}`);
      }
    }

    return formatted.join(", ");
  }

  async searchRelevantData(query, limit = 5) {
    try {
      const queryEmbedding = await this.generateEmbedding(query);

      const searchResults = await this.qdrantClient.search(
        this.collectionName,
        {
          vector: queryEmbedding,
          limit: limit,
        }
      );

      return searchResults.map((result) => ({
        text: result.payload.text,
        collection: result.payload.collection,
        document_id: result.payload.document_id,
        data: result.payload.data,
        score: result.score,
      }));
    } catch (error) {
      console.error("Error searching relevant data:", error);
      return [];
    }
  }

  async generateAnswer(question) {
    try {
      const relevantData = await this.searchRelevantData(question);

      if (relevantData.length === 0) {
        return "I couldn't find relevant information in the MongoDB database to answer your question.";
      }

      let context = "Based on the following MongoDB data:\n\n";
      relevantData.forEach((data, index) => {
        context += `${index + 1}. ${data.text}\n`;
      });

      const prompt = `You are a helpful database analyst. Your job is to answer questions based ONLY on the provided data.

DATABASE CONTEXT:
${context}

INSTRUCTIONS:
- Only use information from the database context above
- If you need to count or calculate, do it step by step
- Be specific and accurate
- If the data doesn't contain enough information, say so

QUESTION: ${question}

ANSWER (be concise and factual):`;

      // Get model-specific configuration
      const modelConfig =
        this.modelConfigs[this.ollamaModel] || this.modelConfigs["phi"];

      const response = await this.ollama.generate({
        model: this.ollamaModel,
        prompt: prompt,
        stream: false,
        options: modelConfig,
      });

      // Post-process the response
      let answer = response.response.trim();

      // Remove common unwanted patterns
      answer = answer.replace(/^(Answer:|A:)/i, "").trim();
      answer = answer.replace(/\n\n+/g, "\n"); // Remove excessive newlines

      // If response is too short or seems incomplete, try again with higher temperature
      if (answer.length < 20 || answer.includes("...")) {
        console.log(
          "Response seems incomplete, trying with higher temperature..."
        );

        const retryConfig = {
          ...modelConfig,
          temperature: modelConfig.temperature + 0.2,
        };
        const retryResponse = await this.ollama.generate({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: retryConfig,
        });

        answer = retryResponse.response
          .trim()
          .replace(/^(Answer:|A:)/i, "")
          .trim();
      }

      return answer;
    } catch (error) {
      console.error("Error generating answer:", error);
      return `Error generating response: ${error.message}`;
    }
  }

  async askQuestion(question) {
    console.log(`\nQuestion: ${question}`);
    console.log("Searching relevant data...");

    const answer = await this.generateAnswer(question);
    console.log(`\nAnswer: ${answer}`);
    return answer;
  }

  async getCollectionStats() {
    try {
      const collections = await this.db.listCollections().toArray();
      const stats = {};

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        if (collectionName.startsWith("system.")) continue;

        const count = await this.db.collection(collectionName).countDocuments();
        stats[collectionName] = count;
      }

      return stats;
    } catch (error) {
      console.error("Error getting collection stats:", error);
      return {};
    }
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log("MongoDB connection closed");
    }
  }
}

// Example usage
async function main() {
  try {
    const qaSystem = new MongoDBQASystem();

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const questions = [
      "How many employees work in the Engineering department?",
      "What are the skills of employees in the Marketing department?",
      "Which department has the highest budget?",
    ];

    console.log("\n" + "=".repeat(50));
    console.log("ASKING QUESTIONS ABOUT THE MONGODB DATABASE");
    console.log("=".repeat(50));

    for (const question of questions) {
      await qaSystem.askQuestion(question);
      console.log("\n" + "-".repeat(30));
    }

    await qaSystem.close();
  } catch (error) {
    console.error("Error in main:", error);
  }
}

if (require.main === module) {
  main();
}

module.exports = MongoDBQASystem;
