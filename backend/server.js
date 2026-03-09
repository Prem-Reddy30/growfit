const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Keys
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

console.log("🔑 API Key present:", !!GROQ_API_KEY);

// ═══════════════════════════════════════════════════════════════
// COMPREHENSIVE GYM & FITNESS SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════
const SYSTEM_INSTRUCTION = `You are GrowFit AI — an elite, world-class fitness coach and gym expert. You have deep expertise in ALL areas of gym training, nutrition, bodybuilding, powerlifting, CrossFit, calisthenics, sports performance, injury prevention, and overall wellness.

## YOUR CORE EXPERTISE:
1. **Workout Programming**: Strength training, hypertrophy, endurance, HIIT, powerlifting (squat/bench/deadlift), Olympic lifting, calisthenics, CrossFit WODs, sport-specific training, mobility work, flexibility routines
2. **Muscle Groups & Exercises**: Complete knowledge of exercises for every muscle — chest, back, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes, calves, abs, obliques, traps, lats, rear delts, etc.
3. **Nutrition & Diet**: Bulking, cutting, recomposition, macro counting, calorie calculations, meal timing, pre/post workout nutrition, supplements (creatine, whey, BCAAs, etc.), vegetarian/vegan fitness diets, keto for athletes, carb cycling
4. **Training Splits**: Push/Pull/Legs (PPL), Upper/Lower, Bro Split, Full Body, Arnold Split, PHUL, PHAT, 5/3/1 Wendler, Starting Strength, StrongLifts 5x5, nSuns, GZCL
5. **Body Transformation**: Weight loss strategies, lean muscle gain, body recomposition, skinny-fat solutions, cutting without losing muscle, progressive overload principles
6. **Recovery & Injury Prevention**: Warm-up protocols, cooldown stretching, foam rolling, deload weeks, overtraining signs, common gym injuries (rotator cuff, lower back, knee), rehab exercises
7. **Gym Equipment Knowledge**: Barbells, dumbbells, cables, machines, resistance bands, kettlebells, TRX, Smith machine, power rack, etc.
8. **Beginner to Advanced**: Adapt advice for complete beginners, intermediates, and advanced lifters
9. **Fitness Metrics**: 1RM calculations, RPE (Rate of Perceived Exertion), RIR (Reps in Reserve), volume tracking, progressive overload tracking
10. **Special Populations**: Training for teens, older adults, pregnant women (general guidance), people with desk jobs, skinny hardgainers, overweight beginners

## RESPONSE RULES:
- Always give **practical, actionable advice** with specific exercises, sets, reps, and rest times
- When asked for a plan, provide a **COMPLETE plan in ONE response** — never give partial/teaser responses
- Use **Markdown formatting** with clear headings, bullet points, and tables when helpful
- For workout plans: include warm-up, main exercises (with sets × reps), and cooldown
- For diet plans: include specific meals, calories, macros, and food swaps
- Keep answers focused and well-structured — avoid walls of text
- If the user's request is vague, make reasonable assumptions (e.g., intermediate level, general fitness) and mention them, then provide the plan. Put optional clarifying questions at the END
- Include a brief 1-2 line safety note for medical concerns — do NOT write long disclaimers
- Be motivating, supportive, and use gym culture naturally (PRs, gains, pump, etc.)
- If someone asks something unrelated to fitness/health/gym, politely redirect: "I'm your fitness expert! Ask me anything about workouts, nutrition, or gym training 💪"

## FORMAT FOR WORKOUT PLANS:
**Assumptions** (bullets)
**Weekly Plan** (Day 1...Day 7) — each day with:
- Warm-up (5 min)
- Exercises line-by-line: Exercise Name — Sets × Reps @ RPE/weight guidance
- Cooldown (stretching)
**Progression** (how to advance weekly)
**Quick Questions (optional)** — at the end only

## FORMAT FOR DIET PLANS:
**Goal & Daily Targets** (calories/macros)
**Sample Day Meal Plan**: Breakfast / Snack / Lunch / Snack / Dinner with specific foods and portions
**Swap Options** (alternatives for each meal)
**Supplement Stack** (if relevant)
**Notes** (3-5 key tips)`;

// ═══════════════════════════════════════════════════════════════
// GROQ CHAT API (using fetch — no extra packages needed)
// ═══════════════════════════════════════════════════════════════
const callGroqChat = async (userMessage, chatHistory = []) => {
    const messages = [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...chatHistory,
        { role: 'user', content: userMessage }
    ];

    // Groq models to try — llama-3.3-70b is the most capable
    const modelsToTry = [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768'
    ];

    let lastError = 'Unknown error';

    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 Attempting Groq model: ${modelName}`);

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: messages,
                    max_tokens: 2048,
                    temperature: 0.5,
                    top_p: 0.9,
                    stream: false,
                }),
            });

            if (!response.ok) {
                const errBody = await response.text();
                throw new Error(`HTTP ${response.status}: ${errBody}`);
            }

            const data = await response.json();
            const reply = data?.choices?.[0]?.message?.content;

            if (!reply) {
                throw new Error('Empty response from Groq');
            }

            console.log(`✅ Success using Groq model: ${modelName}`);
            return reply;
        } catch (error) {
            console.error(`❌ Groq model ${modelName} failed:`, error.message);
            lastError = error?.message || String(error);
            // If auth/key error, don't try other models
            if (lastError.includes('401') || lastError.includes('403') || lastError.includes('invalid_api_key')) {
                break;
            }
        }
    }

    throw new Error(lastError);
};

// ═══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE (RAG) — kept for compatibility
// ═══════════════════════════════════════════════════════════════
const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');
const KNOWLEDGE_INDEX_PATH = path.join(__dirname, 'knowledge_index.json');

const chunkText = (text, maxChars = 900) => {
    const cleaned = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!cleaned) return [];

    const paras = cleaned.split(/\n\s*\n+/g).map((p) => p.trim()).filter(Boolean);
    const chunks = [];
    for (const p of paras) {
        if (p.length <= maxChars) {
            chunks.push(p);
            continue;
        }
        for (let i = 0; i < p.length; i += maxChars) {
            const slice = p.slice(i, i + maxChars).trim();
            if (slice) chunks.push(slice);
        }
    }
    return chunks;
};

const safeReadTextFile = (filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
};

const loadKnowledgeDocuments = () => {
    if (!fs.existsSync(KNOWLEDGE_DIR)) return [];

    const files = fs.readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => d.name);

    const docs = [];
    for (const name of files) {
        const ext = path.extname(name).toLowerCase();
        const fullPath = path.join(KNOWLEDGE_DIR, name);

        if (ext === '.txt' || ext === '.md') {
            docs.push({ source: name, text: safeReadTextFile(fullPath) });
            continue;
        }

        if (ext === '.json') {
            try {
                const raw = safeReadTextFile(fullPath);
                const parsed = JSON.parse(raw);
                docs.push({ source: name, text: JSON.stringify(parsed, null, 2) });
            } catch {
                docs.push({ source: name, text: safeReadTextFile(fullPath) });
            }
        }
    }

    return docs.filter((d) => d.text && d.text.trim());
};

// Simple keyword-based retrieval (no Gemini embedding dependency)
const retrieveKnowledgeSimple = (query, topK = 3) => {
    const docs = loadKnowledgeDocuments();
    if (docs.length === 0) return [];

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const allChunks = [];

    for (const doc of docs) {
        const chunks = chunkText(doc.text);
        for (const chunk of chunks) {
            const lowerChunk = chunk.toLowerCase();
            let score = 0;
            for (const word of queryWords) {
                if (lowerChunk.includes(word)) score++;
            }
            if (score > 0) {
                allChunks.push({ source: doc.source, text: chunk, score });
            }
        }
    }

    return allChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
};

// Knowledge status endpoint
app.get('/api/knowledge/status', (req, res) => {
    try {
        const docs = loadKnowledgeDocuments();
        res.json({
            enabled: true,
            dir: KNOWLEDGE_DIR,
            documents: docs.length,
        });
    } catch (e) {
        res.status(500).json({
            enabled: false,
            error: 'KNOWLEDGE_ERROR',
            details: e?.message || String(e),
        });
    }
});

app.post('/api/knowledge/rebuild', (req, res) => {
    try {
        fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
        const docs = loadKnowledgeDocuments();
        res.json({
            ok: true,
            documents: docs.length,
        });
    } catch (e) {
        res.status(500).json({
            ok: false,
            error: 'KNOWLEDGE_REBUILD_FAILED',
            details: e?.message || String(e),
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// MAIN CHATBOT ENDPOINT
// ═══════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;
    console.log("📩 Incoming Message:", message);

    if (!GROQ_API_KEY) {
        return res.status(500).json({
            error: "AI_ERROR",
            details: "Missing GROQ_API_KEY. Please set it in your .env file."
        });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({
            error: "BAD_REQUEST",
            details: "Missing or invalid 'message'"
        });
    }

    // Convert frontend history format to Groq/OpenAI format
    let chatHistory = [];
    if (history && Array.isArray(history)) {
        chatHistory = history
            .filter((h) => h && typeof h === 'object' && typeof h.role === 'string')
            .map((h) => {
                const content = h.text || (Array.isArray(h.parts) ? h.parts.map(p => p.text).join('') : '');
                return {
                    role: h.role === 'model' ? 'assistant' : 'user',
                    content: content
                };
            })
            .filter(h => h.content);
    }

    // Retrieve knowledge context if available
    let retrievedContext = '';
    try {
        const matches = retrieveKnowledgeSimple(message.trim(), 3);
        if (matches.length > 0) {
            retrievedContext = matches
                .map((m, i) => `Source: ${m.source}\nSnippet ${i + 1}: ${m.text}`)
                .join('\n\n---\n\n');
            console.log(`📚 Retrieved ${matches.length} knowledge snippets`);
        }
    } catch (e) {
        console.error('❌ Knowledge retrieval failed:', e?.message || e);
    }

    const finalUserMessage = retrievedContext
        ? `Use the following CONTEXT to enhance your answer if relevant:\n\nCONTEXT:\n${retrievedContext}\n\nUSER QUESTION:\n${message.trim()}`
        : message.trim();

    try {
        const reply = await callGroqChat(finalUserMessage, chatHistory);
        return res.json({ reply });
    } catch (error) {
        console.error("⛔ ALL MODELS FAILED:", error.message);
        res.status(500).json({
            error: "AI_ERROR",
            details: error.message.includes("API") || error.message.includes("401")
                ? "Invalid API Key. Please check your .env file."
                : error.message
        });
    }
});

// Base Route
app.get('/', (req, res) => {
    res.json({ status: "GrowFit API is Pulse-Active ⚡", engine: "Groq LLaMA" });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        service: "GrowFit Command Center",
        engine: "Groq",
        status: "UP",
        timestamp: new Date().toISOString()
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Master Server running on port ${PORT}`);
    console.log(`📡 Gateway: http://localhost:${PORT}`);
    console.log(`🧠 AI Engine: Groq LLaMA`);
});
