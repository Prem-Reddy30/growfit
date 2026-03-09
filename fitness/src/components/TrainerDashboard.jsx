import { useState, useEffect, useRef, useMemo } from 'react'
import { auth, db } from '../firebase'
import { addDoc, collection, doc, getDoc, getDocFromCache, getDocFromServer, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import './TrainerDashboard.css'
import logo from '../assets/logo.jpg'
import trainerHero from '../assets/trainer-1.png' // Utilizing the high-quality trainer asset

// Helper for chat time (Global Utility)
const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const SkeletonCard = () => (
    <div style={{
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '24px', padding: '25px', height: '180px',
        position: 'relative', overflow: 'hidden'
    }}>
        <div className="skeleton-pulse" style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '20px' }}></div>
        <div className="skeleton-pulse" style={{ width: '120px', height: '20px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '10px' }}></div>
        <div className="skeleton-pulse" style={{ width: '80px', height: '30px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}></div>
    </div>
)

function TrainerDashboard() {
    const navigate = useNavigate()
    const location = useLocation()
    const [trainerData, setTrainerData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isRevealing, setIsRevealing] = useState(false)
    const [isVerifying, setIsVerifying] = useState(false)
    const [verifyCodeInput, setVerifyCodeInput] = useState('')
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isClosingPortal, setIsClosingPortal] = useState(false)
    const [activeTab, setActiveTab] = useState('roster') // 'roster', 'schedule', 'broadcast', 'resources'

    // Core Data State
    const [assignedById, setAssignedById] = useState([])
    const [assignedBySearch, setAssignedBySearch] = useState([])
    const [sessionRequests, setSessionRequests] = useState([])
    const [announcements, setAnnouncements] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [myCoachProfile, setMyCoachProfile] = useState(null)

    // Joined athletes list (Deduplicated)
    const assignedClients = useMemo(() => {
        const map = new Map();
        assignedById.forEach(c => map.set(c.id, c));
        assignedBySearch.forEach(c => map.set(c.id, c));
        return Array.from(map.values());
    }, [assignedById, assignedBySearch]);

    // Action Modals
    const [selectedClient, setSelectedClient] = useState(null)
    const [isWorkoutEditorOpen, setIsWorkoutEditorOpen] = useState(false)
    const [isDietEditorOpen, setIsDietEditorOpen] = useState(false)
    const [isBroadcastOpen, setIsBroadcastOpen] = useState(false)
    const [isSchedulingOpen, setIsSchedulingOpen] = useState(false)

    // Chat / Progress / Plan State
    const [chatMessages, setChatMessages] = useState([])
    const [workoutPlan, setWorkoutPlan] = useState(null)
    const [dietPlan, setDietPlan] = useState(null)
    const [progressData, setProgressData] = useState([])

    // Form Inputs
    const [chatInput, setChatInput] = useState('')
    const [assignEmail, setAssignEmail] = useState('')
    const [broadcastText, setBroadcastText] = useState('')
    const [sessionDate, setSessionDate] = useState('')
    const [sessionTime, setSessionTime] = useState('')

    // Status Logic
    const [loadingAction, setLoadingAction] = useState(false)
    const chatEndRef = useRef(null)


    const MASTER_COACH_CODE = "approvedcoach"



    // Scroll Reveal Logic
    useEffect(() => {
        const timer = setTimeout(() => setIsRevealing(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        // TURBO-BOOST: Initial fast-load from navigation state
        if (location.state?.turboData) {
            setTrainerData(prev => ({ ...prev, ...location.state.turboData }))
            if (!location.state.turboData.isVerifiedCoach) setIsVerifying(true)
            setLoading(false)
            // Note: Continue below to setup real listeners
        }

        const safetyTimer = setTimeout(() => setLoading(false), 8000);

        const fetchWithRetry = async (uid, retries = 3) => {
            const docRef = doc(db, 'users', uid)
            try {
                const cachedSnap = await getDocFromCache(docRef)
                if (cachedSnap.exists()) return cachedSnap
            } catch (cacheErr) {
                console.warn("Cache miss, trying server...")
            }
            try {
                return await getDocFromServer(docRef)
            } catch (err) {
                if (retries > 0) {
                    await new Promise(res => setTimeout(res, 1000));
                    return fetchWithRetry(uid, retries - 1);
                }
                return await getDoc(docRef)
            }
        }

        let unsubscribeDoc = null;
        const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
            if (unsubscribeDoc) {
                unsubscribeDoc();
                unsubscribeDoc = null;
            }

            try {
                if (user) {
                    unsubscribeDoc = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
                        if (docSnap.exists()) {
                            const userData = docSnap.data()
                            if (userData.role === 'client') {
                                navigate('/dashboard')
                                return
                            }
                            setTrainerData(userData)
                            setIsVerifying(!userData.isVerifiedCoach)
                            setLoading(false)
                            clearTimeout(safetyTimer)
                        }
                    }, (err) => {
                        console.error("User doc sync error:", err)
                    })

                    const docSnap = await fetchWithRetry(user.uid)
                    if (docSnap.exists()) {
                        const userData = docSnap.data()
                        if (userData.role === 'client') {
                            navigate('/dashboard')
                            return
                        }
                        setTrainerData(userData)
                        setIsVerifying(!userData.isVerifiedCoach)
                    } else {
                        setIsVerifying(true)
                    }
                } else {
                    navigate('/trainer')
                }
            } catch (error) {
                console.error("Auth sync error:", error)
            } finally {
                setLoading(false)
                clearTimeout(safetyTimer)
            }
        })

        return () => {
            if (unsubscribeDoc) unsubscribeDoc()
            unsubscribeAuth()
            clearTimeout(safetyTimer)
        }
    }, [navigate, location.state]);

    const handleLogout = async () => {
        try {
            await auth.signOut()
            navigate('/trainer')
        } catch (error) {
            console.error("Logout error:", error)
        }
    }

    const handleVerifyCode = async (e) => {
        e.preventDefault()
        if (verifyCodeInput === MASTER_COACH_CODE) {
            const user = auth.currentUser
            if (!user) {
                alert("Session expired. Please log in again.");
                navigate('/trainer');
                return;
            }

            setLoading(true)
            try {
                // Use setDoc with merge to ensure doc exists
                await setDoc(doc(db, 'users', user.uid), {
                    isVerifiedCoach: true,
                    role: 'trainer'
                }, { merge: true })

                setIsVerifying(false)
                // The onSnapshot listener in the effect will handle updating trainerData
            } catch (error) {
                console.error("Verification error:", error)
                alert(error.message)
            } finally {
                setLoading(false)
            }
        } else {
            alert('Invalid Master Code!')
        }
    }



    // Turbo Skeleton Loader



    // EFFECT: Master Sync for Athletes (The Ironclad Fix)
    useEffect(() => {
        if (!auth.currentUser?.uid) return
        const myUid = auth.currentUser.uid
        const myEmail = (auth.currentUser.email || '').toLowerCase()

        // Derive Search Key: coachprem@gmail.com -> prem
        const emPrefix = myEmail.split('@')[0].toLowerCase()
        const mySearchKey = emPrefix.startsWith('coach') ? emPrefix.replace('coach', '') : emPrefix

        // 1. Fetch my Coach Profile from 'coaches' collection (to get the Coach ID)
        const qCoach = query(collection(db, 'coaches'), where('trainerEmail', '==', myEmail))
        let unsubCoachReg = onSnapshot(qCoach, (snap) => {
            if (!snap.empty) {
                const cDoc = { id: snap.docs[0].id, ...snap.docs[0].data() };
                console.log("Coach Profile Linked:", cDoc.name);
                setMyCoachProfile(cDoc);
            } else {
                console.warn("NO COACH PROFILE FOUND for email:", myEmail);
                setMyCoachProfile({ error: 'MISSING_PROFILE' });
            }
        }, (err) => console.error("Coach Profile sync error:", err));

        // 2. ULTRA-AGGRESSIVE TARGETED QUERIES (Rule Compliant)
        // Query A: Find by my UID
        const qById = query(collection(db, 'users'), where('trainerId', '==', myUid))
        const unsubById = onSnapshot(qById, (snap) => {
            setAssignedById(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.error("Filter ID Error:", err))

        // Query B: Find by my Email
        const qByEmail = query(collection(db, 'users'), where('trainerEmail', '==', myEmail))
        const unsubByEmail = onSnapshot(qByEmail, (snap) => {
            const emailAthletes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setAssignedBySearch(emailAthletes)

            // AUTO-CLAIM: If found by email but not linked by ID, lock them in!
            emailAthletes.forEach(async (ath) => {
                if (ath.trainerId !== myUid) {
                    try {
                        console.log("Auto-Claiming:", ath.email);
                        await updateDoc(doc(db, 'users', ath.id), {
                            trainerId: myUid,
                            role: 'client',
                            trainerAssignedAt: ath.trainerAssignedAt || serverTimestamp()
                        })
                    } catch (e) {
                        // Silent fail if rules block it, search will still show them
                    }
                }
            })
        }, (err) => console.error("Filter Email Error:", err))


        // 3. Sessions & Announcements
        const qSess = query(collection(db, 'sessions'), where('trainerId', '==', myUid), orderBy('createdAt', 'desc'))
        const unsubSess = onSnapshot(qSess, (snap) => {
            setSessionRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })

        const qAnn = query(collection(db, 'announcements'), where('trainerId', '==', myUid), orderBy('createdAt', 'desc'))
        const unsubAnn = onSnapshot(qAnn, (snap) => {
            setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })

        return () => {
            unsubById()
            unsubByEmail()
            unsubSess()
            unsubAnn()
            unsubCoachReg()
        }
    }, [auth.currentUser, myCoachProfile?.id, trainerData?.isVerifiedCoach])

    // EFFECT: Listener for Client Chat (when selected)
    useEffect(() => {
        if (!selectedClient?.id || !auth.currentUser?.uid) {
            setChatMessages([])
            return
        }

        const chatId = [auth.currentUser.uid, selectedClient.id].sort().join('_')
        const qMsgs = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'asc'))

        const unsubChat = onSnapshot(qMsgs, (snap) => {
            setChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        })

        return () => unsubChat()
    }, [selectedClient])

    // Auto-scroll chat for live feel
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatMessages])




    // --- ACTION HANDLERS ---

    // 1. Instant Messaging (Shared Channel Sync)
    const handleSendChat = async () => {
        if (!chatInput.trim() || !selectedClient || !auth.currentUser) return
        const chatId = [auth.currentUser.uid, selectedClient.id].sort().join('_')

        try {
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                text: chatInput,
                senderId: auth.currentUser.uid,
                senderName: trainerData?.name || 'Coach',
                senderRole: 'trainer',
                createdAt: serverTimestamp()
            })
            setChatInput('')
        } catch (e) { console.error("Chat error:", e) }
    }

    // 2. Workout Plan Management (Weekly Sync)
    const handleSaveWorkout = async (e) => {
        e.preventDefault()
        if (!selectedClient) return
        setLoadingAction(true)
        try {
            await setDoc(doc(db, 'workoutPlans', selectedClient.id), {
                ...workoutPlan,
                trainerId: auth.currentUser.uid,
                updatedAt: serverTimestamp()
            }, { merge: true })
            alert("Workout Plan Synchronized")
            setIsWorkoutEditorOpen(false)
        } catch (e) { alert(e.message) }
        setLoadingAction(false)
    }

    // 3. Diet Plan Management (Personalized)
    const handleSaveDiet = async (e) => {
        e.preventDefault()
        if (!selectedClient) return
        setLoadingAction(true)
        try {
            await setDoc(doc(db, 'dietPlans', selectedClient.id), {
                ...dietPlan,
                trainerId: auth.currentUser.uid,
                updatedAt: serverTimestamp()
            }, { merge: true })
            alert("Diet Plan Synchronized")
            setIsDietEditorOpen(false)
        } catch (e) { alert(e.message) }
        setLoadingAction(false)
    }

    // 4. Global Broadcast (Instant Notify)
    const handleBroadcast = async () => {
        if (!broadcastText.trim()) return
        setLoadingAction(true)
        try {
            await addDoc(collection(db, 'announcements'), {
                text: broadcastText,
                trainerId: auth.currentUser.uid,
                trainerName: trainerData?.name || 'Coach',
                createdAt: serverTimestamp()
            })
            setBroadcastText('')
            setIsBroadcastOpen(false)
            alert(`Broadcast sent to ${assignedClients.length} clients`)
        } catch (e) { alert(e.message) }
        setLoadingAction(false)
    }

    // 5. Session Scheduling (Accept/Reject)
    const handleSessionAction = async (sessionId, status) => {
        try {
            await updateDoc(doc(db, 'sessions', sessionId), {
                status: status, // 'accepted' or 'rejected'
                updatedAt: serverTimestamp()
            })
        } catch (e) { console.error("Session update error:", e) }
    }

    // 6. Client Assignment
    const handleAssignClient = async (e) => {
        e.preventDefault()
        const email = assignEmail.trim().toLowerCase()
        if (!email) return
        setLoadingAction(true)
        try {
            const q = query(collection(db, 'users'), where('email', '==', email))
            const snap = await getDocs(q)
            if (snap.empty) {
                alert("Client not found with this email. Have they registered yet?")
            } else {
                const clientDoc = snap.docs[0]
                const clientData = clientDoc.data()

                // IMPORTANT: Ensure they have a tier that triggers the Coach Dashboard
                const newTier = (clientData.membershipTier === 'free' || !clientData.membershipTier) ? 'silver' : clientData.membershipTier;

                await updateDoc(doc(db, 'users', clientDoc.id), {
                    trainerId: auth.currentUser.uid,
                    trainerEmail: auth.currentUser.email.toLowerCase(),
                    trainerName: trainerData?.name || 'Your Master Coach',
                    membershipTier: newTier,
                    role: 'client',
                    trainerAssignedAt: serverTimestamp()
                })
                setAssignEmail('')
                alert(`Successfully assigned ${clientData.name || 'Athlete'} to your roster!`)
            }
        } catch (e) {
            console.error("Assign Error:", e)
            alert(e.message)
        }
        setLoadingAction(false)
    }

    // 7. Progress Tracking & Feedback
    const handleAddFeedback = async (progressId, feedbackText) => {
        if (!feedbackText.trim()) return
        try {
            await updateDoc(doc(db, 'progress', progressId), {
                coachFeedback: feedbackText,
                feedbackAt: serverTimestamp()
            })
        } catch (e) { console.error("Feedback error:", e) }
    }

    // 8. Open Client Profile (Load Plans)
    const handleSelectClient = async (client) => {
        setSelectedClient(client)
        try {
            const wSnap = await getDoc(doc(db, 'workoutPlans', client.id))
            setWorkoutPlan(wSnap.exists() ? wSnap.data() : { weeklyRoutine: {} })

            const dSnap = await getDoc(doc(db, 'dietPlans', client.id))
            setDietPlan(dSnap.exists() ? dSnap.data() : { dailyMeals: {} })

            const pSnap = await getDocs(query(collection(db, 'progress'), where('userId', '==', client.id), orderBy('createdAt', 'desc')))
            setProgressData(pSnap.docs.map(d => ({ id: d.id, ...d.data() })))
        } catch (e) { console.error("Profile load error:", e) }
    }

    // Turbo Skeleton Loader - Render Step (Moved after hooks)
    if (loading) return (
        <div className="dashboard-root" style={{ background: '#000', minHeight: '100vh', padding: '100px 40px' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <div className="skeleton-pulse" style={{ width: '300px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '60px' }}></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px', marginBottom: '50px' }}>
                    <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
                <div style={{ height: '400px', borderRadius: '32px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} className="skeleton-pulse"></div>
            </div>
            <style>{`
                @keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }
                .skeleton-pulse { animation: pulse 1.5s ease-in-out infinite; }
            `}</style>
        </div>
    )

    if (isVerifying) return (
        <div className="dashboard-root trainer-dashboard">
            <div className="verification-overlay-fullscreen" style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
                backdropFilter: 'blur(30px)', zIndex: 10000, display: 'flex',
                alignItems: 'center', justifyContent: 'center'
            }}>
                <div style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                    padding: '60px', borderRadius: '40px', maxWidth: '500px', width: '90%', textAlign: 'center'
                }}>
                    <div style={{
                        fontSize: '0.7rem', fontWeight: '900', color: 'var(--primary)',
                        letterSpacing: '2px', marginBottom: '20px'
                    }}>MASTER AUTHORIZATION REQUIRED</div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '15px' }}>Verify Identity</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '40px', fontSize: '0.9rem' }}>
                        Please enter your unique Master Coach authorization key to activate the command center.
                    </p>
                    <form onSubmit={handleVerifyCode}>
                        <input
                            type="password"
                            placeholder="ENTER MASTER KEY"
                            value={verifyCodeInput}
                            onChange={(e) => setVerifyCodeInput(e.target.value)}
                            style={{
                                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '16px', padding: '20px', color: '#fff', fontSize: '1rem',
                                textAlign: 'center', marginBottom: '30px', outline: 'none'
                            }}
                        />
                        <button type="submit" className="cta-primary" style={{ width: '100%' }}>ACTIVATE CENTER ⚡</button>
                    </form>
                    <button onClick={handleLogout} style={{
                        background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)',
                        marginTop: '25px', cursor: 'pointer', fontWeight: '800', fontSize: '0.8rem'
                    }}>LOGOUT & EXIT</button>
                </div>
            </div>
        </div>
    )

    return (
        <div className="dashboard-root trainer-dashboard">

            {/* Custom Navbar */}
            <nav className="dashboard-nav" style={{
                position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000,
                padding: '25px 50px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(20px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <img src={logo} alt="Growfit" style={{ height: '40px', borderRadius: '10px' }} />
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', letterSpacing: '-1px' }}>
                        MASTER<span style={{ color: 'var(--primary)' }}>COACH</span>
                    </span>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    pointerEvents: 'auto',
                    height: '50px'
                }}>
                    {/* BACK TO ADMIN BUTTON */}
                    <button
                        onClick={() => navigate('/admin')}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            color: '#fff',
                            padding: '10px 20px',
                            fontSize: '0.8rem',
                            fontWeight: '900',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.3s ease'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        }}
                    >
                        <span>⬅</span> BACK TO ADMIN
                    </button>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%' }}>
                        <div
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                padding: '5px 15px 5px 5px',
                                borderRadius: '50px',
                                border: `1px solid ${isProfileOpen ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                                backdropFilter: 'blur(20px)',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                                cursor: 'pointer',
                                userSelect: 'none'
                            }}
                        >
                            {auth.currentUser?.photoURL ? (
                                <img
                                    src={auth.currentUser.photoURL}
                                    alt="Profile"
                                    style={{
                                        width: '35px',
                                        height: '35px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '2px solid rgba(34,197,94,0.6)'
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: '35px',
                                    height: '35px',
                                    borderRadius: '50%',
                                    background: 'rgba(34,197,94,0.15)',
                                    border: '2px solid rgba(34,197,94,0.5)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '900',
                                    color: 'var(--primary)'
                                }}>
                                    {(trainerData?.name || 'C')[0]?.toUpperCase()}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span style={{
                                    fontSize: '0.85rem',
                                    fontWeight: '900',
                                    color: '#fff',
                                    lineHeight: '1.1'
                                }}>
                                    {trainerData?.name || 'Coach'}
                                </span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: '800',
                                    color: 'rgba(255,255,255,0.5)',
                                    lineHeight: '1.1'
                                }}>
                                    {auth.currentUser?.email || 'trainer'}
                                </span>
                            </div>

                            <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.7rem', marginLeft: '5px' }}>
                                {isProfileOpen ? '▲' : '▼'}
                            </span>
                        </div>

                        {isProfileOpen && (
                            <div style={{
                                position: 'absolute',
                                top: 'calc(100% + 10px)',
                                right: 0,
                                width: '260px',
                                background: 'rgba(10,10,10,0.92)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '18px',
                                padding: '12px',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                                backdropFilter: 'blur(24px)'
                            }}>
                                <div style={{ padding: '10px 10px 12px 10px' }}>
                                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '900', color: '#fff' }}>{trainerData?.name || 'Coach'}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{auth.currentUser?.email || ''}</p>
                                    <p style={{ margin: 0, fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: '800', letterSpacing: '1px' }}>ACCOUNT</p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: '14px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#fff',
                                        fontWeight: '900',
                                        cursor: 'pointer'
                                    }}
                                >
                                    LOGOUT
                                </button>
                                <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: '800', letterSpacing: '1px' }}>AVAILABILITY</p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {['ON DUTY', 'OFF DUTY'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => updateDoc(doc(db, 'users', auth.currentUser.uid), { availability: status })}
                                                style={{
                                                    flex: 1, padding: '8px', fontSize: '0.6rem', fontWeight: '900', borderRadius: '8px',
                                                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                                                    background: trainerData?.availability === status ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                                    color: trainerData?.availability === status ? '#000' : '#fff'
                                                }}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </nav>



            <main className="dashboard-content" style={{
                minHeight: '100vh',
                paddingTop: '120px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '80px',
                paddingBottom: '100px'
            }}>

                {/* Hero Section */}
                <div className="trainer-hero" style={{
                    width: '100%',
                    maxWidth: '1400px',
                    padding: '0 50px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: '600px',
                    position: 'relative'
                }}>
                    <div style={{ maxWidth: '650px', zIndex: 2 }}>
                        <div className="text-reveal" style={{
                            display: 'inline-block', padding: '8px 20px', background: 'rgba(34, 197, 94, 0.1)',
                            borderRadius: '50px', color: 'var(--primary)', fontWeight: '900', fontSize: '0.8rem',
                            letterSpacing: '2px', marginBottom: '25px', animationDelay: '0.1s'
                        }}>LEVEL 5 MASTER COACH</div>
                        <h1 className="text-reveal" style={{ fontSize: '5rem', fontWeight: '900', color: '#fff', lineHeight: 1, marginBottom: '30px', animationDelay: '0.2s' }}>
                            Scale Your <span style={{ color: 'var(--primary)' }}>Impact.</span><br />
                            Lead The Revolution.
                        </h1>
                        <p className="text-reveal" style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.6)', lineHeight: '1.8', marginBottom: '40px', animationDelay: '0.3s' }}>
                            Manage your elite roster, analyze biometric data, and deliver world-class transformation results through our integrated AI coaching ecosystem.
                        </p>
                    </div>

                    <div className="trainer-hero-img-container" style={{
                        width: '500px', height: '600px', position: 'relative', overflow: 'hidden',
                        borderRadius: '40px', border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <img src={trainerHero} alt="Coach" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)'
                        }}></div>
                    </div>
                </div>

                {/* Sync Diagnostics (Trainer Only) */}
                {myCoachProfile?.error === 'MISSING_PROFILE' && (
                    <div style={{ width: '100%', maxWidth: '1400px', background: 'rgba(255,0,0,0.1)', border: '1px solid #ff0000', padding: '15px 30px', borderRadius: '16px', animation: 'mFadeUp 0.6s ease-out', marginBottom: '20px' }}>
                        <span style={{ color: '#ff4444', fontWeight: '900' }}>⚠️ WARNING: No Coach Profile found for {auth.currentUser?.email}. Please add this email in the Admin Dashboard "Coaches" section to link your athletes.</span>
                    </div>
                )}

                {assignedClients.length > 0 && (
                    <div
                        className="demo-alert-bar"
                        style={{
                            width: '100%', maxWidth: '1400px',
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                            padding: '15px 30px', borderRadius: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            animation: 'mFadeUp 0.6s ease-out', boxShadow: '0 10px 30px rgba(34,197,94,0.3)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔔</span>
                            <span style={{ color: '#000', fontWeight: '900', fontSize: '1.1rem' }}>
                                NEW ATHLETE ASSIGNED: You have {assignedClients.length} client{assignedClients.length > 1 ? 's' : ''} waiting for your guidance!
                            </span>
                        </div>
                    </div>
                )}

                {/* Stats Grid */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '30px', width: '100%', maxWidth: '1400px', padding: '0 50px'
                }}>
                    <div className="stat-vibe-card" style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '24px', padding: '30px', transition: 'all 0.3s ease'
                    }}>
                        <div id="active-athletes-count" style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', marginBottom: '10px' }}>
                            {assignedClients.length}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: '800', letterSpacing: '1px' }}>
                            ACTIVE ATHLETES
                        </div>
                    </div>
                    <div className="stat-vibe-card" style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '24px', padding: '30px', transition: 'all 0.3s ease'
                    }}>
                        <div style={{ fontSize: '3rem', fontWeight: '900', color: 'var(--primary)', marginBottom: '10px' }}>
                            {sessionRequests.length}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: '800', letterSpacing: '1px' }}>
                            PENDING SESSIONS
                        </div>
                    </div>
                    <div className="stat-vibe-card" style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '24px', padding: '30px', transition: 'all 0.3s ease'
                    }}>
                        <div style={{ fontSize: '3rem', fontWeight: '900', color: '#fff', marginBottom: '10px' }}>
                            {announcements.length}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: '800', letterSpacing: '1px' }}>
                            BROADCASTS SENT
                        </div>
                    </div>
                </div>

                {/* Client Roster */}
                <div style={{ width: '100%', maxWidth: '1400px', padding: '0 50px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                        <div>
                            <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '10px' }}>Elite Roster</h2>
                            <p style={{ color: 'rgba(255,255,255,0.5)' }}>Manage your assigned athletes and track their progress.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <input
                                type="email"
                                placeholder="Assign by Email..."
                                value={assignEmail}
                                onChange={(e) => setAssignEmail(e.target.value)}
                                style={{
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px', padding: '12px 20px', color: '#fff', outline: 'none',
                                    width: '250px'
                                }}
                            />
                            <button onClick={handleAssignClient} className="cta-secondary" style={{ padding: '12px 25px' }}>
                                + ASSIGN
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {assignedClients.map(client => (
                            <div key={client.id} className="roster-row" style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                borderRadius: '20px', padding: '20px 30px', transition: 'all 0.3s ease'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{
                                        width: '50px', height: '50px', borderRadius: '15px',
                                        background: 'rgba(34,197,94,0.1)', color: 'var(--primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: '900', fontSize: '1.2rem'
                                    }}>
                                        {client.name?.[0] || 'A'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff' }}>{client.name || 'Athlete'}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{client.email}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{
                                        fontSize: '0.7rem', fontWeight: '900',
                                        color: client.membershipPlan === 'yearly' ? '#facc15' : client.membershipPlan === 'half-yearly' ? '#22c55e' : '#888',
                                        background: 'rgba(255,255,255,0.03)', padding: '4px 12px', borderRadius: '50px',
                                        textTransform: 'uppercase', letterSpacing: '1px', border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        {client.membershipPlan === 'yearly' ? 'ELITE PLAN' : client.membershipPlan === 'half-yearly' ? 'PRO PLAN' : 'STARTER'}
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginTop: '4px', fontWeight: '700' }}>MEMBERSHIP</div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => handleSelectClient(client)} className="icon-btn" title="Open Chat Control" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                        <span style={{ position: 'relative' }}>
                                            💬
                                            <span style={{ position: 'absolute', top: '-5px', right: '-5px', width: '8px', height: '8px', background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 10px #22c55e' }}></span>
                                        </span>
                                    </button>
                                    <button onClick={() => { setSelectedClient(client); setIsWorkoutEditorOpen(true); }} className="icon-btn" title="Workout Plan">💪</button>
                                    <button onClick={() => { setSelectedClient(client); setIsDietEditorOpen(true); }} className="icon-btn" title="Diet Plan">🥗</button>
                                </div>
                            </div>
                        ))}
                        {assignedClients.length === 0 && (
                            <div style={{
                                padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.02)',
                                borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)'
                            }}>
                                No athletes assigned yet. Use the "Assign" button to build your roster.
                            </div>
                        )}
                    </div>
                </div>

                {/* Toolkit Grid */}
                <div style={{ width: '100%', maxWidth: '1400px', padding: '0 50px' }}>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '40px' }}>Command Toolkit</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
                        <div className="toolkit-card" onClick={() => setIsBroadcastOpen(true)} style={{
                            background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
                            border: '1px solid rgba(255,255,255,0.05)', borderRadius: '30px', padding: '40px',
                            cursor: 'pointer', transition: 'all 0.3s ease'
                        }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '20px' }}>📢</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', marginBottom: '10px' }}>Global Broadcast</h3>
                            <p style={{ color: 'rgba(255,255,255,0.5)', lineHeight: '1.6' }}>Send instant announcements to your entire roster.</p>
                        </div>
                        {/* Add more toolkit items here if needed */}
                    </div>
                </div>

            </main>

            {/* MODALS */}
            {/* Broadcast Modal */}
            {isBroadcastOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
                    zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                        padding: '40px', width: '90%', maxWidth: '600px'
                    }}>
                        <h2 style={{ fontSize: '2rem', fontWeight: '900', color: '#fff', marginBottom: '20px' }}>New Broadcast</h2>
                        <textarea
                            value={broadcastText}
                            onChange={(e) => setBroadcastText(e.target.value)}
                            placeholder="Type your announcement..."
                            style={{
                                width: '100%', height: '150px', background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '20px',
                                color: '#fff', fontSize: '1rem', marginBottom: '30px', resize: 'none'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setIsBroadcastOpen(false)} className="cta-secondary">CANCEL</button>
                            <button onClick={handleBroadcast} className="cta-primary">SEND BROADCAST</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Client Chat Modal */}
            {selectedClient && !isWorkoutEditorOpen && !isDietEditorOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(15px)', zIndex: 10000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '20px'
                }} onClick={() => setSelectedClient(null)}>
                    <div style={{
                        width: '100%', maxWidth: '1200px', height: '85vh', background: '#0a0a0c',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '32px', overflow: 'hidden',
                        display: 'flex', boxShadow: '0 50px 100px rgba(0,0,0,0.8)',
                        animation: 'mFadeUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }} onClick={e => e.stopPropagation()}>

                        {/* Sidebar: Client Profile */}
                        <div style={{
                            width: '320px', background: 'rgba(255,255,255,0.02)',
                            borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex',
                            flexDirection: 'column', flexShrink: 0
                        }}>
                            <div style={{ padding: '30px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{
                                    width: '100px', height: '100px', borderRadius: '30px',
                                    background: 'rgba(34,197,94,0.1)', color: 'var(--primary)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2.5rem', fontWeight: '900', marginBottom: '20px',
                                    border: '2px solid rgba(34,197,94,0.2)'
                                }}>
                                    {selectedClient.name?.[0] || 'A'}
                                </div>
                                <h3 style={{ fontSize: '1.4rem', fontWeight: '950', marginBottom: '5px' }}>{selectedClient.name}</h3>
                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{selectedClient.email}</p>

                                <div style={{
                                    marginTop: '20px', display: 'inline-flex', padding: '6px 14px',
                                    borderRadius: '50px', background: 'rgba(34,197,94,0.1)',
                                    border: '1px solid rgba(34,197,94,0.2)', fontSize: '0.7rem',
                                    fontWeight: '900', color: 'var(--primary)', letterSpacing: '1px'
                                }}>
                                    {selectedClient.membershipTier?.toUpperCase() || 'STARTER'}
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '25px', overflowY: 'auto' }}>
                                <h4 style={{ fontSize: '0.7rem', fontWeight: '900', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', marginBottom: '20px' }}>CLIENT ACTION CENTER</h4>
                                <div style={{ display: 'grid', gap: '10px' }}>
                                    <button onClick={() => setIsWorkoutEditorOpen(true)} className="cta-secondary" style={{ padding: '15px', fontSize: '0.85rem', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span>💪</span> Edit Workout Plan
                                    </button>
                                    <button onClick={() => setIsDietEditorOpen(true)} className="cta-secondary" style={{ padding: '15px', fontSize: '0.85rem', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span>🥗</span> Edit Diet Plan
                                    </button>
                                    <button onClick={() => setIsSchedulingOpen(true)} className="cta-secondary" style={{ padding: '15px', fontSize: '0.85rem', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <span>📅</span> History
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Main Hub: Chat */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.01)' }}>
                            {/* Chat Header */}
                            <div style={{ padding: '20px 30px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 12px #22c55e' }}></div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '900' }}>{selectedClient.name}</h3>
                                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '700' }}>{selectedClient.email} • ACTIVE SESSION</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedClient(null)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontWeight: '900' }}>✕</button>
                            </div>

                            {/* Chat Messages Area */}
                            <div style={{ flex: 1, padding: '30px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {chatMessages.length === 0 && (
                                    <div style={{ textAlign: 'center', marginTop: '100px', opacity: 0.3 }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>💬</div>
                                        <p style={{ fontWeight: '800' }}>No messages yet. Start guiding {selectedClient.name}!</p>
                                    </div>
                                )}
                                {chatMessages.map(msg => {
                                    const isMe = msg.senderId === auth.currentUser?.uid;
                                    return (
                                        <div key={msg.id} style={{
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: isMe ? 'flex-end' : 'flex-start',
                                            marginBottom: '8px'
                                        }}>
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: '900', color: 'rgba(255,255,255,0.3)',
                                                marginBottom: '4px', marginInline: '15px', letterSpacing: '1px'
                                            }}>
                                                {isMe ? 'YOU (COACH)' : (msg.senderName || selectedClient.name)}
                                            </span>
                                            <div style={{
                                                background: isMe ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.06)',
                                                color: isMe ? '#000' : '#fff',
                                                padding: '12px 18px', borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                                                maxWidth: '70%', boxShadow: isMe ? '0 8px 20px rgba(34,197,94,0.2)' : 'none'
                                            }}>
                                                <div style={{ fontSize: '0.95rem', fontWeight: isMe ? '700' : '500', lineHeight: '1.5' }}>{msg.text}</div>
                                                <div style={{
                                                    fontSize: '0.6rem', marginTop: '6px', textAlign: 'right',
                                                    opacity: 0.5, fontWeight: '800'
                                                }}>
                                                    {formatTime(msg.createdAt)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={chatEndRef} />
                            </div>

                            {/* Chat Input Area */}
                            <div style={{ padding: '25px 30px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{
                                    background: 'rgba(255,255,255,0.04)', borderRadius: '20px', padding: '10px 10px 10px 25px',
                                    display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        placeholder={`Message ${selectedClient.name}...`}
                                        style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '1rem', fontWeight: '500' }}
                                        onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                                    />
                                    <button
                                        onClick={handleSendChat}
                                        style={{
                                            background: chatInput.trim() ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                                            color: chatInput.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                                            border: 'none', width: '45px', height: '45px', borderRadius: '15px',
                                            cursor: 'pointer', fontWeight: '950', transition: 'all 0.3s ease'
                                        }}
                                    >➤</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            <style>{`
                :root {
                    --primary: #22c55e;
                    --primary-glow: rgba(34, 197, 94, 0.3);
                }
                .dashboard-root { background: #000; color: #fff; min-height: 100vh; font-family: 'Inter', sans-serif; }
                .cta-primary { 
                    background: var(--primary); color: #000; padding: 18px 35px; border-radius: 16px; 
                    border: none; font-weight: 900; letter-spacing: 1px; cursor: pointer; transition: all 0.3s ease;
                    box-shadow: 0 10px 20px var(--primary-glow);
                }
                .cta-primary:hover { transform: translateY(-5px); filter: brightness(1.1); }
                .cta-secondary { 
                    background: rgba(255,255,255,0.05); color: #fff; padding: 18px 35px; border-radius: 16px; 
                    border: 1px solid rgba(255,255,255,0.1); font-weight: 800; cursor: pointer; transition: all 0.3s ease;
                }
                .cta-secondary:hover { background: rgba(255,255,255,0.1); }
                .stat-vibe-card:hover { transform: translateY(-10px); border-color: var(--primary); box-shadow: 0 30px 60px rgba(0,0,0,0.5), 0 0 20px var(--primary-glow); }
                .roster-row:hover { background: rgba(255,255,255,0.05); border-color: var(--primary); transform: scale(1.01); }
                .icon-btn { 
                    width: 45px; height: 45px; border-radius: 12px; background: rgba(255,255,255,0.05); 
                    border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 1.2rem; cursor: pointer; transition: all 0.3s ease;
                }
                .icon-btn:hover { background: var(--primary); color: #000; transform: translateY(-3px); }
                .toolkit-card:hover { transform: translateY(-15px); border-color: var(--primary); box-shadow: 0 50px 100px rgba(0,0,0,0.8), 0 0 40px var(--primary-glow); }
            `}</style>


        </div >
    )
}

export default TrainerDashboard
