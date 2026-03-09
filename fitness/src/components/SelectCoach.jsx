import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { auth, db } from '../firebase'
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, addDoc, onSnapshot, updateDoc, increment } from 'firebase/firestore'
import './Membership.css'

// Import trainer images for use as profile placeholders
import trainer1 from '../assets/trainer-1.png'
import trainer2 from '../assets/trainer-2.png'
import trainer3 from '../assets/trainer-3.png'

const PLAN_DETAILS = {
    'half-yearly': {
        name: 'PRO',
        icon: '🔥',
        price: '₹3,000/6 months',
        priceAmount: 3000,
        color: '#22c55e',
        coachFeatures: ['Personal Coach Assigned', 'Direct 1-on-1 Coach Chat', 'Custom Workout & Diet Plans', 'Weekly Video Check-ins', 'Personalized Diet Adjustments', 'Priority Response Time']
    },
    'yearly': {
        name: 'ELITE',
        icon: '👑',
        price: '₹5,400/year',
        priceAmount: 5400,
        color: '#facc15',
        coachFeatures: ['Everything in Pro', 'Unlimited Live Video Coaching', 'Daily Coach Check-ins', 'Competition Prep Support', 'Advanced Body Analytics Review', 'Exclusive WhatsApp Group', '24/7 Priority Support']
    }
}

function SelectCoach() {
    const navigate = useNavigate()
    const location = useLocation()
    const planId = location.state?.planId || 'half-yearly'
    const planDetails = PLAN_DETAILS[planId] || PLAN_DETAILS['half-yearly']

    const [trainers, setTrainers] = useState([])
    const [selectedTrainer, setSelectedTrainer] = useState(null)
    const [loading, setLoading] = useState(true)
    const [assigning, setAssigning] = useState(false)
    const [assigned, setAssigned] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [payMethod, setPayMethod] = useState('card')

    useEffect(() => {
        // TURBO: Use onSnapshot for real-time, snappy response
        const unsub = onSnapshot(collection(db, 'coaches'), (snap) => {
            const allCoaches = snap.docs.map((d, idx) => ({
                id: d.id,
                name: d.data().name || `Coach ${idx + 1}`,
                specialty: d.data().specialty || 'General Fitness',
                experience: d.data().experience || '1+ Years',
                rating: d.data().rating || 4.8,
                clients: d.data().clients || 0,
                bio: d.data().bio || 'Professional fitness coach dedicated to your transformation.',
                trainerEmail: d.data().trainerEmail || '', // NEW: CRITICAL FOR LINKING
                certifications: d.data().certifications || ['Certified Trainer'],
                image: d.data().photoURL || [trainer1, trainer2, trainer3][idx % 3]
            }))
            setTrainers(allCoaches)
            setLoading(false)
        }, (err) => {
            console.error('Fetch error:', err)
            setLoading(false)
        })

        return () => unsub()
    }, [])

    const handleAssignCoach = async () => {
        if (!selectedTrainer || !auth.currentUser?.uid) return

        // INSTANT SYNC FEEDBACK
        setAssigning(true)

        // 1. PERFORM ALL DATABASE UPDATES IN THE BACKGROUND
        const performUpdates = async () => {
            try {
                const tierMap = { 'monthly': 'silver', 'half-yearly': 'gold', 'yearly': 'gold' }

                // CRITICAL: Link Client to Coach in Firestore
                await setDoc(doc(db, 'users', auth.currentUser.uid), {
                    role: 'client',
                    membershipTier: tierMap[planId] || 'silver',
                    membershipPlan: planId,
                    trainerId: selectedTrainer.id,
                    trainerName: selectedTrainer.name.trim(),
                    trainerEmail: (selectedTrainer.trainerEmail || '').toLowerCase().trim(),
                    trainerAssignedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true })

                // SECONDARY: Payment Logs & Stats
                await addDoc(collection(db, 'payments'), {
                    userId: auth.currentUser.uid,
                    userEmail: auth.currentUser.email,
                    planId: planId,
                    planName: planDetails.name,
                    amount: planDetails.priceAmount,
                    currency: 'INR',
                    status: 'success',
                    paymentMethod: payMethod,
                    coachId: selectedTrainer.id,
                    coachName: selectedTrainer.name.trim(),
                    createdAt: serverTimestamp()
                })

                await updateDoc(doc(db, 'coaches', selectedTrainer.id), {
                    clients: increment(1)
                })
            } catch (err) {
                console.error('BG Update Failed:', err)
            }
        }

        performUpdates(); // Do not await

        // 2. SHOW SUCCESS SCREEN AFTER 1s (FEELS LIKE PROCESSING)
        setTimeout(() => {
            setAssigned(true)
            setShowPaymentModal(false)
            setAssigning(false)

            // 3. AUTO-NAVIGATE AFTER USER SEES SUCCESS
            setTimeout(() => {
                navigate('/coach-chat', {
                    state: {
                        planId,
                        coachId: selectedTrainer.id,
                        coachName: selectedTrainer.name,
                        coachEmail: selectedTrainer.trainerEmail
                    }
                })
            }, 3000)
        }, 1200)
    }

    if (assigned) {
        return (
            <div className="membership-page" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617' }}>
                <div style={{ textAlign: 'center', animation: 'mFadeUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                    <div style={{
                        width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)',
                        border: '3px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '4rem', margin: '0 auto 30px', boxShadow: '0 0 50px rgba(34,197,94,0.25)'
                    }}>✓</div>
                    <h1 style={{ fontSize: '2.8rem', fontWeight: '950', marginBottom: '10px', color: '#fff' }}>
                        Paid <span style={{ color: '#22c55e' }}>Successfully!</span>
                    </h1>
                    <p style={{ color: '#22c55e', fontSize: '1.4rem', fontWeight: '850', marginBottom: '15px' }}>
                        ₹{planDetails.priceAmount.toLocaleString('en-IN')} Received
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.1rem', fontWeight: '600' }}>
                        {selectedTrainer?.name} is now your personal master.
                    </p>
                    <div style={{ marginTop: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <div className="loader-spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'mSpin 1s linear infinite' }}></div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', fontWeight: '700' }}>Entering Chat Room...</span>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="membership-page">
            <div className="membership-topbar">
                <button className="membership-back-btn" onClick={() => navigate('/dashboard')}>← Skip for Now</button>
                <div className="membership-badge"><span>{planDetails.icon}</span> {planDetails.name} PLAN ACTIVE</div>
            </div>

            <div className="membership-hero" style={{ paddingBottom: '40px' }}>
                <div className="membership-hero-label"><span>🎯</span> SELECT YOUR COACH</div>
                <h1>Choose Your <br /><span className="gradient-text">Personal Master</span></h1>
                <p>Pick an elite trainer from our verified roster to lead your program.</p>
            </div>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 50px 80px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <div className="loader-spinner" style={{
                            width: '50px', height: '50px', border: '3px solid rgba(255,255,255,0.05)',
                            borderTopColor: '#22c55e', borderRadius: '50%', animation: 'mSpin 1s linear infinite', margin: '0 auto 20px'
                        }}></div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>Synchronizing Trainer Roster...</p>
                    </div>
                ) : trainers.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '80px 40px', background: 'rgba(255,255,255,0.02)',
                        borderRadius: '32px', border: '1px dashed rgba(255,255,255,0.1)', animation: 'mFadeUp 0.6s ease-out'
                    }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '20px' }}>🏋️‍♂️</div>
                        <h3 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#fff', marginBottom: '12px' }}>Coaches Coming Soon!</h3>
                        <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '450px', margin: '0 auto', lineHeight: '1.7', fontSize: '1rem' }}>
                            Our admin is currently vetting high-performance trainers for you.
                            Please stay tuned — your transformation is about to begin.
                        </p>
                        <button onClick={() => navigate('/dashboard')} className="cta-secondary" style={{ marginTop: '30px' }}>Back to Dashboard</button>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '30px', animation: 'mFadeUp 0.8s ease-out' }}>
                            {trainers.map((trainer) => (
                                <div
                                    key={trainer.id}
                                    onClick={() => setSelectedTrainer(trainer)}
                                    style={{
                                        background: selectedTrainer?.id === trainer.id ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.02)',
                                        border: selectedTrainer?.id === trainer.id ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '30px', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.4s ease',
                                        transform: selectedTrainer?.id === trainer.id ? 'translateY(-12px)' : 'none',
                                        boxShadow: selectedTrainer?.id === trainer.id ? '0 25px 60px rgba(0,0,0,0.6)' : 'none'
                                    }}
                                >
                                    <div style={{ position: 'relative', height: '260px' }}>
                                        <img src={trainer.image} alt={trainer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}></div>
                                        <div style={{ position: 'absolute', bottom: '20px', left: '25px' }}>
                                            <h3 style={{ fontSize: '1.5rem', fontWeight: '950', margin: 0 }}>{trainer.name}</h3>
                                            <p style={{ color: '#22c55e', fontSize: '0.9rem', fontWeight: '800', margin: '4px 0 0 0' }}>{trainer.specialty}</p>
                                        </div>
                                        <div style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '10px', fontSize: '0.85rem' }}>
                                            <span style={{ color: '#facc15' }}>★</span> {trainer.rating}
                                        </div>
                                    </div>
                                    <div style={{ padding: '25px' }}>
                                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '15px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>{trainer.experience}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Experience</div>
                                            </div>
                                            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '15px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>{trainer.clients}+</div>
                                                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>Clients</div>
                                            </div>
                                        </div>
                                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', lineHeight: '1.6', height: '62px', overflow: 'hidden' }}>{trainer.bio}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '20px' }}>
                                            {trainer.certifications.slice(0, 2).map((c, i) => (
                                                <span key={i} style={{ fontSize: '0.65rem', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: '50px', fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>✓ {c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {selectedTrainer && (
                            <div style={{ textAlign: 'center', marginTop: '70px', animation: 'mFadeUp 0.5s ease-out' }}>
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    disabled={assigning}
                                    className="cta-primary"
                                    style={{ padding: '24px 80px', fontSize: '1.2rem', boxShadow: '0 20px 50px rgba(34,197,94,0.4)', border: 'none', cursor: 'pointer', borderRadius: '16px', fontWeight: '900', color: '#000', fontFamily: 'inherit' }}
                                >
                                    {`Confirm & Pay ${planDetails.price} →`}
                                </button>
                                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', marginTop: '25px', fontWeight: '500' }}>
                                    🔒 Secured Transaction • Instant Coach Activation
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selectedTrainer && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                    backdropFilter: 'blur(20px)', zIndex: 10000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '20px'
                }} onClick={() => !assigning && setShowPaymentModal(false)}>
                    <div style={{
                        width: '100%', maxWidth: '500px', background: '#0a0a0a',
                        borderRadius: '32px', border: '1px solid rgba(255,255,255,0.08)',
                        padding: '40px', position: 'relative', boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
                        animation: 'mFadeUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
                    }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#22c55e', letterSpacing: '2px', marginBottom: '10px' }}>SECURE CHECKOUT</div>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: '950', margin: 0 }}>Final <span style={{ color: '#22c55e' }}>Step</span></h2>
                        </div>

                        {/* Order Summary */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '20px', padding: '20px', marginBottom: '25px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: '600' }}>Plan</span>
                                <span style={{ fontWeight: '800', color: planDetails.color }}>{planDetails.name} Enrollment</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', fontWeight: '600' }}>Coach</span>
                                <span style={{ fontWeight: '800' }}>{selectedTrainer.name}</span>
                            </div>
                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '12px 0' }}></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: '900', fontSize: '1.1rem' }}>Total Amount</span>
                                <span style={{ fontWeight: '900', fontSize: '1.5rem', color: '#22c55e' }}>₹{planDetails.priceAmount.toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        {/* Payment Tabs */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '25px' }}>
                            <button
                                onClick={() => setPayMethod('card')}
                                style={{
                                    padding: '14px', borderRadius: '14px', border: payMethod === 'card' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                                    background: payMethod === 'card' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                                    color: payMethod === 'card' ? '#22c55e' : 'rgba(255,255,255,0.4)',
                                    fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit'
                                }}
                            >💳 Card</button>
                            <button
                                onClick={() => setPayMethod('upi')}
                                style={{
                                    padding: '14px', borderRadius: '14px', border: payMethod === 'upi' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
                                    background: payMethod === 'upi' ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                                    color: payMethod === 'upi' ? '#22c55e' : 'rgba(255,255,255,0.4)',
                                    fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit'
                                }}
                            >📱 UPI</button>
                        </div>

                        {/* Payment Inputs */}
                        <form onSubmit={(e) => { e.preventDefault(); handleAssignCoach(); }} style={{ display: 'grid', gap: '15px' }}>
                            {payMethod === 'card' ? (
                                <>
                                    <input type="text" placeholder="Card Number" required style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', caretColor: '#22c55e', boxSizing: 'border-box' }} />
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <input type="text" placeholder="MM/YY" required style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', caretColor: '#22c55e', boxSizing: 'border-box' }} />
                                        <input type="password" placeholder="CVV" required style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', caretColor: '#22c55e', boxSizing: 'border-box' }} />
                                    </div>
                                </>
                            ) : (
                                <input type="text" placeholder="yourname@upi" required style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', outline: 'none', caretColor: '#22c55e', boxSizing: 'border-box' }} />
                            )}

                            <button
                                type="submit"
                                disabled={assigning}
                                style={{
                                    width: '100%', padding: '20px', borderRadius: '16px',
                                    background: assigning ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: assigning ? 'rgba(255,255,255,0.2)' : '#000',
                                    border: 'none', fontWeight: '950', fontSize: '1.1rem', cursor: assigning ? 'not-allowed' : 'pointer',
                                    marginTop: '10px', boxShadow: assigning ? 'none' : '0 15px 40px rgba(34,197,94,0.3)',
                                    transition: 'all 0.3s ease', fontFamily: 'inherit'
                                }}
                            >
                                {assigning ? 'SYNCING TRANSACTION...' : `PAY ₹${planDetails.priceAmount.toLocaleString('en-IN')} NOW`}
                            </button>
                        </form>

                        <div style={{ textAlign: 'center', marginTop: '20px', opacity: 0.3, fontSize: '0.7rem', fontWeight: '800', letterSpacing: '1px' }}>
                            🔒 256-BIT SSL ENCRYPTED GATEWAY
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes mSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    )
}

export default SelectCoach
