import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { auth, db } from '../firebase'
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, getDocs } from 'firebase/firestore'
import './Membership.css'

import trainer1 from '../assets/trainer-1.png'
import trainer2 from '../assets/trainer-2.png'
import trainer3 from '../assets/trainer-3.png'

const PLAN_CONFIG = {
    'half-yearly': {
        name: 'PRO',
        icon: '🔥',
        color: '#22c55e',
        chatEnabled: true,
        videoEnabled: true,
        features: ['Personal Coach Chat', 'Weekly Video Check-ins', 'Custom Workout Plans', 'Diet Adjustments', 'Priority Support'],
        badge: 'PRO'
    },
    'yearly': {
        name: 'ELITE',
        icon: '👑',
        color: '#facc15',
        chatEnabled: true,
        videoEnabled: true,
        features: ['Instant Real-time Chat', 'Unlimited Video Calls', 'Daily Check-ins', '24/7 Priority Support', 'Competition Prep', 'Exclusive Community'],
        badge: 'ELITE'
    }
}

function CoachChat() {
    const navigate = useNavigate()
    const location = useLocation()
    const planId = location.state?.planId || 'half-yearly'
    const plan = PLAN_CONFIG[planId] || PLAN_CONFIG['half-yearly']

    const [coachInfo, setCoachInfo] = useState({
        id: location.state?.coachId || '',
        name: location.state?.coachName || 'Your Coach'
    })
    const [messages, setMessages] = useState([])
    const [newMessage, setNewMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [activeTab, setActiveTab] = useState('chat')
    const chatEndRef = useRef(null)

    // Fetch coach details & chat messages
    useEffect(() => {
        if (!auth.currentUser?.uid) return

        // Fetch full coach info
        const fetchCoach = async () => {
            try {
                // Try coaches collection first
                if (coachInfo.id) {
                    const coachDoc = await getDoc(doc(db, 'coaches', coachInfo.id))
                    if (coachDoc.exists()) {
                        setCoachInfo(prev => ({
                            ...prev,
                            ...coachDoc.data(),
                            image: coachDoc.data().photoURL || trainer1
                        }))
                        return
                    }
                    // Try users collection
                    const userDoc = await getDoc(doc(db, 'users', coachInfo.id))
                    if (userDoc.exists()) {
                        setCoachInfo(prev => ({
                            ...prev,
                            ...userDoc.data(),
                            image: userDoc.data().photoURL || trainer1
                        }))
                    }
                }
                // If no coach assigned, fetch from user profile
                const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid))
                if (userDoc.exists() && userDoc.data().trainerId) {
                    const tid = userDoc.data().trainerId
                    setCoachInfo(prev => ({ ...prev, id: tid, name: userDoc.data().trainerName || 'Your Coach' }))
                }
            } catch (err) {
                console.error('Error fetching coach:', err)
            }
        }
        fetchCoach()

        // Listen for chat messages
        const chatId = [auth.currentUser.uid, coachInfo.id].sort().join('_')
        const q = query(
            collection(db, 'chats', chatId, 'messages'),
            orderBy('createdAt', 'asc')
        )
        const unsub = onSnapshot(q, (snap) => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.error('Chat listener error:', err))

        return () => unsub()
    }, [coachInfo.id])

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = async () => {
        if (!newMessage.trim() || !auth.currentUser?.uid || sending) return
        setSending(true)
        const chatId = [auth.currentUser.uid, coachInfo.id].sort().join('_')
        try {
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text: newMessage.trim(),
                senderId: auth.currentUser.uid,
                senderName: auth.currentUser.displayName || 'You',
                createdAt: serverTimestamp()
            })
            setNewMessage('')
        } catch (err) {
            console.error('Send error:', err)
        } finally {
            setSending(false)
        }
    }

    const formatTime = (timestamp) => {
        if (!timestamp) return ''
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#020617',
            color: '#fff',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
            display: 'flex'
        }}>
            {/* Left Sidebar */}
            <div style={{
                width: '320px',
                background: 'rgba(255,255,255,0.02)',
                borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0
            }}>
                {/* Back Button */}
                <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700',
                            padding: '8px 0', fontFamily: 'inherit'
                        }}
                    >← Back to Dashboard</button>
                </div>

                {/* Coach Profile Card */}
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '24px',
                        overflow: 'hidden', marginBottom: '16px',
                        border: `2px solid ${plan.color}40`
                    }}>
                        <img
                            src={coachInfo.image || trainer1}
                            alt={coachInfo.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: '900', marginBottom: '4px' }}>
                        {coachInfo.name}
                    </h2>
                    <p style={{ color: plan.color, fontSize: '0.8rem', fontWeight: '700', marginBottom: '8px' }}>
                        {coachInfo.specialty || 'Personal Coach'}
                    </p>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: `${plan.color}15`, border: `1px solid ${plan.color}30`,
                        padding: '4px 12px', borderRadius: '50px',
                        fontSize: '0.65rem', fontWeight: '800', color: plan.color,
                        letterSpacing: '1px'
                    }}>
                        {plan.icon} {plan.badge} PLAN
                    </div>
                </div>

                {/* Plan Features */}
                <div style={{ padding: '24px', flex: 1 }}>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: '800', color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', marginBottom: '16px', textTransform: 'uppercase' }}>
                        YOUR PLAN INCLUDES
                    </h4>
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {plan.features.map((f, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: '600'
                            }}>
                                <span style={{
                                    width: '20px', height: '20px', borderRadius: '6px',
                                    background: `${plan.color}15`, color: plan.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', fontWeight: '900', flexShrink: 0
                                }}>✓</span>
                                {f}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Actions */}
                <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: '8px' }}>
                    <button
                        onClick={() => setActiveTab('chat')}
                        style={{
                            padding: '12px', borderRadius: '12px', border: 'none',
                            background: activeTab === 'chat' ? `${plan.color}20` : 'rgba(255,255,255,0.03)',
                            color: activeTab === 'chat' ? plan.color : 'rgba(255,255,255,0.5)',
                            fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer',
                            fontFamily: 'inherit', textAlign: 'left', display: 'flex',
                            alignItems: 'center', gap: '10px', transition: 'all 0.3s ease'
                        }}
                    >💬 Chat</button>
                    {plan.videoEnabled && (
                        <button
                            onClick={() => setActiveTab('video')}
                            style={{
                                padding: '12px', borderRadius: '12px', border: 'none',
                                background: activeTab === 'video' ? `${plan.color}20` : 'rgba(255,255,255,0.03)',
                                color: activeTab === 'video' ? plan.color : 'rgba(255,255,255,0.5)',
                                fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer',
                                fontFamily: 'inherit', textAlign: 'left', display: 'flex',
                                alignItems: 'center', gap: '10px', transition: 'all 0.3s ease'
                            }}
                        >📹 Video Call</button>
                    )}
                    <button
                        onClick={() => setActiveTab('plan')}
                        style={{
                            padding: '12px', borderRadius: '12px', border: 'none',
                            background: activeTab === 'plan' ? `${plan.color}20` : 'rgba(255,255,255,0.03)',
                            color: activeTab === 'plan' ? plan.color : 'rgba(255,255,255,0.5)',
                            fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer',
                            fontFamily: 'inherit', textAlign: 'left', display: 'flex',
                            alignItems: 'center', gap: '10px', transition: 'all 0.3s ease'
                        }}
                    >📋 My Plan</button>
                </div>
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Top Header Bar */}
                <div style={{
                    padding: '16px 28px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.01)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '10px', height: '10px', borderRadius: '50%',
                            background: '#22c55e', boxShadow: '0 0 10px rgba(34,197,94,0.5)'
                        }}></div>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: '900', margin: 0 }}>
                                {activeTab === 'chat' ? `Chat with ${coachInfo.name}` :
                                    activeTab === 'video' ? 'Video Call' : 'Your Training Plan'}
                            </h3>
                            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', margin: 0, fontWeight: '600' }}>
                                {activeTab === 'chat' ? 'Online • Typically responds within 1hr' :
                                    activeTab === 'video' ? `${plan.videoEnabled ? 'Available' : 'Upgrade to PRO for video calls'}` :
                                        'Your personalized training roadmap'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ===== CHAT TAB ===== */}
                {activeTab === 'chat' && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* Messages Area */}
                        <div style={{
                            flex: 1, padding: '24px 28px', overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: '16px'
                        }}>
                            {/* Welcome Message */}
                            {messages.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <div style={{
                                        width: '80px', height: '80px', borderRadius: '50%',
                                        background: `${plan.color}12`, border: `2px solid ${plan.color}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '2.5rem', margin: '0 auto 20px'
                                    }}>💬</div>
                                    <h3 style={{ fontSize: '1.3rem', fontWeight: '900', marginBottom: '8px' }}>
                                        Start your conversation!
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 24px', lineHeight: '1.6' }}>
                                        Say hello to {coachInfo.name}. Share your goals, ask questions, or request a workout plan.
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                                        {['👋 Hi Coach!', '🏋️ I need a workout plan', '🥗 Help with my diet', '📊 Review my progress'].map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setNewMessage(q)}
                                                style={{
                                                    padding: '8px 16px', borderRadius: '50px',
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: 'rgba(255,255,255,0.6)',
                                                    fontSize: '0.8rem', fontWeight: '600',
                                                    cursor: 'pointer', fontFamily: 'inherit',
                                                    transition: 'all 0.3s ease'
                                                }}
                                            >{q}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Chat Messages */}
                            {messages.map((msg) => {
                                const isMe = msg.senderId === auth.currentUser?.uid
                                return (
                                    <div key={msg.id} style={{
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: isMe ? 'flex-end' : 'flex-start',
                                        marginBottom: '12px'
                                    }}>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: '900', color: 'rgba(255,255,255,0.3)',
                                            marginBottom: '6px', marginInline: '15px', letterSpacing: '1px',
                                            textTransform: 'uppercase'
                                        }}>
                                            {isMe ? 'YOU' : (msg.senderName || coachInfo.name)}
                                        </span>
                                        <div style={{
                                            maxWidth: '65%',
                                            padding: '14px 18px',
                                            borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                                            background: isMe
                                                ? `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`
                                                : 'rgba(255,255,255,0.05)',
                                            color: isMe ? '#000' : '#fff',
                                            border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)'
                                        }}>
                                            <p style={{ fontSize: '0.9rem', lineHeight: '1.5', margin: 0, fontWeight: isMe ? '700' : '500' }}>
                                                {msg.text}
                                            </p>
                                            <p style={{
                                                fontSize: '0.65rem', margin: '6px 0 0',
                                                color: isMe ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.25)',
                                                fontWeight: '600', textAlign: 'right'
                                            }}>
                                                {formatTime(msg.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Message Input */}
                        <div style={{
                            padding: '16px 24px',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.01)'
                        }}>
                            <div style={{
                                display: 'flex', gap: '12px', alignItems: 'center',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '16px', padding: '6px 6px 6px 20px'
                            }}>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                    placeholder={`Message ${coachInfo.name}...`}
                                    style={{
                                        flex: 1, background: 'none', border: 'none', outline: 'none',
                                        color: '#fff', fontSize: '0.9rem', fontFamily: 'inherit',
                                        fontWeight: '500'
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim() || sending}
                                    style={{
                                        width: '44px', height: '44px', borderRadius: '12px',
                                        background: newMessage.trim() ? `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)` : 'rgba(255,255,255,0.05)',
                                        border: 'none', cursor: newMessage.trim() ? 'pointer' : 'default',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.1rem', transition: 'all 0.3s ease', flexShrink: 0
                                    }}
                                >
                                    {sending ? '⏳' : '➤'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ===== VIDEO CALL TAB ===== */}
                {activeTab === 'video' && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                        {plan.videoEnabled ? (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    width: '300px', height: '300px', borderRadius: '32px',
                                    background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 30px'
                                }}>
                                    <div style={{ fontSize: '4rem', marginBottom: '16px', opacity: 0.5 }}>📹</div>
                                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', fontWeight: '600' }}>Camera Preview</p>
                                </div>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: '900', marginBottom: '8px' }}>
                                    Video Call with {coachInfo.name}
                                </h3>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: '30px', maxWidth: '400px', margin: '0 auto 30px' }}>
                                    {planId === 'yearly'
                                        ? 'Unlimited video coaching sessions available anytime.'
                                        : 'Weekly video check-ins included with your PRO plan.'}
                                </p>
                                <button style={{
                                    padding: '18px 50px', borderRadius: '16px',
                                    background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
                                    border: 'none', color: '#000', fontWeight: '900',
                                    fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit',
                                    letterSpacing: '1px', boxShadow: `0 8px 30px ${plan.color}30`
                                }}>
                                    📞 START VIDEO CALL
                                </button>
                                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', marginTop: '16px', fontWeight: '500' }}>
                                    Your coach will be notified when you call
                                </p>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '4rem', marginBottom: '20px', opacity: 0.3 }}>🔒</div>
                                <h3 style={{ fontSize: '1.3rem', fontWeight: '900', marginBottom: '10px' }}>
                                    Video Calls Not Available
                                </h3>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto 30px', lineHeight: '1.6' }}>
                                    Upgrade to PRO (₹3,000/6mo) or ELITE (₹5,400/yr) to unlock video coaching sessions with your trainer.
                                </p>
                                <button
                                    onClick={() => navigate('/dashboard#membership')}
                                    style={{
                                        padding: '14px 40px', borderRadius: '14px',
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        border: 'none', color: '#000', fontWeight: '900',
                                        fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit'
                                    }}
                                >
                                    UPGRADE PLAN
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== MY PLAN TAB ===== */}
                {activeTab === 'plan' && (
                    <div style={{ flex: 1, padding: '40px 28px', overflowY: 'auto' }}>
                        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                            {/* Plan Overview */}
                            <div style={{
                                background: `${plan.color}08`,
                                border: `1px solid ${plan.color}20`,
                                borderRadius: '24px', padding: '32px', marginBottom: '24px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                                    <span style={{ fontSize: '2.5rem' }}>{plan.icon}</span>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', marginBottom: '4px' }}>{plan.name} Plan</h2>
                                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: '600' }}>
                                            {planId === 'monthly' ? '₹600/month' : planId === 'half-yearly' ? '₹3,000/6 months' : '₹5,400/year'}
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    {plan.features.map((f, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '10px 16px', borderRadius: '12px',
                                            background: 'rgba(255,255,255,0.03)'
                                        }}>
                                            <span style={{ color: plan.color, fontWeight: '900', fontSize: '0.85rem' }}>✓</span>
                                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: '600' }}>{f}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Your Coach */}
                            <div style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '24px', padding: '32px', marginBottom: '24px'
                            }}>
                                <h3 style={{ fontSize: '0.7rem', fontWeight: '800', color: 'rgba(255,255,255,0.3)', letterSpacing: '1.5px', marginBottom: '20px', textTransform: 'uppercase' }}>
                                    ASSIGNED COACH
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        width: '60px', height: '60px', borderRadius: '18px',
                                        overflow: 'hidden', border: `2px solid ${plan.color}40`
                                    }}>
                                        <img src={coachInfo.image || trainer1} alt={coachInfo.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>{coachInfo.name}</h4>
                                        <p style={{ color: plan.color, fontSize: '0.8rem', fontWeight: '700' }}>
                                            {coachInfo.specialty || 'Personal Coach'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Upgrade CTA (for non-elite plans) */}
                            {planId !== 'yearly' && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(250,204,21,0.05))',
                                    border: '1px solid rgba(34,197,94,0.15)',
                                    borderRadius: '24px', padding: '28px', textAlign: 'center'
                                }}>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '8px' }}>
                                        Want more features? 🚀
                                    </h3>
                                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginBottom: '20px' }}>
                                        {'Upgrade to ELITE for unlimited video coaching and 24/7 support'}
                                    </p>
                                    <button
                                        onClick={() => navigate('/dashboard#membership')}
                                        style={{
                                            padding: '14px 36px', borderRadius: '14px',
                                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            border: 'none', color: '#000', fontWeight: '900',
                                            fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                                            letterSpacing: '0.5px'
                                        }}
                                    >
                                        UPGRADE NOW
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default CoachChat
