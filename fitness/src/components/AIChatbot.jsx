import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './AIChatbot.css';

// GROQ_API_KEY is handled by the backend for security

const SYSTEM_PROMPT = `You are GrowFit AI — an elite, world-class fitness coach and gym expert. You have deep expertise in ALL areas of gym training, nutrition, bodybuilding, powerlifting, CrossFit, calisthenics, sports performance, injury prevention, and overall wellness.

YOUR CORE EXPERTISE:
1. Workout Programming: Strength training, hypertrophy, endurance, HIIT, powerlifting, Olympic lifting, calisthenics, CrossFit, sport-specific training, mobility, flexibility
2. Muscle Groups & Exercises: Complete knowledge of exercises for every muscle — chest, back, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes, calves, abs, obliques, traps, lats, rear delts, etc.
3. Nutrition & Diet: Bulking, cutting, recomposition, macro counting, calorie calculations, meal timing, pre/post workout nutrition, supplements (creatine, whey, BCAAs, etc.), vegetarian/vegan fitness diets, keto, carb cycling
4. Training Splits: PPL, Upper/Lower, Bro Split, Full Body, Arnold Split, PHUL, PHAT, 5/3/1 Wendler, Starting Strength, StrongLifts 5x5
5. Body Transformation: Weight loss, lean muscle gain, body recomposition, progressive overload
6. Recovery & Injury Prevention: Warm-up protocols, cooldown stretching, foam rolling, deload weeks, overtraining signs, common gym injuries, rehab exercises
7. Gym Equipment: Barbells, dumbbells, cables, machines, resistance bands, kettlebells, TRX, Smith machine, power rack
8. Beginner to Advanced: Adapt advice for all levels
9. Fitness Metrics: 1RM calculations, RPE, RIR, volume tracking

RESPONSE RULES:
- Always give practical, actionable advice with specific exercises, sets, reps, and rest times
- When asked for a plan, provide a COMPLETE plan in ONE response
- Keep answers focused and well-structured with clear sections
- For workout plans: include warm-up, exercises with sets x reps, cooldown
- For diet plans: include specific meals, calories, macros
- Be motivating and supportive, use gym culture naturally
- If asked something unrelated to fitness/health/gym, politely redirect
- Keep responses concise but complete
- Include a brief safety note for medical concerns`;

const callGroqAPI = async (userMessage, chatHistory = []) => {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: userMessage,
                history: chatHistory.map(m => ({
                    role: m.role === 'model' ? 'model' : 'user',
                    text: m.content
                }))
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.details || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.reply;
    } catch (error) {
        throw error;
    }
};

// ═══════════════════════════════════════════════════════════════
// MARKDOWN RENDERER — renders markdown like ChatGPT
// ═══════════════════════════════════════════════════════════════
const renderMarkdown = (text) => {
    if (!text) return '';

    let html = text
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
    });

    // Inline code (`...`)
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    // Headers (### h3, ## h2, # h1)
    html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>');

    // Bold + italic (***text***)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold (**text**)
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic (*text*)
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Horizontal rule (---)
    html = html.replace(/^---$/gm, '<hr class="md-hr"/>');

    // Numbered lists (1. item)
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="md-ol-item"><span class="md-ol-num">$1.</span> $2</div>');

    // Bullet lists (- item or * item)
    html = html.replace(/^[-*]\s+(.+)$/gm, '<div class="md-li">• $1</div>');

    // Tables
    html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
        const cells = content.split('|').map(c => c.trim());
        if (cells.every(c => /^[-:]+$/.test(c))) {
            return ''; // separator row
        }
        const row = cells.map(c => `<td class="md-td">${c}</td>`).join('');
        return `<tr class="md-tr">${row}</tr>`;
    });
    html = html.replace(/((?:<tr class="md-tr">.*<\/tr>\s*)+)/g, '<table class="md-table">$1</table>');

    // Line breaks — convert double newlines to paragraph breaks, single newlines to <br>
    html = html.replace(/\n\n+/g, '</p><p class="md-p">');
    html = html.replace(/\n/g, '<br/>');

    // Wrap in paragraph
    html = '<p class="md-p">' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p class="md-p">\s*<\/p>/g, '');

    return html;
};

const FormattedMessage = ({ text }) => {
    return (
        <div
            className="md-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
    );
};

const AIChatbot = () => {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'model', text: 'Hello! I am your GrowFit AI 💪 Ask me anything about workouts, nutrition, exercises, supplements, or any gym query! ⚡' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    if (location.pathname.startsWith('/admin')) {
        return null;
    }

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg = input.trim();
        const nextMessages = [...messages, { role: 'user', text: userMsg }];
        setInput('');
        setMessages(nextMessages);
        setLoading(true);

        try {
            const chatHistory = nextMessages
                .filter(m => m.text !== 'Hello! I am your GrowFit AI 💪 Ask me anything about workouts, nutrition, exercises, supplements, or any gym query! ⚡')
                .slice(-10)
                .map(m => ({
                    role: m.role === 'model' ? 'assistant' : 'user',
                    content: m.text
                }));

            const historyWithoutLast = chatHistory.slice(0, -1);
            const reply = await callGroqAPI(userMsg, historyWithoutLast);
            setMessages(prev => [...prev, { role: 'model', text: reply }]);
        } catch (error) {
            console.error('Groq API error:', error);
            const msg = error?.message?.includes('401') || error?.message?.includes('403')
                ? "API key issue. Please check the configuration. 🔑"
                : "Something went wrong. Please try again! 🔄";
            setMessages(prev => [...prev, { role: 'model', text: msg }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button className={`chat-fab ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                {isOpen ? '✕' : '💬'}
            </button>

            <div className={`chat-window ${isOpen ? 'open' : ''}`}>
                <div className="chat-header">
                    <div className="chat-header-info">
                        <div className="online-indicator"></div>
                        <h3>GrowFit AI</h3>
                    </div>
                    <span className="premium-badge">GYM EXPERT</span>
                </div>

                <div className="chat-messages" ref={scrollRef}>
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message-wrapper ${msg.role}`}>
                            <div className="message-bubble">
                                {msg.role === 'model'
                                    ? <FormattedMessage text={msg.text} />
                                    : msg.text
                                }
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className="message-wrapper model">
                            <div className="message-bubble loading">
                                <span className="dot"></span>
                                <span className="dot"></span>
                                <span className="dot"></span>
                            </div>
                        </div>
                    )}
                </div>

                <form className="chat-input-area" onSubmit={handleSend}>
                    <input
                        type="text"
                        placeholder="Ask anything about fitness..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <button type="submit" disabled={loading}>⚡</button>
                </form>
            </div>
        </>
    );
};

export default AIChatbot;
