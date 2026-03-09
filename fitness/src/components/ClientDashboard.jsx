import { useState, useEffect, useRef } from 'react'
import { auth, db } from '../firebase'
import { addDoc, collection, doc, getDoc, getDocFromCache, getDocFromServer, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, limit, getDocs, where } from 'firebase/firestore'
import { useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import './ClientDashboard.css'
import './Membership.css'
import logo from '../assets/logo.jpg'
import heroAthlete from '../assets/hero-athlete.png'
import train1 from '../assets/train-1.png'
import train2 from '../assets/train-2.png'
import train3 from '../assets/train-3.png'
import trainer1 from '../assets/trainer-1.png'
import trainer2 from '../assets/trainer-2.png'
import trainer3 from '../assets/trainer-3.png'

function ClientDashboard() {
    const navigate = useNavigate()
    const location = useLocation()

    const [userData, setUserData] = useState(location.state?.fastData || null)
    const [loading, setLoading] = useState(!location.state?.fastData)
    const [isRevealing, setIsRevealing] = useState(false)

    // Chatbot State
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isFlipped, setIsFlipped] = useState(false)
    const [activeTrainingIndex, setActiveTrainingIndex] = useState(0)
    const [chatInput, setChatInput] = useState('')
    const [messages, setMessages] = useState([
        { id: 1, text: "Hey! I'm your GrowFit AI. How can I help you today?", sender: 'bot' }
    ])
    const [chatLoading, setChatLoading] = useState(false)

    const [isWorkoutOpen, setIsWorkoutOpen] = useState(false)
    const [workoutPlanText, setWorkoutPlanText] = useState('')
    const [workoutLoaded, setWorkoutLoaded] = useState(false)
    const [markingWorkout, setMarkingWorkout] = useState(false)

    const [isDietOpen, setIsDietOpen] = useState(false)
    const [dietPlanText, setDietPlanText] = useState('')
    const [dietLoaded, setDietLoaded] = useState(false)

    // Membership Feature Gating
    const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)
    const [upgradeStep, setUpgradeStep] = useState('selection') // 'selection' | 'payment' | 'success'
    const [selectedPlan, setSelectedPlan] = useState(null)
    const [paymentProcessing, setPaymentProcessing] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('card')

    // Gym Payment Modal (₹600 STARTER)
    const [showGymPayModal, setShowGymPayModal] = useState(false)
    const [gymPayProcessing, setGymPayProcessing] = useState(false)
    const [gymPayStep, setGymPayStep] = useState('summary') // 'summary' | 'payment'
    const [gymPayMethod, setGymPayMethod] = useState('card')

    // Membership Expiry
    const [expiryAlert, setExpiryAlert] = useState(null) // { daysLeft, expired }

    const MEMBERSHIP_TIERS = {
        free: { rank: 0, name: 'Free', features: ['home', 'contact'], price: 0 },
        silver: { rank: 1, name: 'Silver Warrior', features: ['home', 'contact', 'workouts', 'trainers'], price: 29 },
        gold: { rank: 2, name: 'Gold Elite', features: ['home', 'contact', 'workouts', 'trainers', 'diet', 'chat', 'premium_assets'], price: 59 }
    }

    const currentTier = userData?.membershipTier ? MEMBERSHIP_TIERS[userData.membershipTier] : MEMBERSHIP_TIERS.free

    const hasAccess = (feature) => {
        if (!currentTier) return false
        return currentTier.features.includes(feature) || currentTier.rank >= 3 // Admin/Override
    }

    const getChatId = (trainerId, clientId) => {
        const ids = [String(trainerId || ''), String(clientId || '')].sort()
        return `chat_${ids[0]}_${ids[1]}`
    }

    const todayKey = () => {
        const d = new Date()
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
    }

    // Animation / Mouse Parallax State
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
    const handleMouseMove = (e) => {
        const { clientX, clientY } = e
        const moveX = (clientX - window.innerWidth / 2) / 60 // Subtle movement
        const moveY = (clientY - window.innerHeight / 2) / 60
        setMousePos({ x: moveX, y: moveY })
    }

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove)
        return () => window.removeEventListener('mousemove', handleMouseMove)
    }, [])

    // Check membership expiry
    useEffect(() => {
        if (!userData?.membershipPlan || userData.membershipPlan !== 'monthly') return
        const updatedAt = userData?.updatedAt
        if (!updatedAt) return
        const startDate = updatedAt.toDate ? updatedAt.toDate() : new Date(updatedAt)
        const expiryDate = new Date(startDate)
        expiryDate.setMonth(expiryDate.getMonth() + 1)
        const now = new Date()
        const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24))
        if (daysLeft <= 5) {
            setExpiryAlert({ daysLeft, expired: daysLeft <= 0 })
        }
    }, [userData])

    // Auto-swap training cards every 5 seconds
    useEffect(() => {
        let interval;
        if (!isFlipped) {
            interval = setInterval(() => {
                setActiveTrainingIndex(prev => (prev + 1) % 3);
            }, 5000);
        }
        return () => clearInterval(interval);
    }, [isFlipped]);

    const chatEndRef = useRef(null)

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userRef = doc(db, 'users', user.uid)

                    let userSnap
                    try {
                        userSnap = await getDocFromCache(userRef)
                    } catch {
                        try {
                            userSnap = await getDocFromServer(userRef)
                        } catch {
                            userSnap = await getDoc(userRef)
                        }
                    }

                    if (userSnap.exists()) {
                        setUserData(userSnap.data())
                    } else if (!userData) {
                        setUserData({ name: user.displayName || 'Athlete', email: user.email })
                    }
                } catch (error) {
                    console.error("Dashboard Sync Error:", error)
                }
            } else {
                navigate('/')
            }
            setLoading(false)
        })

        return () => {
            unsubscribe()
        }
    }, [navigate])

    useEffect(() => {
        if (!auth.currentUser?.uid) return
        const trainerId = userData?.trainerId
        if (!trainerId) return

        const chatId = getChatId(trainerId, auth.currentUser.uid)
        const qMsgs = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'))

        const unsubscribe = onSnapshot(qMsgs, (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
            const mapped = rows.map((m) => ({
                id: m.id,
                text: m.text || '',
                sender: m.senderRole === 'trainer' ? 'bot' : 'user'
            }))
            setMessages(mapped.length > 0 ? mapped : [{ id: 1, text: "Start chatting with your coach.", sender: 'bot' }])
        }, (err) => {
            console.error('Client chat listener error:', err)
        })

        return () => unsubscribe()
    }, [userData])

    useEffect(() => {
        if (!auth.currentUser?.uid) return
        if (!userData?.trainerId) return
        const planRef = doc(db, 'workoutPlans', auth.currentUser.uid)
        const unsubscribe = onSnapshot(planRef, (snap) => {
            if (snap.exists()) {
                setWorkoutPlanText(String(snap.data()?.planText || ''))
            } else {
                setWorkoutPlanText('')
            }
            setWorkoutLoaded(true)
        }, (err) => {
            console.error('Workout plan listener error:', err)
            setWorkoutLoaded(true)
        })
        return () => unsubscribe()
    }, [userData])

    useEffect(() => {
        if (!auth.currentUser?.uid) return
        if (!userData?.trainerId) return
        const dietRef = doc(db, 'dietPlans', auth.currentUser.uid)
        const unsubscribe = onSnapshot(dietRef, (snap) => {
            if (snap.exists()) {
                setDietPlanText(String(snap.data()?.planText || ''))
            } else {
                setDietPlanText('')
            }
            setDietLoaded(true)
        }, (err) => {
            console.error('Diet plan listener error:', err)
            setDietLoaded(true)
        })
        return () => unsubscribe()
    }, [userData])

    const handleMarkTodayWorkoutDone = async () => {
        if (!auth.currentUser?.uid) return
        if (!userData?.trainerId) return
        setMarkingWorkout(true)
        try {
            const dayId = todayKey()
            await setDoc(doc(db, 'workoutProgress', auth.currentUser.uid, 'days', dayId), {
                clientId: auth.currentUser.uid,
                trainerId: userData.trainerId,
                date: dayId,
                completed: true,
                updatedAt: serverTimestamp(),
            }, { merge: true })
            alert('Marked completed for today')
        } catch (e) {
            alert(e?.message || String(e))
        } finally {
            setMarkingWorkout(false)
        }
    }

    // Trigger reveal animation after loading
    useEffect(() => {
        if (!loading) {
            setTimeout(() => setIsRevealing(true), 100)
        }
    }, [loading])

    const handleLogout = async () => {
        await auth.signOut()
        navigate('/')
    }

    const handleSendMessage = (e) => {
        e.preventDefault()
        if (!chatInput.trim()) return

        const text = chatInput.trim()
        setChatInput('')

        if (!auth.currentUser?.uid || !userData?.trainerId) {
            setMessages(prev => [...prev, { id: Date.now(), text: 'No trainer assigned yet.', sender: 'bot' }])
            return
        }

        setChatLoading(true)
        const chatId = getChatId(userData.trainerId, auth.currentUser.uid)
        setDoc(doc(db, 'chats', chatId), {
            chatId,
            trainerId: userData.trainerId,
            clientId: auth.currentUser.uid,
            updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => { })

        addDoc(collection(db, 'chats', chatId, 'messages'), {
            text,
            senderRole: 'client',
            senderId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
        }).catch((err) => {
            console.error('Send chat failed:', err)
        }).finally(() => {
            setChatLoading(false)
        })
    }

    const handleInitiateUpgrade = (tier) => {
        setSelectedPlan(tier)
        setUpgradeStep('payment')
    }

    const handlePaymentAndUpgrade = async (e) => {
        e.preventDefault()
        if (!auth.currentUser?.uid || !selectedPlan) return

        setPaymentProcessing(true)

        // Simulating Payment Gateway Delay
        await new Promise(r => setTimeout(r, 2000))

        try {
            // Auto-assign logic: Find a trainer if not assigned
            let newTrainerId = userData?.trainerId
            if (!newTrainerId) {
                try {
                    const qT = query(collection(db, 'users'), where('role', '==', 'trainer'), limit(1));
                    const tSnap = await getDocs(qT);
                    if (!tSnap.empty) {
                        newTrainerId = tSnap.docs[0].id;
                    }
                } catch (err) {
                    console.warn("Auto-assign trainer failed:", err)
                }
            }

            const updateData = {
                membershipTier: selectedPlan
            }
            if (newTrainerId) updateData.trainerId = newTrainerId

            await setDoc(doc(db, 'users', auth.currentUser.uid), updateData, { merge: true })

            setUserData(prev => ({ ...prev, membershipTier: selectedPlan, trainerId: newTrainerId || prev.trainerId }))
            setUpgradeStep('success')

            setTimeout(() => {
                setIsUpgradeOpen(false)
                setUpgradeStep('selection')
                setSelectedPlan(null)
                setPaymentProcessing(false)
            }, 2500)

        } catch (e) {
            console.error("Upgrade error:", e)
            alert("Payment failed. Please try again.")
            setPaymentProcessing(false)
        }
    }

    const handleDetailedPlanClick = (planName) => {
        if (planName === 'STARTER') {
            navigate('/gym-payment')
            return
        }

        const mapping = {
            'TRANSFORMATION': 'half-yearly',
            'ELITE': 'yearly'
        }
        const planId = mapping[planName]
        if (planId) {
            navigate('/select-coach', { state: { planId } })
        }
    }

    if (loading && !userData) {
        return (
            <div className="loading-screen" style={{
                background: 'var(--bg-dark)',
                color: 'var(--primary)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                gap: '20px'
            }}>
                <div className="loader-pulse" style={{
                    width: '60px',
                    height: '60px',
                    border: '3px solid rgba(34, 197, 94, 0.1)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite'
                }}></div>
                <p style={{ letterSpacing: '3px', fontWeight: '900', fontSize: '0.75rem', opacity: 0.8 }}>INITIALIZING NEURAL LINK...</p>
            </div>
        )
    }

    return (
        <div className={`dashboard-container ${isRevealing ? 'is-revealed' : ''}`} style={{
            opacity: isRevealing ? 1 : 0,
            transform: isRevealing ? 'scale(1)' : 'scale(1.08)',
            filter: isRevealing ? 'brightness(1) blur(0px)' : 'brightness(0) blur(10px)',
            transition: 'opacity 1.5s ease-out, transform 1.8s cubic-bezier(0.2, 0.8, 0.2, 1), filter 1.5s ease-out',
            minHeight: '100vh',
            background: 'var(--bg-dark)'
        }}>
            <div style={{ position: 'fixed', right: '22px', bottom: '22px', zIndex: 2100, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {hasAccess('workouts') && (
                    <button
                        onClick={() => setIsWorkoutOpen(true)}
                        style={{
                            background: 'rgba(34, 197, 94, 0.18)', border: '1px solid rgba(34, 197, 94, 0.35)',
                            color: '#fff', fontWeight: 900, padding: '12px 14px', borderRadius: '14px', cursor: 'pointer',
                            backdropFilter: 'blur(10px)', animation: 'slideInRight 0.5s ease-out'
                        }}
                    >
                        WORKOUT PLAN
                    </button>
                )}
                {hasAccess('diet') && (
                    <button
                        onClick={() => setIsDietOpen(true)}
                        style={{
                            background: 'rgba(59, 130, 246, 0.18)', border: '1px solid rgba(59, 130, 246, 0.35)',
                            color: '#fff', fontWeight: 900, padding: '12px 14px', borderRadius: '14px', cursor: 'pointer',
                            backdropFilter: 'blur(10px)', animation: 'slideInRight 0.5s ease-out 0.1s backwards'
                        }}
                    >
                        DIET PROTOCOL
                    </button>
                )}
                {hasAccess('chat') && userData?.trainerId && (
                    <button
                        onClick={() => navigate('/coach-chat')}
                        style={{
                            background: 'rgba(56, 189, 248, 0.18)', border: '1px solid rgba(56, 189, 248, 0.35)',
                            color: '#fff', fontWeight: 900, padding: '12px 14px', borderRadius: '14px', cursor: 'pointer',
                            backdropFilter: 'blur(10px)', animation: 'slideInRight 0.5s ease-out 0.2s backwards'
                        }}
                    >
                        LIVE COACH CHAT
                    </button>
                )}
            </div>

            {isWorkoutOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(16px)', zIndex: 9998, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '20px'
                }}>
                    <div style={{
                        width: 'min(980px, 96vw)', height: 'min(760px, 92vh)',
                        background: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '28px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '2px' }}>WORKOUT PLAN</div>
                                <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.2rem' }}>Your Weekly Plan</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => setIsWorkoutOpen(false)}
                                    style={{
                                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#fff', fontWeight: 900, padding: '10px 14px', borderRadius: '14px', cursor: 'pointer'
                                    }}
                                >
                                    CLOSE
                                </button>
                                <button
                                    onClick={handleMarkTodayWorkoutDone}
                                    disabled={markingWorkout || !userData?.trainerId}
                                    style={{
                                        background: 'var(--primary)', border: 'none', color: '#000', fontWeight: 900,
                                        padding: '10px 14px', borderRadius: '14px', cursor: 'pointer', opacity: markingWorkout ? 0.8 : 1
                                    }}
                                >
                                    {markingWorkout ? '...' : 'MARK TODAY DONE'}
                                </button>
                            </div>
                        </div>

                        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                            {!userData?.trainerId && (
                                <div style={{ color: 'rgba(255,255,255,0.6)' }}>No trainer assigned yet.</div>
                            )}
                            {userData?.trainerId && !workoutLoaded && (
                                <div style={{ color: 'rgba(255,255,255,0.6)' }}>Loading plan...</div>
                            )}
                            {userData?.trainerId && workoutLoaded && !workoutPlanText && (
                                <div style={{ color: 'rgba(255,255,255,0.6)' }}>No workout plan uploaded yet.</div>
                            )}
                            {userData?.trainerId && workoutLoaded && !!workoutPlanText && (
                                <pre style={{
                                    whiteSpace: 'pre-wrap',
                                    color: '#fff',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    padding: '14px',
                                    lineHeight: 1.6,
                                    fontFamily: 'inherit'
                                }}>{workoutPlanText}</pre>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Entrance Scanner Line */}
            <div className="scan-line" style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '3px',
                background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
                boxShadow: '0 0 30px var(--primary)',
                zIndex: 2000,
                pointerEvents: 'none',
                opacity: isRevealing ? 0 : 1,
                transform: isRevealing ? 'translateY(100vh)' : 'translateY(-10vh)',
                transition: isRevealing ? 'transform 1.8s cubic-bezier(0.15, 0.85, 0.85, 0.15), opacity 1.5s ease-in 0.3s' : 'none',
            }}></div>

            {/* Consolidated Premium Top Header */}
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                padding: '25px 50px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 1000,
                pointerEvents: 'none',
                transform: isRevealing ? 'translateY(0)' : 'translateY(-50px)',
                opacity: isRevealing ? 1 : 0,
                transition: 'all 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.6s'
            }}>
                {/* Left Side: Logo & Branding */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '15px',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        height: '50px'
                    }}
                    onClick={() => navigate('/dashboard')}
                >
                    <img
                        src={logo}
                        alt="GrowFit Logo"
                        style={{
                            width: '45px',
                            height: '45px',
                            borderRadius: '12px',
                            boxShadow: '0 5px 20px var(--primary-glow)',
                            border: '1px solid var(--glass-border)',
                            objectFit: 'cover'
                        }}
                    />
                    <span style={{
                        fontSize: '1.4rem',
                        fontWeight: '900',
                        background: 'linear-gradient(to right, #ffffff, var(--primary))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '-0.5px',
                        display: 'block',
                        lineHeight: '1'
                    }}>
                        GrowFit
                    </span>
                </div>

                {/* Center: Navigation Links */}
                <nav style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    padding: '6px 10px',
                    borderRadius: '50px',
                    border: '1px solid var(--glass-border)',
                    backdropFilter: 'blur(25px)',
                    pointerEvents: 'auto',
                    height: '54px'
                }}>
                    {['Home', 'Services', 'Membership', 'Contact'].map((item, idx) => {
                        const isMembership = item === 'Membership'

                        // HIDE MEMBERSHIP NAV IF ALREADY TAKEN
                        if (isMembership && userData?.membershipTier && userData.membershipTier !== 'free') return null;

                        return (
                            <a
                                key={item}
                                href={`#${item.toLowerCase()}`}
                                style={{
                                    color: idx === 0 ? '#fff' : isMembership ? '#22c55e' : 'rgba(255, 255, 255, 0.5)',
                                    textDecoration: 'none',
                                    fontSize: '0.9rem',
                                    fontWeight: isMembership ? '800' : '700',
                                    padding: '10px 28px',
                                    borderRadius: '50px',
                                    background: idx === 0 ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                                    border: '1px solid transparent',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    letterSpacing: '0.5px',
                                    height: '42px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: isMembership ? '6px' : '0',
                                    cursor: 'pointer'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.color = isMembership ? '#000' : '#fff';
                                    e.currentTarget.style.background = isMembership ? '#22c55e' : 'rgba(255, 255, 255, 0.05)';
                                }}
                                onMouseOut={(e) => {
                                    if (idx === 0) {
                                        e.currentTarget.style.color = '#fff';
                                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.15)';
                                    } else if (isMembership) {
                                        e.currentTarget.style.color = '#22c55e';
                                        e.currentTarget.style.background = 'transparent';
                                    } else {
                                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                                        e.currentTarget.style.background = 'transparent';
                                    }
                                }}
                            >
                                {isMembership && <span style={{ fontSize: '0.85rem' }}>💎</span>}
                                {item}
                            </a>
                        )
                    })}
                </nav>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '15px',
                    pointerEvents: 'auto',
                    height: '50px'
                }}>
                    {/* Dedicated Profile Wrapper for Dropdown Anchoring */}
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
                        {/* Dynamic User Profile Display (Clickable) */}
                        <div
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '5px 15px 5px 5px',
                                borderRadius: '50px',
                                border: `1px solid ${isProfileOpen ? 'var(--primary)' : 'var(--glass-border)'}`,
                                backdropFilter: 'blur(20px)',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                height: '45px'
                            }}>
                            {auth.currentUser?.photoURL ? (
                                <img
                                    src={auth.currentUser.photoURL}
                                    alt="Profile"
                                    style={{
                                        width: '35px',
                                        height: '35px',
                                        borderRadius: '50%',
                                        border: '2px solid var(--primary)',
                                        objectFit: 'cover'
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: '35px',
                                    height: '35px',
                                    borderRadius: '50%',
                                    background: 'var(--primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '900',
                                    fontSize: '1rem',
                                    color: '#000'
                                }}>
                                    {userData?.name?.[0] || 'A'}
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        fontSize: '0.85rem',
                                        fontWeight: '800',
                                        color: '#fff',
                                        lineHeight: '1.1'
                                    }}>
                                        {userData?.name || 'Athlete'}
                                    </span>
                                    {userData?.membershipTier && userData.membershipTier !== 'free' && (
                                        <span style={{
                                            fontSize: '0.6rem',
                                            fontWeight: '900',
                                            color: userData.membershipTier === 'gold' ? '#fbbf24' : '#94a3b8',
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            border: `1px solid ${userData.membershipTier === 'gold' ? '#fbbf24' : '#94a3b8'}44`,
                                            letterSpacing: '0.5px'
                                        }}>
                                            {userData.membershipTier.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <span style={{
                                    fontSize: '0.65rem',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    fontWeight: '600'
                                }}>
                                    {userData?.email?.slice(0, 18) || auth.currentUser?.email?.slice(0, 18)}...
                                </span>
                            </div>
                            <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.7rem', marginLeft: '5px' }}>
                                {isProfileOpen ? '▲' : '▼'}
                            </span>
                        </div>

                        {/* Profile Dropdown Menu */}
                        {isProfileOpen && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                marginTop: '15px',
                                right: 0,
                                background: 'rgba(15, 23, 42, 0.98)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '16px',
                                padding: '10px',
                                minWidth: '200px',
                                zIndex: 1001,
                                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                                backdropFilter: 'blur(30px)',
                                animation: 'fadeInUp 0.3s ease-out'
                            }}>
                                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-border)', marginBottom: '8px' }}>
                                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: '800', letterSpacing: '1px' }}>ACCOUNT</p>
                                    <div style={{
                                        marginTop: '10px', padding: '10px', background: 'rgba(255,255,255,0.03)',
                                        borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <p style={{ margin: 0, fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: '900', letterSpacing: '1px' }}>ACTIVE PLAN</p>
                                        <p style={{
                                            margin: '4px 0 0 0', fontSize: '0.9rem', fontWeight: '950',
                                            color: userData?.membershipTier === 'gold' ? '#fbbf24' : userData?.membershipTier === 'silver' ? '#94a3b8' : '#fff'
                                        }}>
                                            {userData?.membershipTier ? userData.membershipTier.toUpperCase() : 'FREE PLAN'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: '#ff4d4d',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.3s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'flex-start',
                                        gap: '12px'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                                    onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                                >
                                    <span style={{ fontSize: '1.2rem' }}>⎋</span> Log Out
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Premium Sign In / Sign Up Button (Compact) */}
                    {!auth.currentUser && (
                        <button
                            style={{
                                height: '45px',
                                padding: '0 25px',
                                background: 'linear-gradient(135deg, var(--primary) 0%, #16a34a 100%)',
                                border: 'none',
                                borderRadius: '50px',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: '800',
                                boxShadow: '0 8px 16px rgba(34, 197, 94, 0.25)',
                                transition: 'all 0.4s ease',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase'
                            }}
                        >
                            Sign In
                        </button>
                    )}
                </div>





            </header >

            <main className="dashboard-content" style={{
                minHeight: '100vh',
                paddingTop: '120px',
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '40px'
            }}>
                <div id="home" style={{
                    width: '100%',
                    maxWidth: '1400px',
                    padding: '0 50px',
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr',
                    gap: '80px',
                    alignItems: 'center'
                }}>
                    {/* Left Side: Quotation & CTA */}
                    <div style={{ animation: 'fadeInLeft 1s ease-out' }}>
                        <h1 style={{
                            fontSize: '4.2rem',
                            fontWeight: '900',
                            lineHeight: '1.1',
                            color: '#fff',
                            marginBottom: '20px',
                            letterSpacing: '-1.5px'
                        }}>
                            <div style={{ animation: 'fadeInLeft 0.8s ease-out backwards' }}>TRAIN INSANE</div>
                            <div style={{
                                animation: 'fadeInLeft 0.8s ease-out 0.2s backwards',
                                background: 'linear-gradient(90deg, var(--primary) 0%, #fff 50%, var(--primary) 100%)',
                                backgroundSize: '200% auto',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textTransform: 'uppercase',
                                display: 'inline-block'
                            }}>
                                OR REMAIN THE SAME
                            </div>
                        </h1>
                        <p style={{
                            fontSize: '1.1rem',
                            color: 'rgba(255,255,255,0.6)',
                            fontWeight: '500',
                            maxWidth: '520px',
                            lineHeight: '1.7',
                            marginBottom: '35px',
                            animation: 'fadeInLeft 0.8s ease-out 0.4s backwards'
                        }}>
                            The only bad workout is the one that didn't happen. Success starts with self-discipline and ends with results that define who you are.
                        </p>
                    </div>

                    {/* Right Side: Interactive Training Stack (Swap & Flip) */}
                    <div style={{
                        position: 'relative',
                        height: '600px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'fadeInRight 1.5s ease-out'
                    }}>
                        {[0, 1, 2].map((idx) => {
                            const isActive = (activeTrainingIndex % 3) === idx;
                            const order = (idx - (activeTrainingIndex % 3) + 3) % 3;

                            // Visual positioning based on stack order
                            let transform = '';
                            let zIndex = 0;
                            let opacity = 1;
                            let filter = 'none';

                            if (order === 0) { // Front Card
                                zIndex = 10;
                                transform = `translate(${mousePos.x * 0.8}px, ${mousePos.y * 0.8}px) scale(1) rotate(-3deg)`;
                            } else if (order === 1) { // Middle Card
                                zIndex = 5;
                                opacity = 0.7;
                                filter = 'blur(1px)';
                                transform = `translate(${mousePos.x * -0.4 - 140}px, ${mousePos.y * -0.4 - 60}px) scale(0.9) rotate(8deg)`;
                            } else { // Back Card
                                zIndex = 2;
                                opacity = 0.4;
                                filter = 'blur(2px)';
                                transform = `translate(${mousePos.x * 1.1 + 160}px, ${mousePos.y * 1.1 + 40}px) scale(0.8) rotate(-10deg)`;
                            }

                            return (
                                <div
                                    key={idx}
                                    style={{
                                        position: 'absolute',
                                        width: '320px',
                                        height: '440px',
                                        zIndex: zIndex,
                                        transform: transform,
                                        transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => {
                                        if (!isActive) {
                                            setActiveTrainingIndex(idx);
                                        }
                                    }}
                                >
                                    <div style={{
                                        width: '100%',
                                        height: '100%',
                                        position: 'relative',
                                        borderRadius: '24px',
                                        overflow: 'hidden',
                                        border: '1px solid var(--glass-border)',
                                        boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
                                        opacity: opacity,
                                        filter: filter,
                                        transition: 'all 0.6s ease'
                                    }}>
                                        <img
                                            src={[train1, train2, train3][idx]}
                                            alt="Training"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0,
                                            left: 0,
                                            width: '100%',
                                            padding: '20px',
                                            background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)'
                                        }}>
                                            <p style={{ color: 'var(--primary)', fontWeight: '900', fontSize: '0.6rem', letterSpacing: '2px', margin: 0 }}>
                                                {['STRENGTH', 'PERFORMANCE', 'FLOW'][idx]}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Decorative Atmospheric Glow */}
                        <div style={{
                            position: 'absolute',
                            width: '80%',
                            height: '80%',
                            background: 'var(--primary)',
                            filter: 'blur(150px)',
                            opacity: 0.08,
                            zIndex: 0,
                            animation: 'glowPulse 5s infinite alternate',
                            pointerEvents: 'none'
                        }}></div>
                    </div>
                </div>

                <div id="services" style={{
                    width: '100%',
                    maxWidth: '1400px',
                    padding: '0 50px',
                    animation: isRevealing ? 'fadeInUp 1s ease-out 1s backwards' : 'none'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '80px' }}>
                        <h2 style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', letterSpacing: '-1px', marginBottom: '15px' }}>Our <span style={{ color: 'var(--primary)' }}>Services</span></h2>
                        <div style={{ width: '80px', height: '4px', background: 'var(--primary)', margin: '0 auto', borderRadius: '10px' }}></div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                        {[
                            {
                                icon: '🏋️',
                                title: 'Personal Training',
                                features: ['Customized workout plans', 'All skill levels', 'Home & gym flexibility']
                            },
                            {
                                icon: '🥗',
                                title: 'AI Diet Planning',
                                features: ['Personalized Indian recipes', 'Calorie-matched meals', 'Macronutrient breakdown']
                            },
                            {
                                icon: '🎥',
                                title: 'Workout Video Library',
                                features: ['Exercise demo videos', 'Correct form guidance', 'Trainer-recorded sessions']
                            },
                            {
                                icon: '💬',
                                title: 'Trainer Chat & Support',
                                features: ['Direct chat with trainer', 'Weekly feedback', 'Motivation & follow-ups']
                            }
                        ].map((service, idx) => (
                            <div key={idx} className="feature-card">
                                <div style={{ fontSize: '2.5rem', marginBottom: '25px', animation: 'float 4s infinite ease-in-out' }}>{service.icon}</div>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff', marginBottom: '20px' }}>{service.title}</h3>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>
                                    {service.features.map((feature, fIdx) => (
                                        <li key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>
                                            <span style={{ color: 'var(--primary)', fontWeight: '900' }}>•</span> {feature}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ===== COACH / MEMBERSHIP SECTION ===== */}
                {userData?.membershipTier && userData.membershipTier !== 'free' && userData?.trainerId ? (
                    <div id="membership" style={{
                        width: '100%',
                        maxWidth: '1400px',
                        padding: '100px 50px 80px',
                        animation: isRevealing ? 'fadeInUp 1s ease-out 0.5s backwards' : 'none'
                    }}>
                        <div style={{
                            background: 'rgba(34, 197, 94, 0.05)',
                            border: '1px solid rgba(34, 197, 94, 0.2)',
                            borderRadius: '35px',
                            padding: '60px 40px',
                            textAlign: 'center',
                            backdropFilter: 'blur(30px)',
                            position: 'relative',
                            boxShadow: '0 20px 80px rgba(0,0,0,0.4)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                display: 'inline-block', padding: '10px 25px',
                                background: 'rgba(34, 197, 94, 0.15)', borderRadius: '50px',
                                color: 'var(--primary)', fontWeight: '900', fontSize: '0.8rem',
                                letterSpacing: '4px', marginBottom: '30px', border: '1px solid rgba(34, 197, 94, 0.3)'
                            }}>MEMBERSHIP ACTIVE</div>

                            <h2 style={{ fontSize: '3.2rem', fontWeight: '950', color: '#fff', marginBottom: '20px', letterSpacing: '-1.5px' }}>
                                Your <span style={{ color: 'var(--primary)' }}>Master Coach</span> Awaits
                            </h2>

                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.2rem', maxWidth: '700px', margin: '0 auto 45px', lineHeight: '1.8' }}>
                                Welcome back, <b>{userData?.name || 'Athlete'}</b>! You are currently paired with
                                <span style={{ color: 'var(--primary)', fontWeight: '900' }}> {userData?.trainerName || 'your elite trainer'}</span>.
                                Ready to crush your goals today?
                            </p>

                            <button
                                onClick={() => navigate('/coach-chat')}
                                style={{
                                    background: 'var(--primary)',
                                    color: '#000',
                                    padding: '20px 50px',
                                    borderRadius: '18px',
                                    border: 'none',
                                    fontSize: '1.15rem',
                                    fontWeight: '950',
                                    cursor: 'pointer',
                                    boxShadow: '0 15px 45px rgba(34, 197, 94, 0.35)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '15px',
                                    margin: '0 auto',
                                    transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                }}
                            >
                                <span style={{ fontSize: '1.5rem' }}>💬</span> CHAT WITH MASTER
                            </button>
                        </div>
                    </div>
                ) : (
                    <div id="membership" style={{
                        width: '100%',
                        maxWidth: '1400px',
                        padding: '100px 50px 0',
                        animation: isRevealing ? 'fadeInUp 1s ease-out 1.3s backwards' : 'none'
                    }}>
                        {/* Section Header */}
                        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.2)',
                                padding: '8px 20px',
                                borderRadius: '50px',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                color: '#22c55e',
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                marginBottom: '24px'
                            }}>
                                <span>💎</span> PRICING PLANS
                            </div>
                            <h2 style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', letterSpacing: '-1px', marginBottom: '15px' }}>
                                Choose Your <span style={{ color: 'var(--primary)' }}>Power</span>
                            </h2>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto', lineHeight: '1.6' }}>
                                Invest in your transformation with plans built for every fitness journey.
                            </p>
                        </div>

                        {/* Plans Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                            {[
                                {
                                    id: 'monthly',
                                    name: 'STARTER',
                                    icon: '⚡',
                                    iconBg: 'rgba(168, 162, 158, 0.12)',
                                    iconBorder: 'rgba(168, 162, 158, 0.25)',
                                    price: 600,
                                    period: '/month',
                                    perMonth: null,
                                    savings: null,
                                    features: ['Full Gym Access', 'Basic Equipment Usage', 'Locker Room Access', 'Open Gym Hours', 'Self-Guided Workouts'],
                                    checkColor: 'rgba(168, 162, 158, 0.5)',
                                    checkBg: 'rgba(168, 162, 158, 0.1)',
                                    popular: false,
                                    noCoach: true
                                },
                                {
                                    id: 'half-yearly',
                                    name: 'PRO',
                                    icon: '🔥',
                                    iconBg: 'rgba(34, 197, 94, 0.12)',
                                    iconBorder: 'rgba(34, 197, 94, 0.25)',
                                    price: 3000,
                                    period: '/6 months',
                                    perMonth: '₹500/mo',
                                    savings: 'Save ₹600',
                                    features: ['Everything in Starter', 'Personal Coach Assigned', '1-on-1 Coach Chat', 'Custom Workout & Diet Plans', 'Weekly Progress Reviews', 'Supplement Guidance'],
                                    checkColor: '#22c55e',
                                    checkBg: 'rgba(34, 197, 94, 0.12)',
                                    popular: true,
                                    tag: 'MOST POPULAR'
                                },
                                {
                                    id: 'yearly',
                                    name: 'ELITE',
                                    icon: '👑',
                                    iconBg: 'rgba(250, 204, 21, 0.12)',
                                    iconBorder: 'rgba(250, 204, 21, 0.25)',
                                    price: 5400,
                                    period: '/year',
                                    perMonth: '₹450/mo',
                                    savings: 'Save ₹1,800',
                                    features: ['Everything in Pro', 'Personal Coach + Video Calls', 'Advanced Body Analytics', 'Corrective Exercise Therapy', 'Competition Prep Support', 'Exclusive Community Access', '24/7 Priority Support'],
                                    checkColor: '#facc15',
                                    checkBg: 'rgba(250, 204, 21, 0.12)',
                                    popular: false
                                }
                            ].map((plan) => (
                                <div
                                    key={plan.id}
                                    className={`membership-plan-card ${plan.popular ? 'popular' : ''}`}
                                    onClick={() => {
                                        if (plan.noCoach) {
                                            navigate('/gym-payment')
                                        } else {
                                            navigate('/select-coach', { state: { planId: plan.id } })
                                        }
                                    }}
                                >
                                    {plan.popular && <div className="plan-popular-tag">{plan.tag}</div>}

                                    <div className="plan-icon-wrapper" style={{ background: plan.iconBg, border: `1px solid ${plan.iconBorder}` }}>
                                        {plan.icon}
                                    </div>

                                    <div className="plan-name">{plan.name}</div>

                                    <div className="plan-pricing">
                                        <span className="plan-currency">₹</span>
                                        <span className="plan-amount">{plan.price.toLocaleString('en-IN')}</span>
                                        <span className="plan-period">{plan.period}</span>
                                    </div>

                                    {plan.perMonth ? (
                                        <div className="plan-per-month">{plan.perMonth}</div>
                                    ) : (
                                        <div className="plan-per-month">Billed monthly</div>
                                    )}

                                    {plan.savings && (
                                        <div className="plan-savings"><span>🎉</span> {plan.savings}</div>
                                    )}

                                    <div className="plan-divider"></div>

                                    <ul className="plan-features">
                                        {plan.features.map((f, i) => (
                                            <li key={i}>
                                                <span className="check-icon" style={{ background: plan.checkBg, color: plan.checkColor }}>✓</span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        className={`plan-cta-btn ${plan.popular ? 'primary' : 'secondary'}`}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (plan.noCoach) {
                                                navigate('/gym-payment')
                                            } else {
                                                navigate('/select-coach', { state: { planId: plan.id } })
                                            }
                                        }}
                                    >
                                        {plan.noCoach ? 'Join Gym' : (plan.popular ? 'Get Started' : 'Choose Plan')}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Bottom Trust Strip */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '20px',
                            marginTop: '60px'
                        }}>
                            {[
                                { icon: '🏋️', title: 'AI Workouts', desc: 'Smart plans that adapt' },
                                { icon: '🥗', title: 'Indian Diet Plans', desc: 'Culturally relevant nutrition' },
                                { icon: '💬', title: '24/7 AI Support', desc: 'Instant fitness answers' },
                                { icon: '📊', title: 'Progress Tracking', desc: 'Visual analytics' }
                            ].map((item, idx) => (
                                <div key={idx} className="feature-strip-item">
                                    <div className="feature-strip-icon">{item.icon}</div>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: '800', marginBottom: '4px' }}>{item.title}</h4>
                                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ===== MEMBERSHIP EXPIRY ALERT BANNER ===== */}
                {expiryAlert && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, width: '100%',
                        background: expiryAlert.expired
                            ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                            : 'linear-gradient(135deg, #f97316, #ea580c)',
                        padding: '14px 24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
                        zIndex: 10000, animation: 'mFadeUp 0.5s ease-out',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                    }}>
                        <span style={{ fontSize: '1.2rem' }}>
                            {expiryAlert.expired ? '🚨' : '⏰'}
                        </span>
                        <p style={{ fontWeight: '800', fontSize: '0.85rem', color: '#fff', margin: 0 }}>
                            {expiryAlert.expired
                                ? 'Your gym membership has expired! Renew now to continue access.'
                                : `Your gym membership expires in ${expiryAlert.daysLeft} day${expiryAlert.daysLeft !== 1 ? 's' : ''}! Renew to avoid interruption.`}
                        </p>
                        <button
                            onClick={() => navigate('/gym-payment')}
                            style={{
                                padding: '8px 24px', borderRadius: '8px',
                                background: '#fff', color: '#000', border: 'none',
                                fontWeight: '900', fontSize: '0.8rem', cursor: 'pointer',
                                fontFamily: 'inherit', whiteSpace: 'nowrap'
                            }}
                        >
                            {expiryAlert.expired ? 'RENEW NOW' : 'RENEW EARLY'}
                        </button>
                        <button
                            onClick={() => setExpiryAlert(null)}
                            style={{
                                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
                                cursor: 'pointer', fontSize: '1.1rem', fontWeight: '900', padding: '0 4px'
                            }}
                        >✕</button>
                    </div>
                )}

                {/* Contact & About Section */}
                <div id="contact" style={{
                    width: '100%',
                    maxWidth: '1400px',
                    padding: '100px 50px',
                    animation: isRevealing ? 'fadeInUp 1s ease-out 1.6s backwards' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '100px'
                }}>
                    {/* Left: About & Info */}
                    <div>
                        <h2 style={{
                            fontSize: '3rem',
                            fontWeight: '900',
                            color: '#fff',
                            letterSpacing: '-1px',
                            marginBottom: '30px'
                        }}>Get in <span style={{ color: 'var(--primary)' }}>Touch</span></h2>
                        <p style={{
                            fontSize: '1.1rem',
                            color: 'rgba(255,255,255,0.6)',
                            lineHeight: '1.8',
                            marginBottom: '40px'
                        }}>
                            At GrowFit, we’re more than just a gym platform. We're a global community dedicated to pushing the boundaries of human performance. Whether you have a question about our programs or just want to say hi, our team is always ready to connect.
                        </p>

                        <div style={{ display: 'grid', gap: '30px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{
                                    width: '60px',
                                    height: '60px',
                                    borderRadius: '16px',
                                    background: 'rgba(34, 197, 94, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem',
                                    color: 'var(--primary)'
                                }}>📧</div>
                                <div>
                                    <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: '800', marginBottom: '5px' }}>Email Us</h4>
                                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>premreddy@gmail.com</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{
                                    width: '60px',
                                    height: '60px',
                                    borderRadius: '16px',
                                    background: 'rgba(34, 197, 94, 0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem',
                                    color: 'var(--primary)'
                                }}>📞</div>
                                <div>
                                    <h4 style={{ color: '#fff', fontSize: '1rem', fontWeight: '800', marginBottom: '5px' }}>Call Us</h4>
                                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>+91 88854 62451</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Contact Form */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '32px',
                        padding: '50px',
                        backdropFilter: 'blur(20px)'
                    }}>
                        <h3 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '900', marginBottom: '30px' }}>Send a Message</h3>
                        <form style={{ display: 'grid', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <input type="text" placeholder="Your Name" className="contact-input" />
                                <input type="email" placeholder="Email Address" className="contact-input" />
                            </div>
                            <input type="text" placeholder="Subject" className="contact-input" />
                            <textarea placeholder="Your Message" className="contact-input" style={{ height: '150px', resize: 'none', paddingTop: '15px' }}></textarea>
                            <button type="submit" style={{
                                background: 'var(--primary)',
                                color: '#000',
                                border: 'none',
                                borderRadius: '15px',
                                padding: '18px',
                                fontWeight: '900',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                boxShadow: '0 10px 20px rgba(34, 197, 94, 0.2)'
                            }} className="contact-submit">CONNECT NOW 🚀</button>
                        </form>
                    </div>
                </div>

                {/* Footer Section */}
                <footer style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.5)',
                    borderTop: '1px solid var(--glass-border)',
                    padding: '80px 50px 40px',
                    marginTop: '100px'
                }}>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                        gap: '60px',
                        marginBottom: '60px'
                    }}>
                        <div>
                            <img src={logo} alt="Growfit Logo" style={{ height: '40px', marginBottom: '25px' }} />
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', lineHeight: '1.8' }}>
                                Elevating human potential through AI-driven training and elite professional guidance. Join the revolution.
                            </p>
                        </div>
                        <div>
                            <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '800', marginBottom: '25px' }}>Platform</h4>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>
                                {['Workouts', 'Plans', 'Trainers', 'Library'].map(item => (
                                    <li key={item} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' }}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '800', marginBottom: '25px' }}>Support</h4>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>
                                {['Help Center', 'Pricing', 'Contact', 'FAQ'].map(item => (
                                    <li key={item} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' }}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: '800', marginBottom: '25px' }}>Legal</h4>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '12px' }}>
                                {['Privacy Policy', 'Terms of Use', 'Cookies'].map(item => (
                                    <li key={item} style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' }}>{item}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div style={{
                        maxWidth: '1400px',
                        margin: '0 auto',
                        paddingTop: '40px',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '0.85rem'
                    }}>
                        <p>© 2026 GROWFIT AI. ALL RIGHTS RESERVED.</p>
                        <div style={{ display: 'flex', gap: '30px' }}>
                            <span>TWITTER</span>
                            <span>INSTAGRAM</span>
                            <span>LINKEDIN</span>
                        </div>
                    </div>
                </footer>
            </main>


            {
                isDietOpen && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(16px)', zIndex: 9998, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', padding: '20px'
                    }}>
                        <div style={{
                            width: 'min(980px, 96vw)', height: 'min(760px, 92vh)',
                            background: 'rgba(10,10,10,0.95)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '28px', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 900, letterSpacing: '2px' }}>DIET PROTOCOL</div>
                                    <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.2rem' }}>Personalized Formula</div>
                                </div>
                                <button
                                    onClick={() => setIsDietOpen(false)}
                                    style={{
                                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#fff', fontWeight: 900, padding: '10px 14px', borderRadius: '14px', cursor: 'pointer'
                                    }}
                                >
                                    CLOSE
                                </button>
                            </div>

                            <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
                                {!userData?.trainerId && (
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>No trainer assigned yet.</div>
                                )}
                                {userData?.trainerId && !dietLoaded && (
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>Loading protocol...</div>
                                )}
                                {userData?.trainerId && dietLoaded && !dietPlanText && (
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>No diet plan uploaded yet.</div>
                                )}
                                {userData?.trainerId && dietLoaded && !!dietPlanText && (
                                    <pre style={{
                                        whiteSpace: 'pre-wrap',
                                        color: '#fff',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '16px',
                                        padding: '14px',
                                        lineHeight: 1.6,
                                        fontFamily: 'inherit'
                                    }}>{dietPlanText}</pre>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}

export default ClientDashboard
