import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import './Membership.css'

const PLANS = [
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
        features: [
            'AI-Powered Workout Plans',
            'Personalized Diet Chart',
            'Daily Calorie Tracking',
            'Exercise Video Library',
            'Progress Dashboard'
        ],
        checkColor: 'rgba(168, 162, 158, 0.5)',
        checkBg: 'rgba(168, 162, 158, 0.1)',
        popular: false
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
        features: [
            'Everything in Starter',
            '1-on-1 Trainer Chat',
            'Custom Nutrition Plans',
            'Weekly Performance Reviews',
            'Priority AI Recommendations',
            'Supplement Guidance'
        ],
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
        features: [
            'Everything in Pro',
            'Live Video Coaching Calls',
            'Advanced Body Analytics',
            'Corrective Exercise Therapy',
            'Competition Prep Support',
            'Exclusive Community Access',
            'Lifetime Plan Updates'
        ],
        checkColor: '#facc15',
        checkBg: 'rgba(250, 204, 21, 0.12)',
        popular: false
    }
]

function PaymentPage() {
    const navigate = useNavigate()
    const [selectedPlan, setSelectedPlan] = useState(null)
    const [showPayment, setShowPayment] = useState(false)
    const [paymentMethod, setPaymentMethod] = useState('card')
    const [loading, setLoading] = useState(false)
    const [paymentSuccess, setPaymentSuccess] = useState(false)

    const handleSelectPlan = (plan) => {
        setSelectedPlan(plan)
        setShowPayment(true)
        setPaymentSuccess(false)
    }

    const handlePayment = async (e) => {
        e.preventDefault()
        if (!selectedPlan || !auth.currentUser) return

        setLoading(true)
        // INSTANT: 200ms for demo
        await new Promise(r => setTimeout(r, 200))

        try {
            // Record the transaction
            await addDoc(collection(db, 'payments'), {
                userId: auth.currentUser.uid,
                userEmail: auth.currentUser.email,
                planId: selectedPlan.id,
                planName: selectedPlan.name,
                amount: selectedPlan.price,
                currency: 'INR',
                status: 'success',
                paymentMethod: paymentMethod,
                createdAt: serverTimestamp()
            })

            // Update user membership
            const tierMapping = {
                'monthly': 'silver',
                'half-yearly': 'gold',
                'yearly': 'gold'
            }
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                membershipTier: tierMapping[selectedPlan.id] || 'silver',
                membershipPlan: selectedPlan.id,
                membershipAmount: selectedPlan.price,
                updatedAt: serverTimestamp()
            })

            setPaymentSuccess(true)
            setTimeout(() => {
                // ULTRA SPEED: 500ms redirect
                if (selectedPlan.id === 'half-yearly' || selectedPlan.id === 'yearly') {
                    navigate('/select-coach', { state: { planId: selectedPlan.id } })
                } else {
                    navigate('/dashboard')
                }
            }, 500)
        } catch (err) {
            console.error("Payment failed:", err)
            alert("Payment failed. Please try again.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="membership-page">
            {/* Top Bar */}
            <div className="membership-topbar">
                <button className="membership-back-btn" onClick={() => navigate('/dashboard')}>
                    ← Back to Dashboard
                </button>
                <div className="membership-badge">
                    <span>🔒</span> SSL SECURED
                </div>
            </div>

            {/* Hero */}
            <div className="membership-hero">
                <div className="membership-hero-label">
                    <span>💎</span> MEMBERSHIP PLANS
                </div>
                <h1>
                    Invest In Your <br />
                    <span className="gradient-text">Transformation</span>
                </h1>
                <p>Choose the plan that fits your fitness journey. All plans include full access to our AI-powered platform in Indian Rupees.</p>
            </div>

            {/* Plans Grid */}
            <div className="membership-plans-grid">
                {PLANS.map((plan) => (
                    <div
                        key={plan.id}
                        className={`membership-plan-card ${selectedPlan?.id === plan.id ? 'selected' : ''} ${plan.popular ? 'popular' : ''}`}
                        onClick={() => handleSelectPlan(plan)}
                    >
                        {plan.popular && (
                            <div className="plan-popular-tag">{plan.tag}</div>
                        )}

                        <div
                            className="plan-icon-wrapper"
                            style={{
                                background: plan.iconBg,
                                border: `1px solid ${plan.iconBorder}`
                            }}
                        >
                            {plan.icon}
                        </div>

                        <div className="plan-name">{plan.name}</div>

                        <div className="plan-pricing">
                            <span className="plan-currency">₹</span>
                            <span className="plan-amount">{plan.price.toLocaleString('en-IN')}</span>
                            <span className="plan-period">{plan.period}</span>
                        </div>

                        {plan.perMonth && (
                            <div className="plan-per-month">{plan.perMonth}</div>
                        )}

                        {plan.savings && (
                            <div className="plan-savings">
                                <span>🎉</span> {plan.savings}
                            </div>
                        )}

                        {!plan.perMonth && !plan.savings && (
                            <div className="plan-per-month">Billed monthly</div>
                        )}

                        <div className="plan-divider"></div>

                        <ul className="plan-features">
                            {plan.features.map((f, i) => (
                                <li key={i}>
                                    <span
                                        className="check-icon"
                                        style={{
                                            background: plan.checkBg,
                                            color: plan.checkColor
                                        }}
                                    >
                                        ✓
                                    </span>
                                    {f}
                                </li>
                            ))}
                        </ul>

                        <button
                            className={`plan-cta-btn ${plan.popular ? 'primary' : 'secondary'}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleSelectPlan(plan)
                            }}
                        >
                            {plan.popular ? 'Get Started' : 'Choose Plan'}
                        </button>
                    </div>
                ))}
            </div>

            {/* Bottom Features */}
            <div className="membership-features-strip">
                <div className="feature-strip-item">
                    <div className="feature-strip-icon">🏋️</div>
                    <h4>AI Workouts</h4>
                    <p>Smart plans that adapt to your progress</p>
                </div>
                <div className="feature-strip-item">
                    <div className="feature-strip-icon">🥗</div>
                    <h4>Indian Diet Plans</h4>
                    <p>Culturally relevant nutrition guidance</p>
                </div>
                <div className="feature-strip-item">
                    <div className="feature-strip-icon">💬</div>
                    <h4>24/7 AI Support</h4>
                    <p>Instant answers to your fitness queries</p>
                </div>
                <div className="feature-strip-item">
                    <div className="feature-strip-icon">📊</div>
                    <h4>Progress Tracking</h4>
                    <p>Visual analytics for your journey</p>
                </div>
            </div>

            {/* Payment Modal */}
            {showPayment && selectedPlan && (
                <div className="payment-overlay" onClick={() => !loading && setShowPayment(false)}>
                    <div className="payment-modal" onClick={(e) => e.stopPropagation()}>
                        {paymentSuccess ? (
                            <div className="payment-success">
                                <div className="payment-success-icon">✓</div>
                                <h2>Payment Successful!</h2>
                                <p>Welcome to {selectedPlan.name}. Redirecting to your dashboard...</p>
                            </div>
                        ) : (
                            <>
                                <div className="payment-modal-header">
                                    <h2>Complete <span>Payment</span></h2>
                                    <button
                                        className="payment-close-btn"
                                        onClick={() => !loading && setShowPayment(false)}
                                    >
                                        ✕
                                    </button>
                                </div>

                                <div className="payment-modal-body">
                                    {/* Plan Summary */}
                                    <div className="payment-plan-summary">
                                        <div className="payment-plan-info">
                                            <h3>{selectedPlan.icon} {selectedPlan.name}</h3>
                                            <p>{selectedPlan.id === 'monthly' ? '1 Month' : selectedPlan.id === 'half-yearly' ? '6 Months' : '12 Months'} Plan</p>
                                        </div>
                                        <div className="payment-plan-price">
                                            ₹{selectedPlan.price.toLocaleString('en-IN')}
                                        </div>
                                    </div>

                                    {/* Payment Method */}
                                    <div className="payment-methods">
                                        <button
                                            className={`payment-method-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                                            onClick={() => setPaymentMethod('card')}
                                        >
                                            <span className="method-icon">💳</span> Credit/Debit Card
                                        </button>
                                        <button
                                            className={`payment-method-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                                            onClick={() => setPaymentMethod('upi')}
                                        >
                                            <span className="method-icon">📱</span> UPI
                                        </button>
                                    </div>

                                    {/* Payment Form */}
                                    <form onSubmit={handlePayment}>
                                        {paymentMethod === 'card' ? (
                                            <div className="payment-form-group">
                                                <input
                                                    type="text"
                                                    className="payment-input"
                                                    placeholder="Card Number"
                                                    maxLength={19}
                                                    required
                                                />
                                                <div className="payment-input-row">
                                                    <input
                                                        type="text"
                                                        className="payment-input"
                                                        placeholder="MM / YY"
                                                        maxLength={5}
                                                        required
                                                    />
                                                    <input
                                                        type="text"
                                                        className="payment-input"
                                                        placeholder="CVV"
                                                        maxLength={4}
                                                        required
                                                    />
                                                </div>
                                                <input
                                                    type="text"
                                                    className="payment-input"
                                                    placeholder="Cardholder Name"
                                                    required
                                                />
                                            </div>
                                        ) : (
                                            <div className="payment-form-group">
                                                <input
                                                    type="text"
                                                    className="payment-input"
                                                    placeholder="Enter UPI ID (e.g. name@paytm)"
                                                    required
                                                />
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            className="payment-submit-btn"
                                            disabled={loading}
                                        >
                                            {paymentSuccess ? (
                                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#fff' }}>
                                                    <span style={{ fontSize: '1.2rem' }}>✅</span>
                                                    DONE! REDIRECTING...
                                                </span>
                                            ) : loading ? (
                                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                                                    Processing Payment...
                                                </span>
                                            ) : (
                                                `Pay ₹${selectedPlan.price.toLocaleString('en-IN')} Now`
                                            )}
                                        </button>

                                        <div className="payment-secure-note">
                                            <span>🔒</span> Secured with 256-bit SSL encryption
                                        </div>
                                    </form>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default PaymentPage
