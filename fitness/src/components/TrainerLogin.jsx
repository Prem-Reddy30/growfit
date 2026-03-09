import { useState, useEffect } from 'react'
import './Login.css'
import logo from '../assets/logo.jpg'
import { auth, db, googleProvider } from '../firebase'
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    updateProfile,
    sendPasswordResetEmail,
    RecaptchaVerifier,
    signInWithPhoneNumber
} from 'firebase/auth'
import { doc, getDoc, getDocFromCache, getDocFromServer, setDoc, serverTimestamp, increment, getDocs, query, collection, where } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { translations, languages } from '../utils/translations'

function TrainerLogin() {
    const navigate = useNavigate()
    const [isLogin, setIsLogin] = useState(true)
    const [loading, setLoading] = useState(false)
    const [lang, setLang] = useState('en')
    const [showRecovery, setShowRecovery] = useState(false)
    const [otpMode, setOtpMode] = useState(false)
    const [phoneNumber, setPhoneNumber] = useState('')
    const [verificationId, setVerificationId] = useState('')
    const [otpCode, setOtpCode] = useState('')
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        name: ''
    })
    const [errorMessage, setErrorMessage] = useState('')

    const [showMaskCode, setShowMaskCode] = useState(false)
    const [maskCode, setMaskCode] = useState('')
    const [pendingUser, setPendingUser] = useState(null)

    const handleChange = (e) => {
        setErrorMessage('')
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const t = (key) => translations[lang][key] || key

    useEffect(() => {
        // Safe redirect: Only move if we verified they are a trainer AND have passed mask code
        // Note: We handle the initial auth check manually now to support the mask code step
    }, [])

    const handleUserStore = async (user, manualName = null, role = 'trainer') => {
        try {
            const userRef = doc(db, 'users', user.uid)

            // SPEED BOOST: Atomic update without read.
            const updateData = {
                uid: user.uid,
                email: user.email || '',
                phone: user.phoneNumber || '',
                lastLogin: serverTimestamp(),
                loginCount: increment(1)
            }

            const nameToSet = manualName || user.displayName
            if (nameToSet) {
                updateData.name = nameToSet
            }

            await setDoc(userRef, updateData, { merge: true })
            return updateData
        } catch (e) {
            console.error("BG sync error:", e)
        }
    }

    const handleMaskCodeVerify = async (e) => {
        e.preventDefault()
        setLoading(true)
        if (maskCode === 'approvedcoach') {
            // SPEED: Update DB in background, navigate INSTANTLY
            const userRef = doc(db, 'users', auth.currentUser.uid)

            // CRITICAL: Force role to trainer during verification
            setDoc(userRef, {
                isVerifiedCoach: true,
                role: 'trainer'
            }, { merge: true }).catch(err => console.error("BG Verify update failed", err))

            const updatedUser = { ...pendingUser, isVerifiedCoach: true, role: 'trainer' }
            navigate('/trainer/dashboard', { state: { turboData: updatedUser } })
        } else {
            setErrorMessage("Invalid Access Code. Access Denied.")
            setLoading(false)
        }
    }

    const initRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible'
            });
        }
    }

    const handleForgotPassword = async () => {
        if (!formData.email) return setErrorMessage("Please enter your email address.")
        try {
            await sendPasswordResetEmail(auth, formData.email)
            setErrorMessage("Reset link sent! Please check your email inbox.")
        } catch (error) {
            setErrorMessage(error.message)
        }
    }

    const handleSendOTP = async (e) => {
        e.preventDefault()
        let finalPhone = phoneNumber.trim()
        if (!finalPhone.startsWith('+')) finalPhone = '+91' + finalPhone
        setLoading(true)
        setErrorMessage('')
        try {
            initRecaptcha()
            const confirmationResult = await signInWithPhoneNumber(auth, finalPhone, window.recaptchaVerifier)
            setVerificationId(confirmationResult)
        } catch (error) {
            setErrorMessage(error.message)
            if (window.recaptchaVerifier) {
                window.recaptchaVerifier.clear()
                window.recaptchaVerifier = null
            }
        } finally {
            setLoading(false)
        }
    }

    const handleVerifyOTP = async (e) => {
        e.preventDefault()
        setLoading(true)
        setErrorMessage('')
        try {
            const result = await verificationId.confirm(otpCode)

            const userRef = doc(db, 'users', result.user.uid)
            let userData = null
            try {
                const cacheSnap = await getDocFromCache(userRef)
                if (cacheSnap.exists()) userData = cacheSnap.data()
            } catch (err) { /* Cache miss */ }

            if (!userData) {
                // FALLBACK: Use displayName or Athlete (Matches Client side)
                userData = { role: 'trainer', name: result.user.displayName || 'Athlete', email: result.user.email || '', isVerifiedCoach: false }
            }
            processLoginSuccess(userData, result.user)
        } catch (error) {
            setErrorMessage('Invalid OTP code. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const processLoginSuccess = async (userData, user) => {
        // SECURE CROSS-CHECK: If they don't have the role AND aren't in the list, they are a client.
        const userEmail = (user.email || '').toLowerCase();
        const coachSnap = await getDocs(query(collection(db, 'coaches'), where('trainerEmail', '==', userEmail)));
        if (!coachSnap.empty || userData?.role === 'trainer') {
            setPendingUser(userData)
            setLoading(false)
            setShowMaskCode(true)
        } else {
            // Not a coach - REDIRECT TO CLIENT PORTAL
            console.warn("Client attempted trainer login. Redirecting...");
            navigate('/dashboard', { state: { fastData: userData } })
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setShowRecovery(false)
        try {
            if (isLogin) {
                const result = await signInWithEmailAndPassword(auth, formData.email, formData.password)

                const userRef = doc(db, 'users', result.user.uid)
                let userData = null
                try {
                    const cacheSnap = await getDocFromCache(userRef)
                    if (cacheSnap.exists()) userData = cacheSnap.data()
                } catch (e) { /* Cache miss */ }

                if (!userData) {
                    userData = { role: 'trainer', name: result.user.displayName || 'Athlete', email: result.user.email || '' }
                }

                processLoginSuccess(userData, result.user)
            } else {
                if (formData.password !== formData.confirmPassword) {
                    alert('Passwords do not match!')
                    setLoading(false)
                    return
                }
                const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
                const turboData = { name: formData.name || 'Athlete', email: userCredential.user.email || '', role: 'trainer', isVerifiedCoach: false }

                setPendingUser(turboData)
                setShowMaskCode(true)

                updateProfile(userCredential.user, { displayName: formData.name }).catch(() => { })
                handleUserStore(userCredential.user, formData.name, 'trainer').catch(() => { })
                setLoading(false)
            }
        } catch (error) {
            console.error("TrainerLogin Error:", error)
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setShowRecovery(true)
                setErrorMessage("Account not found or password incorrect. Please Sign Up first!")
            } else if (error.code === 'auth/email-already-in-use') {
                setErrorMessage("This email is already registered. Please try to SIGN IN instead!")
                // Optionally switch to login tab after a delay
                setTimeout(() => setIsLogin(true), 3000)
            } else {
                setErrorMessage(error.message)
            }
            setLoading(false)
        }
    }

    const handleGoogleLogin = async () => {
        setLoading(true)
        try {
            const result = await signInWithPopup(auth, googleProvider)
            const userRef = doc(db, 'users', result.user.uid)
            let userData = null
            try {
                const cacheSnap = await getDocFromCache(userRef)
                if (cacheSnap.exists()) userData = cacheSnap.data()
            } catch (e) { /* Cache miss */ }

            if (!userData) {
                // FALLBACK: Use displayName or Athlete (Matches Client side)
                userData = { role: 'trainer', name: result.user.displayName || 'Athlete', email: result.user.email || '', isVerifiedCoach: false }
            }
            processLoginSuccess(userData, result.user)
        } catch (error) {
            console.error("Google login error:", error)
            setErrorMessage(error.message)
            setLoading(false)
        }
    }

    return (
        <div className="login-container trainer-mode">
            <div id="recaptcha-container"></div>
            <div className="top-nav">
                <div className="nav-item">
                    <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
                        {languages.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
                    </select>
                </div>
                <Link to="/" className="nav-link to-client">{t('clientLoginLabel')}</Link>
            </div>

            <div className={`login-main-wrapper trainer-portal ${!isLogin ? 'right-panel-active' : ''}`}>
                {/* Mask Code Overlay */}
                {showMaskCode && (
                    <div className="mask-overlay">
                        <div className="mask-icon">🛡️</div>
                        <h2 className="mask-title">SECURITY CHECK</h2>
                        <p className="mask-subtitle">Please enter your centralized access code to verify your credentials.</p>

                        <form onSubmit={handleMaskCodeVerify} className="mask-input-group">
                            <div className="form-group">
                                <input
                                    type="password"
                                    placeholder="ENTER MASK CODE"
                                    value={maskCode}
                                    onChange={(e) => {
                                        setMaskCode(e.target.value)
                                        setErrorMessage('')
                                    }}
                                    className={`mask-input ${errorMessage ? 'error' : ''}`}
                                    autoFocus
                                />
                            </div>
                            {errorMessage && <div className="mask-error">{errorMessage}</div>}
                            <button className="submit-btn highlight" style={{ width: '100%', marginTop: '20px' }}>
                                VERIFY ACCESS
                            </button>
                        </form>
                    </div>
                )}

                <div className="form-container sign-up-container">
                    <form className="login-form registration-form" onSubmit={handleSubmit}>
                        <div className="portal-badge trainer">TRAINER</div>
                        <h1>{t('createAccount')}</h1>
                        <div className="login-social-container">
                            <button type="button" className="social-btn google" onClick={handleGoogleLogin} disabled={loading}>
                                <svg width="24" height="24" viewBox="0 0 18 18"><path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4" /><path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65455 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853" /><path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05" /><path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65455 3.57955 9 3.57955Z" fill="#EA4335" /></svg>
                            </button>
                        </div>
                        <div className="divider tighter"><span>{t('orRegister')}</span></div>
                        {errorMessage && !showMaskCode && <div className="error-msg-overlay">{errorMessage}</div>}
                        <div className="form-group"><input type="text" name="name" placeholder={t('namePlaceholder')} value={formData.name} onChange={handleChange} required /></div>
                        <div className="form-group"><input type="email" name="email" placeholder={t('emailPlaceholder')} value={formData.email} onChange={handleChange} required /></div>
                        <div className="form-group"><input type="password" name="password" placeholder={t('passwordPlaceholder')} value={formData.password} onChange={handleChange} required /></div>
                        <div className="form-group"><input type="password" name="confirmPassword" placeholder={t('confirmPasswordPlaceholder')} value={formData.confirmPassword} onChange={handleChange} required /></div>
                        <button type="submit" className="submit-btn highlight" disabled={loading}>{loading ? '...' : t('registerBtn')}</button>
                    </form>
                </div>

                <div className="form-container sign-in-container">
                    <form className="login-form" onSubmit={otpMode ? (verificationId ? handleVerifyOTP : handleSendOTP) : handleSubmit}>
                        <div className="portal-badge trainer">TRAINER</div>
                        <h1>{otpMode ? 'OTP Login' : t('signIn')}</h1>
                        <div className="login-social-container"><button type="button" className="social-btn google" onClick={handleGoogleLogin} disabled={loading}><svg width="24" height="24" viewBox="0 0 18 18"><path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4" /><path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65455 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853" /><path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05" /><path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65455 3.57955 9 3.57955Z" fill="#EA4335" /></svg></button></div>
                        <div className="divider"><span>{otpMode ? t('enterPhone') : t('coachPortal')}</span></div>
                        {errorMessage && !showMaskCode && <div className="error-msg-overlay">{errorMessage}</div>}

                        {otpMode ? (
                            <>
                                <div className="form-group"><input type="tel" placeholder="+91 9876543210" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={!!verificationId} required /></div>
                                {verificationId && <div className="form-group"><input type="text" placeholder="Enter OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} required /></div>}
                                <button type="submit" className="submit-btn highlight" disabled={loading}>{loading ? '...' : (verificationId ? t('verifyOTP') : t('sendOTP'))}</button>
                                <button type="button" className="forgot-password" onClick={() => { setOtpMode(false); setVerificationId(''); }} style={{ marginTop: '10px' }}>Back</button>
                            </>
                        ) : (
                            <>
                                <div className="form-group"><input type="email" name="email" placeholder={t('emailPlaceholder')} value={formData.email} onChange={handleChange} required /></div>
                                <div className="form-group"><input type="password" name="password" placeholder={t('passwordPlaceholder')} value={formData.password} onChange={handleChange} required /></div>
                                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
                                    <button type="button" className="forgot-password" onClick={handleForgotPassword}>{t('forgotPassword')}</button>
                                    {showRecovery && <button type="button" className="forgot-password" style={{ color: 'var(--trainer-primary)', fontWeight: '700' }} onClick={() => setOtpMode(true)}>{t('loginOTP')}</button>}
                                </div>
                                <button type="submit" className="submit-btn highlight" disabled={loading}>{loading ? '...' : t('signIn')}</button>
                            </>
                        )}
                    </form>
                </div>

                <div className="overlay-container">
                    <div className="overlay trainer-overlay">
                        <div className="overlay-panel overlay-left">
                            <div className="logo-3d-container">
                                <img src={logo} alt="GrowFit Logo" className="logo-3d" />
                                <div className="logo-shadow"></div>
                            </div>
                            <h2 className="branding-title">{t('welcomeBack')}</h2>
                            <p className="branding-subtitle">{t('trainerSubtitle')}</p>
                            <button className="submit-btn ghost" onClick={() => setIsLogin(true)}>{t('signIn')}</button>
                        </div>
                        <div className="overlay-panel overlay-right">
                            <div className="logo-3d-container">
                                <img src={logo} alt="GrowFit Logo" className="logo-3d" />
                                <div className="logo-shadow"></div>
                            </div>
                            <h2 className="branding-title">{t('trainerWelcome')}</h2>
                            <p className="branding-subtitle">{t('trainerSubtitle')}</p>
                            <button className="submit-btn ghost" onClick={() => setIsLogin(false)}>{t('signUp')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TrainerLogin
