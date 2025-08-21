// server.js
const express = require("express");
const cors = require("cors");
const MongoDBQASystem = require("./mongodb-qa-system");
const QASystem = new MongoDBQASystem();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Configuration
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "sampledb";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi:latest";

// Initialize QA System
let qaSystem;

async function initializeSystem() {
  try {
    console.log("Initializing MongoDB QA System...");
    qaSystem = new MongoDBQASystem(MONGO_URI, DB_NAME, OLLAMA_MODEL);

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 5000));

    console.log("QA System initialized successfully!");
    return true;
  } catch (error) {
    console.error("Failed to initialize QA System:", error);
    return false;
  }
}

// Web interface
app.get("/", (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>MongoDB QA System</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    max-width: 1000px; 
                    margin: 0 auto; 
                    padding: 20px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                }
                .container { 
                    background: white; 
                    padding: 30px; 
                    border-radius: 15px; 
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                }
                h1 { 
                    color: #333; 
                    text-align: center; 
                    margin-bottom: 10px;
                    font-size: 2.5em;
                }
                .subtitle {
                    text-align: center;
                    color: #666;
                    margin-bottom: 30px;
                    font-size: 1.1em;
                }
                .input-group {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                input[type="text"] { 
                    flex: 1;
                    padding: 15px; 
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    transition: border-color 0.3s;
                }
                input[type="text"]:focus {
                    outline: none;
                    border-color: #667eea;
                }
                button { 
                    padding: 15px 30px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white; 
                    border: none; 
                    border-radius: 8px; 
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: transform 0.2s;
                }
                button:hover {
                    transform: translateY(-2px);
                }
                button:disabled {
                    background: #ccc;
                    cursor: not-allowed;
                    transform: none;
                }
                .answer { 
                    background: #f8f9fa; 
                    padding: 20px; 
                    margin: 20px 0; 
                    border-radius: 8px; 
                    border-left: 4px solid #667eea;
                    animation: slideIn 0.3s ease-out;
                }
                .question {
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 10px;
                }
                .response {
                    color: #555;
                    line-height: 1.6;
                }
                .loading { 
                    color: #667eea; 
                    font-style: italic;
                    text-align: center;
                    padding: 20px;
                }
                .error {
                    background: #ffe6e6;
                    border-left-color: #dc3545;
                    color: #721c24;
                }
                .suggestions {
                    margin-top: 20px;
                }
                .suggestion-btn {
                    display: inline-block;
                    background: #e9ecef;
                    color: #495057;
                    padding: 8px 15px;
                    margin: 5px;
                    border-radius: 20px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    font-size: 14px;
                }
                .suggestion-btn:hover {
                    background: #dee2e6;
                }
                .stats {
                    background: #e7f3ff;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-left: 4px solid #0066cc;
                }
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🍃 MongoDB QA System</h1>
                <p class="subtitle">Ask questions about your MongoDB database using AI</p>
                
                <div id="stats" class="stats" style="display: none;">
                    <strong>Database Stats:</strong> <span id="statsContent">Loading...</span>
                </div>
                
                <div class="input-group">
                    <input type="text" id="questionInput" placeholder="Ask me anything about your MongoDB data..." />
                    <button id="askBtn" onclick="askQuestion()">Ask</button>
                </div>
                
                <div class="suggestions">
                    <strong>Try asking:</strong><br>
                    <span class="suggestion-btn" onclick="setQuestion('How many employees are in each department?')">Department counts</span>
                    <span class="suggestion-btn" onclick="setQuestion('What are the current projects?')">Current projects</span>
                    <span class="suggestion-btn" onclick="setQuestion('Who has the highest salary?')">Highest salary</span>
                    <span class="suggestion-btn" onclick="setQuestion('Which department has the biggest budget?')">Budget analysis</span>
                    <span class="suggestion-btn" onclick="setQuestion('Show me all employees with JavaScript skills')">Skills search</span>
                </div>
                
                <div id="result"></div>
                
                <div style="margin-top: 30px; text-align: center;">
                    <button onclick="reindexDatabase()" style="background: #28a745;">🔄 Reindex Database</button>
                    <button onclick="loadStats()" style="background: #17a2b8; margin-left: 10px;">📊 Show Stats</button>
                </div>
            </div>

            <script>
                let isLoading = false;

                async function askQuestion() {
                    if (isLoading) return;
                    
                    const question = document.getElementById('questionInput').value;
                    const resultDiv = document.getElementById('result');
                    const askBtn = document.getElementById('askBtn');
                    
                    if (!question.trim()) {
                        alert('Please enter a question');
                        return;
                    }
                    
                    isLoading = true;
                    askBtn.disabled = true;
                    askBtn.textContent = 'Thinking...';
                    
                    resultDiv.innerHTML = '<div class="loading">🤔 AI is analyzing your MongoDB data...</div>';
                    
                    try {
                        const response = await fetch('/ask', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ question: question })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            resultDiv.innerHTML = \`
                                <div class="answer">
                                    <div class="question">❓ \${question}</div>
                                    <div class="response">🤖 \${data.answer.replace(/\\n/g, '<br>')}</div>
                                </div>
                            \`;
                        } else {
                            resultDiv.innerHTML = \`
                                <div class="answer error">
                                    <div class="question">❓ \${question}</div>
                                    <div class="response">❌ Error: \${data.error}</div>
                                </div>
                            \`;
                        }
                    } catch (error) {
                        resultDiv.innerHTML = \`
                            <div class="answer error">
                                <div class="question">❓ \${question}</div>
                                <div class="response">❌ Network Error: \${error.message}</div>
                            </div>
                        \`;
                    } finally {
                        isLoading = false;
                        askBtn.disabled = false;
                        askBtn.textContent = 'Ask';
                    }
                }
                
                function setQuestion(question) {
                    document.getElementById('questionInput').value = question;
                    askQuestion();
                }
                
                async function reindexDatabase() {
                    if (isLoading) return;
                    
                    const resultDiv = document.getElementById('result');
                    resultDiv.innerHTML = '<div class="loading">🔄 Reindexing database...</div>';
                    
                    try {
                        const response = await fetch('/reindex', { method: 'POST' });
                        const data = await response.json();
                        
                        if (data.success) {
                            resultDiv.innerHTML = '<div class="answer">✅ Database reindexed successfully!</div>';
                        } else {
                            resultDiv.innerHTML = \`<div class="answer error">❌ Error: \${data.error}</div>\`;
                        }
                    } catch (error) {
                        resultDiv.innerHTML = \`<div class="answer error">❌ Error: \${error.message}</div>\`;
                    }
                }
                
                async function loadStats() {
                    try {
                        const response = await fetch('/stats');
                        const data = await response.json();
                        
                        if (data.success) {
                            const statsDiv = document.getElementById('stats');
                            const statsContent = document.getElementById('statsContent');
                            
                            const statsText = Object.entries(data.stats)
                                .map(([collection, count]) => \`\${collection}: \${count} documents\`)
                                .join(', ');
                            
                            statsContent.textContent = statsText;
                            statsDiv.style.display = 'block';
                        }
                    } catch (error) {
                        console.error('Error loading stats:', error);
                    }
                }
                
                // Enter key support
                document.getElementById('questionInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter' && !isLoading) {
                        askQuestion();
                    }
                });
                
                // Load stats on page load
                window.addEventListener('load', loadStats);
            </script>
        </body>
        </html>
    `);
});

// API Routes
app.post("/ask", async (req, res) => {
  try {
    if (!qaSystem) {
      return res.status(503).json({
        success: false,
        error: "QA System not initialized yet. Please wait and try again.",
      });
    }

    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    console.log(`Received question: \${question}`);
    const answer = await QASystem.generateAnswer(question);

    res.json({
      success: true,
      question: question,
      answer: answer,
    });
  } catch (error) {
    console.error("Error processing question:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/reindex", async (req, res) => {
  try {
    if (!qaSystem) {
      return res.status(503).json({
        success: false,
        error: "QA System not initialized",
      });
    }

    await qaSystem.extractAndIndexDatabase();

    res.json({
      success: true,
      message: "Database reindexed successfully",
    });
  } catch (error) {
    console.error("Error reindexing:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/stats", async (req, res) => {
  try {
    if (!qaSystem) {
      return res.status(503).json({
        success: false,
        error: "QA System not initialized",
      });
    }

    const stats = await qaSystem.getCollectionStats();

    res.json({
      success: true,
      stats: stats,
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/setup-sample", async (req, res) => {
  try {
    if (!qaSystem) {
      return res.status(503).json({
        success: false,
        error: "QA System not initialized",
      });
    }

    await qaSystem.setupSampleDatabase();
    await qaSystem.extractAndIndexDatabase();

    res.json({
      success: true,
      message: "Sample database created and indexed successfully",
    });
  } catch (error) {
    console.error("Error setting up sample database:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    qaSystemReady: !!qaSystem,
    timestamp: new Date().toISOString(),
    database: DB_NAME,
    ollamaModel: OLLAMA_MODEL,
  });
});

// Start server
app.listen(port, async () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
  console.log(`📊 Database: ${DB_NAME}`);
  console.log(`🤖 Ollama Model: ${OLLAMA_MODEL}`);
  console.log("🔄 Initializing QA System...");

  const initialized = await initializeSystem();

  if (initialized) {
    console.log(
      "✅ System ready! Visit http://localhost:3000 to start asking questions"
    );
  } else {
    console.log("❌ System initialization failed. Check your connections.");
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down gracefully...");
  if (qaSystem) {
    await qaSystem.close();
  }
  process.exit(0);
});
