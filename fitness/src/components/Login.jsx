import { useState, useEffect } from 'react'
import './Login.css'
import logo from '../assets/logo.jpg'
import { auth, db, googleProvider } from '../firebase'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  getAdditionalUserInfo
} from 'firebase/auth'
import { doc, setDoc, getDoc, getDocFromCache, serverTimestamp, increment, getDocs, query, collection, where } from 'firebase/firestore'
import { Link, useNavigate } from 'react-router-dom'
import { translations, languages } from '../utils/translations'

function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lang, setLang] = useState('en')
  const [showRecovery, setShowRecovery] = useState(false)
  const [otpMode, setOtpMode] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationId, setVerificationId] = useState(null)
  const [otpCode, setOtpCode] = useState('')
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  })

  useEffect(() => {
    // Cleanup reCAPTCHA on unmount to prevent "already rendered" errors or zombie instances
    return () => {
      if (window.recaptchaVerifier) {
        try {
          window.recaptchaVerifier.clear();
        } catch (e) {
          console.warn("Recaptcha cleanup error:", e);
        }
        window.recaptchaVerifier = null;
      }
    }
  }, []);

  const initRecaptcha = () => {
    const container = document.getElementById('recaptcha-container');

    // If verifier exists, we are good.
    // If not, but container is populated, it's a zombie state. Clean it.
    if (!window.recaptchaVerifier && container && container.hasChildNodes()) {
      container.innerHTML = '';
    }

    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible'
      });
    }
  }

  const t = (key) => translations[lang][key] || translations['en'][key]

  const handleChange = (e) => {
    setErrorMessage('')
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleUserStore = async (user, manualName = null) => {
    try {
      const userRef = doc(db, 'users', user.uid)

      // SPEED BOOST: Use direct setDoc with merge instead of reading first.
      // We skip the 'debounce' check to save a network round-trip.
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

      await setDoc(userRef, updateData, { merge: true });
      return updateData
    } catch (e) {
      console.error("BG Sync error:", e)
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

      // AUTO-DETECT TRAINER BY EMAIL OR PROFILE
      const userRef = doc(db, 'users', result.user.uid)
      let userData = null;
      const userEmail = (result.user.email || '').toLowerCase();

      // Check if this is a known coach email (ONLY in the coaches collection)
      const coachSnap = await getDocs(query(collection(db, 'coaches'), where('trainerEmail', '==', userEmail)));
      const isKnownCoach = !coachSnap.empty;

      try {
        const cacheSnap = await getDocFromCache(userRef)
        if (cacheSnap.exists()) userData = cacheSnap.data()
      } catch (err) { /* Cache miss */ }

      if (userData?.role === 'trainer' || isKnownCoach) {
        // Ensure role is set for future
        if (userData?.role !== 'trainer') {
          await setDoc(userRef, { role: 'trainer', isVerifiedCoach: true }, { merge: true }).catch(() => { });
        }
        navigate('/trainer/dashboard')
      } else {
        const fastData = userData || { name: result.user.displayName || 'Athlete', email: result.user.email || '' }
        navigate('/dashboard', { state: { fastData } })
      }
      handleUserStore(result.user).catch(() => { })
    } catch (error) {
      setErrorMessage('Invalid OTP code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setShowRecovery(false)
    setErrorMessage('')
    try {
      if (isLogin) {
        const result = await signInWithEmailAndPassword(auth, formData.email, formData.password)

        // AUTO-DETECT TRAINER
        const userRef = doc(db, 'users', result.user.uid)
        const userEmail = (result.user.email || '').toLowerCase();

        // Quick coach check (EXCLUSIVELY by collection)
        const coachSnap = await getDocs(query(collection(db, 'coaches'), where('trainerEmail', '==', userEmail)));
        const isKnownCoach = !coachSnap.empty;

        let userData = null
        try {
          const cacheSnap = await getDocFromCache(userRef)
          if (cacheSnap.exists()) userData = cacheSnap.data()
        } catch (err) { /* Cache miss is fine */ }

        if (userData?.role === 'trainer' || isKnownCoach) {
          if (userData?.role !== 'trainer') {
            await setDoc(userRef, { role: 'trainer', isVerifiedCoach: true }, { merge: true }).catch(() => { });
          }
          navigate('/trainer/dashboard')
        } else {
          const fastData = userData || { name: result.user.displayName || 'Athlete', email: result.user.email || '' }
          navigate('/dashboard', { state: { fastData } })
        }

        // Background sync - DO NOT await for faster navigation
        handleUserStore(result.user).catch(() => { });
      } else {
        if (formData.password !== formData.confirmPassword) {
          setErrorMessage('Passwords do not match!')
          setLoading(false)
          return
        }
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
        const fastData = { name: formData.name || 'Athlete', email: userCredential.user.email || '' }

        await updateProfile(userCredential.user, { displayName: formData.name }).catch(() => { })
        await handleUserStore(userCredential.user, formData.name);

        navigate('/dashboard', { state: { fastData } })
      }
    } catch (error) {
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setShowRecovery(true)
        setErrorMessage("Account not found or password incorrect. Please Sign Up first!")
      } else {
        setErrorMessage(error.message)
      }
    } finally {
      // Loading state might cause flicker if we navigated, but mostly fine.
      if (window.location.pathname === '/' || window.location.pathname === '/login') {
        setLoading(false)
      }
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const result = await signInWithPopup(auth, googleProvider)

      // SPEED OPTIMIZATION: Identical logic to email login
      const userEmail = (result.user.email || '').toLowerCase();
      const userRef = doc(db, 'users', result.user.uid)
      const coachSnap = await getDocs(query(collection(db, 'coaches'), where('trainerEmail', '==', userEmail)));

      let userData = null;
      try {
        const cacheSnap = await getDocFromCache(userRef)
        if (cacheSnap.exists()) userData = cacheSnap.data()
      } catch (err) { /* Cache miss is fine */ }

      if (userData?.role === 'trainer' || !coachSnap.empty) {
        navigate('/trainer/dashboard')
      } else {
        // Assume Client instantly
        const fastData = userData || { name: result.user.displayName || 'Athlete', email: result.user.email || '' }
        navigate('/dashboard', { state: { fastData } })
      }

      await handleUserStore(result.user);

    } catch (error) {
      setErrorMessage(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div id="recaptcha-container"></div>

      <div className="top-nav">
        <div className="nav-item">
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
            {languages.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
          </select>
        </div>
        <Link to="/trainer" className="nav-link to-trainer">{t('trainerLoginLabel')}</Link>
      </div>

      <div className={`login-main-wrapper ${!isLogin ? 'right-panel-active' : ''}`}>

        <div className="form-container sign-up-container">
          <form className="login-form registration-form" onSubmit={handleSubmit}>
            <div className="portal-badge client">CLIENT</div>
            <h1>{t('createAccount')}</h1>

            <div className="login-social-container">
              <button type="button" className="social-btn google" onClick={handleGoogleLogin} disabled={loading}>
                <svg width="24" height="24" viewBox="0 0 18 18"><path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4" /><path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65455 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853" /><path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05" /><path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65455 3.57955 9 3.57955Z" fill="#EA4335" /></svg>
              </button>
            </div>

            <div className="divider tighter"><span>{t('orRegister')}</span></div>

            {errorMessage && <div className="error-msg-overlay">{errorMessage}</div>}

            <div className="form-group"><input type="text" name="name" placeholder={t('namePlaceholder')} value={formData.name} onChange={handleChange} required /></div>
            <div className="form-group"><input type="email" name="email" placeholder={t('emailPlaceholder')} value={formData.email} onChange={handleChange} required /></div>
            <div className="form-group"><input type="password" name="password" placeholder={t('passwordPlaceholder')} value={formData.password} onChange={handleChange} required /></div>
            <div className="form-group"><input type="password" name="confirmPassword" placeholder={t('confirmPasswordPlaceholder')} value={formData.confirmPassword} onChange={handleChange} required /></div>
            <button type="submit" className="submit-btn primary" disabled={loading}>{loading ? '...' : t('registerBtn')}</button>
          </form>
        </div>

        <div className="form-container sign-in-container">
          <form className="login-form" onSubmit={otpMode ? (verificationId ? handleVerifyOTP : handleSendOTP) : handleSubmit}>
            <div className="portal-badge client">CLIENT</div>
            <h1>{otpMode ? 'OTP Login' : t('signIn')}</h1>

            <div className="login-social-container">
              <button type="button" className="social-btn google" onClick={handleGoogleLogin} disabled={loading}>
                <svg width="24" height="24" viewBox="0 0 18 18"><path d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4" /><path d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65455 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853" /><path d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05" /><path d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65455 3.57955 9 3.57955Z" fill="#EA4335" /></svg>
              </button>
            </div>

            <div className="divider"><span>{otpMode ? t('enterPhone') : t('orAccount')}</span></div>

            {errorMessage && <div className="error-msg-overlay">{errorMessage}</div>}

            {otpMode ? (
              <>
                <div className="form-group">
                  <input type="tel" placeholder="+91 9876543210" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={!!verificationId} required />
                </div>
                {verificationId && (
                  <div className="form-group">
                    <input type="text" placeholder="Enter 6-digit OTP" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength="6" required />
                  </div>
                )}
                <button type="submit" className="submit-btn primary" disabled={loading}>
                  {loading ? '...' : (verificationId ? t('verifyOTP') : t('sendOTP'))}
                </button>
                <button type="button" className="forgot-password" onClick={() => { setOtpMode(false); setVerificationId(null); setErrorMessage(''); }} style={{ marginTop: '10px' }}>Back</button>
              </>
            ) : (
              <>
                <div className="form-group"><input type="email" name="email" placeholder={t('emailPlaceholder')} value={formData.email} onChange={handleChange} required /></div>
                <div className="form-group"><input type="password" name="password" placeholder={t('passwordPlaceholder')} value={formData.password} onChange={handleChange} required /></div>
                <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', alignItems: 'center', marginTop: '10px' }}>
                  <button type="button" className="forgot-password" onClick={handleForgotPassword}>{t('forgotPassword')}</button>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <button type="button" className="forgot-password" style={{ color: 'var(--primary)', fontWeight: '700' }} onClick={() => { setOtpMode(true); setErrorMessage(''); setTimeout(initRecaptcha, 100); }}>
                    Login via OTP
                  </button>
                </div>
                <button type="submit" className="submit-btn primary" disabled={loading}>{loading ? '...' : t('loginBtn')}</button>
              </>
            )}
          </form>
        </div>

        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-panel overlay-left">
              <div className="logo-3d-container">
                <img src={logo} alt="GrowFit Logo" className="logo-3d" />
                <div className="logo-shadow"></div>
              </div>
              <h2 className="branding-title">{t('welcomeBack')}</h2>
              <p className="branding-subtitle">{t('loginInfo')}</p>
              <button className="submit-btn ghost" onClick={() => { setIsLogin(true); setOtpMode(false); setErrorMessage(''); }}>{t('signIn')}</button>
            </div>
            <div className="overlay-panel overlay-right">
              <div className="logo-3d-container">
                <img src={logo} alt="GrowFit Logo" className="logo-3d" />
                <div className="logo-shadow"></div>
              </div>
              <h2 className="branding-title">{t('journeyTitle')}</h2>
              <p className="branding-subtitle">{t('journeySubtitle')}</p>
              <button className="submit-btn ghost" onClick={() => { setIsLogin(false); setErrorMessage(''); }}>{t('signUp')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
