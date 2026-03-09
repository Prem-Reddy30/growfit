import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { addDoc, collection, serverTimestamp, setDoc, doc } from 'firebase/firestore'

function GymPayment() {
    const navigate = useNavigate()
    const [payMethod, setPayMethod] = useState('card')
    const [processing, setProcessing] = useState(false)
    const [success, setSuccess] = useState(false)

    const handlePayment = async (e) => {
        e.preventDefault()
        if (!auth.currentUser?.uid) return
        setProcessing(true)
        try {
            // INSTANT SPEED: 200ms for demo
            await new Promise(r => setTimeout(r, 200))
            await addDoc(collection(db, 'payments'), {
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                planId: 'monthly',
                planName: 'STARTER',
                amount: 600,
                currency: 'INR',
                status: 'success',
                paymentMethod: payMethod,
                createdAt: serverTimestamp()
            })
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
                role: 'client',
                membershipTier: 'silver',
                membershipPlan: 'monthly',
                membershipStartDate: serverTimestamp(),
                updatedAt: serverTimestamp()
            }, { merge: true })
            setSuccess(true)
            setTimeout(() => navigate('/dashboard'), 300)
        } catch (err) {
            console.error('Payment error:', err)
            alert('Payment failed. Please try again.')
        } finally {
            setProcessing(false)
        }
    }

    if (success) {
        return (
            <div style={{
                minHeight: '100vh', background: '#020617',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Inter', 'Segoe UI', sans-serif"
            }}>
                <div style={{ textAlign: 'center', animation: 'mFadeUp 0.6s ease-out' }}>
                    <div style={{
                        width: '100px', height: '100px', borderRadius: '50%',
                        background: 'rgba(34,197,94,0.15)', border: '3px solid #22c55e',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '3rem', margin: '0 auto 24px',
                        boxShadow: '0 0 40px rgba(34,197,94,0.2)'
                    }}>✓</div>
                    <h1 style={{ color: '#fff', fontSize: '2rem', fontWeight: '900', marginBottom: '10px' }}>
                        Payment Successful!
                    </h1>
                    <p style={{ color: '#22c55e', fontSize: '1.2rem', fontWeight: '800', marginBottom: '8px' }}>
                        ₹600 paid successfully
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginBottom: '30px' }}>
                        Your gym membership is now active for 30 days. Enjoy your workouts!
                    </p>
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                        padding: '20px 30px', border: '1px solid rgba(255,255,255,0.06)',
                        display: 'inline-block'
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontWeight: '600' }}>
                            Redirecting to dashboard...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            minHeight: '100vh', background: '#020617',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', 'Segoe UI', sans-serif", color: '#fff',
            padding: '20px'
        }}>
            <div style={{ width: '100%', maxWidth: '900px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>

                {/* Left: Order Summary */}
                <div>
                    {/* Back */}
                    <button
                        onClick={() => navigate('/dashboard')}
                        style={{
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                            cursor: 'pointer', fontSize: '0.85rem', fontWeight: '700',
                            padding: '0 0 24px', fontFamily: 'inherit'
                        }}
                    >← Back to Dashboard</button>

                    <div style={{
                        background: 'rgba(255,255,255,0.02)', borderRadius: '24px',
                        border: '1px solid rgba(255,255,255,0.06)', padding: '36px'
                    }}>
                        {/* Plan Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '18px',
                                background: 'rgba(168,162,158,0.12)', border: '1px solid rgba(168,162,158,0.25)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '1.6rem'
                            }}>⚡</div>
                            <div>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: '900', marginBottom: '4px' }}>Gym Membership</h2>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', fontWeight: '600' }}>STARTER Plan • 1 Month</p>
                            </div>
                        </div>

                        {/* What's Included */}
                        <div style={{ marginBottom: '28px' }}>
                            <h4 style={{
                                fontSize: '0.7rem', fontWeight: '800', color: 'rgba(255,255,255,0.3)',
                                letterSpacing: '1.5px', marginBottom: '14px', textTransform: 'uppercase'
                            }}>WHAT'S INCLUDED</h4>
                            {[
                                { icon: '🏋️', text: 'Full Gym Access' },
                                { icon: '💪', text: 'All Equipment & Machines' },
                                { icon: '🚿', text: 'Locker Room & Shower' },
                                { icon: '⏰', text: 'Open Hours (6AM - 10PM)' },
                                { icon: '📅', text: 'Valid for 30 Days' }
                            ].map((item, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 0', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                                }}>
                                    <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '600' }}>{item.text}</span>
                                </div>
                            ))}
                        </div>

                        {/* Price Breakdown */}
                        <div style={{
                            background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                            padding: '20px', border: '1px solid rgba(255,255,255,0.06)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Gym Fee (1 month)</span>
                                <span style={{ fontWeight: '700' }}>₹600</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Registration Fee</span>
                                <span style={{ fontWeight: '700', color: '#22c55e' }}>FREE</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>GST</span>
                                <span style={{ fontWeight: '700' }}>₹0</span>
                            </div>
                            <div style={{
                                borderTop: '2px solid rgba(255,255,255,0.08)', paddingTop: '12px', marginTop: '4px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <span style={{ fontWeight: '900', fontSize: '1.1rem' }}>Total</span>
                                <span style={{ fontWeight: '900', fontSize: '1.6rem', color: '#22c55e' }}>₹600</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Payment Form */}
                <div>
                    <h3 style={{
                        fontSize: '0.7rem', fontWeight: '800', color: 'rgba(255,255,255,0.3)',
                        letterSpacing: '1.5px', marginBottom: '20px', paddingTop: '38px'
                    }}>PAYMENT METHOD</h3>

                    {/* Payment Method Tabs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
                        <button
                            onClick={() => setPayMethod('card')}
                            style={{
                                padding: '18px', borderRadius: '14px',
                                background: payMethod === 'card' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.02)',
                                border: payMethod === 'card' ? '2px solid rgba(34,197,94,0.4)' : '2px solid rgba(255,255,255,0.06)',
                                color: payMethod === 'card' ? '#22c55e' : 'rgba(255,255,255,0.5)',
                                fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.3s ease', textAlign: 'center'
                            }}
                        >
                            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>💳</div>
                            Credit/Debit Card
                        </button>
                        <button
                            onClick={() => setPayMethod('upi')}
                            style={{
                                padding: '18px', borderRadius: '14px',
                                background: payMethod === 'upi' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.02)',
                                border: payMethod === 'upi' ? '2px solid rgba(34,197,94,0.4)' : '2px solid rgba(255,255,255,0.06)',
                                color: payMethod === 'upi' ? '#22c55e' : 'rgba(255,255,255,0.5)',
                                fontWeight: '800', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                                transition: 'all 0.3s ease', textAlign: 'center'
                            }}
                        >
                            <div style={{ fontSize: '1.4rem', marginBottom: '6px' }}>📱</div>
                            UPI Payment
                        </button>
                    </div>

                    {/* Payment Form */}
                    <form onSubmit={handlePayment}>
                        <div style={{
                            background: 'rgba(255,255,255,0.02)', borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.06)', padding: '28px',
                            marginBottom: '20px'
                        }}>
                            {payMethod === 'card' ? (
                                <div style={{ display: 'grid', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>CARD NUMBER</label>
                                        <input type="text" placeholder="1234 5678 9012 3456" maxLength={19} required
                                            style={{
                                                width: '100%', padding: '16px 18px', borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                color: '#fff', fontSize: '1rem', fontFamily: "'Courier New', monospace",
                                                outline: 'none', boxSizing: 'border-box', letterSpacing: '2px',
                                                transition: 'border 0.3s ease'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'rgba(34,197,94,0.4)'}
                                            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>EXPIRY DATE</label>
                                            <input type="text" placeholder="MM / YY" maxLength={5} required
                                                style={{
                                                    width: '100%', padding: '16px 18px', borderRadius: '12px',
                                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                    color: '#fff', fontSize: '1rem', fontFamily: "'Courier New', monospace",
                                                    outline: 'none', boxSizing: 'border-box', letterSpacing: '2px',
                                                    transition: 'border 0.3s ease'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = 'rgba(34,197,94,0.4)'}
                                                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>CVV</label>
                                            <input type="password" placeholder="•••" maxLength={4} required
                                                style={{
                                                    width: '100%', padding: '16px 18px', borderRadius: '12px',
                                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                    color: '#fff', fontSize: '1rem', fontFamily: "'Courier New', monospace",
                                                    outline: 'none', boxSizing: 'border-box', letterSpacing: '4px',
                                                    transition: 'border 0.3s ease'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = 'rgba(34,197,94,0.4)'}
                                                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>CARDHOLDER NAME</label>
                                        <input type="text" placeholder="John Doe" required
                                            style={{
                                                width: '100%', padding: '16px 18px', borderRadius: '12px',
                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                                color: '#fff', fontSize: '1rem', fontFamily: 'inherit',
                                                outline: 'none', boxSizing: 'border-box',
                                                transition: 'border 0.3s ease'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = 'rgba(34,197,94,0.4)'}
                                            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', letterSpacing: '0.5px' }}>UPI ID</label>
                                    <input type="text" placeholder="yourname@paytm" required
                                        style={{
                                            width: '100%', padding: '16px 18px', borderRadius: '12px',
                                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff', fontSize: '1rem', fontFamily: 'inherit',
                                            outline: 'none', boxSizing: 'border-box',
                                            transition: 'border 0.3s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = 'rgba(34,197,94,0.4)'}
                                        onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    />
                                    <div style={{
                                        display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap'
                                    }}>
                                        {['Google Pay', 'PhonePe', 'Paytm', 'BHIM'].map((app, i) => (
                                            <span key={i} style={{
                                                padding: '6px 14px', borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                                color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', fontWeight: '700'
                                            }}>{app}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Pay Button */}
                        <button type="submit" disabled={processing}
                            style={{
                                width: '100%', padding: '20px', borderRadius: '16px',
                                background: processing
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: processing ? 'rgba(255,255,255,0.3)' : '#000',
                                border: 'none', fontWeight: '900', fontSize: '1.1rem',
                                cursor: processing ? 'not-allowed' : 'pointer',
                                fontFamily: 'inherit', letterSpacing: '0.5px',
                                boxShadow: processing ? 'none' : '0 12px 40px rgba(34,197,94,0.25)',
                                transition: 'all 0.4s ease'
                            }}
                        >
                            {success ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#fff' }}>
                                    <span style={{ fontSize: '1.2rem' }}>✅</span>
                                    DONE! REDIRECTING...
                                </span>
                            ) : processing ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                                    Processing Payment...
                                </span>
                            ) : (
                                `Pay ₹600 Now`
                            )}
                        </button>

                        {/* Security */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: '20px', marginTop: '20px'
                        }}>
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                🔒 256-bit SSL
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                🛡️ Secure Payment
                            </span>
                            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ✅ PCI Compliant
                            </span>
                        </div>
                    </form>
                </div>
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes mFadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}

export default GymPayment
