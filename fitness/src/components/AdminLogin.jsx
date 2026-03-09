import { useState } from 'react'
import './Login.css'
import logo from '../assets/logo.jpg'
import { auth, db } from '../firebase'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'

function AdminLogin() {
    const navigate = useNavigate()
    const [isRegistering, setIsRegistering] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showKeyInput, setShowKeyInput] = useState(false)
    const [secretKey, setSecretKey] = useState('')
    const [currentUser, setCurrentUser] = useState(null)

    const handleLogin = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            let userCredential;
            if (isRegistering) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password)
            } else {
                userCredential = await signInWithEmailAndPassword(auth, email, password)
            }
            setCurrentUser(userCredential.user)
            setShowKeyInput(true)
        } catch (err) {
            console.error("Auth Error:", err)
            if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError("Invalid credentials. If this is your first time, please enable 'Create Account'.")
            } else if (err.code === 'auth/email-already-in-use') {
                setError("Email already exists. Please switch to Login.")
            } else {
                setError(err.message || "Access Denied.")
            }
        } finally {
            setLoading(false)
        }
    }

    const performVerification = async (key) => {
        if (key === "approved admin") {
            // OPTIMISTIC UI: Navigate immediately!
            // Do not set loading, do not wait. Just go.
            navigate('/admin/dashboard')

            // Update DB in background
            try {
                if (currentUser) {
                    await setDoc(doc(db, 'users', currentUser.uid), {
                        role: 'admin',
                        email: currentUser.email,
                        name: 'Supreme Admin'
                    }, { merge: true })
                }
            } catch (err) {
                console.error("Background Admin Update Failed:", err)
            }
        } else {
            // Only show error if called explicitly (e.g. via button) or if length is significant
            if (key.length > 5) setError("INVALID ACCESS KEY")
        }
    }

    const handleKeyChange = (e) => {
        const val = e.target.value
        setSecretKey(val)
        setError('')
        if (val === "approved admin") {
            performVerification(val)
        }
    }

    return (
        <div className="login-container admin-mode" style={{ background: '#000' }}>
            <div className="login-main-wrapper" style={{ boxShadow: '0 0 50px rgba(255, 0, 0, 0.3)' }}>
                {!showKeyInput ? (
                    <div className="form-container sign-in-container" style={{ width: '100%', left: 0, zIndex: 2 }}>
                        <form className="login-form" onSubmit={handleLogin} style={{ background: '#0a0a0a' }}>
                            <div className="portal-badge" style={{ background: '#ff0000', color: '#fff' }}>RESTRICTED</div>
                            <h1 style={{ color: '#fff' }}>{isRegistering ? 'CREATE ADMIN' : 'ADMIN CONTROL'}</h1>
                            <p style={{ color: '#666', marginBottom: '20px' }}>Authorized Personnel Only</p>

                            {error && <div className="error-msg-overlay" style={{ background: 'rgba(255,0,0,0.9)' }}>{error}</div>}

                            <div className="form-group">
                                <input type="email" placeholder="Admin Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ borderColor: '#333', color: '#fff' }} />
                            </div>
                            <div className="form-group">
                                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ borderColor: '#333', color: '#fff' }} />
                            </div>

                            <button type="submit" className="submit-btn" disabled={loading} style={{ background: '#ff0000', borderColor: '#ff0000' }}>
                                {loading ? 'PROCESSING...' : (isRegistering ? 'INITIALIZE ADMIN' : 'ACCESS TERMINAL')}
                            </button>

                            <div
                                onClick={() => { setIsRegistering(!isRegistering); setError('') }}
                                style={{
                                    marginTop: '20px',
                                    color: '#666',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                {isRegistering ? 'Already have an account? Login' : 'Need an access point? Create Account'}
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="mask-overlay" style={{ display: 'flex' }}>
                        <div className="mask-icon" style={{ borderColor: '#ff0000', color: '#ff0000' }}>⚠️</div>
                        <h2 className="mask-title" style={{ color: '#ff0000' }}>FINAL SECURITY CHECK</h2>
                        <p className="mask-subtitle">Enter the Supreme Access Key to override system protocols.</p>

                        <div className="mask-input-group">
                            <div className="form-group">
                                <input
                                    type="password"
                                    placeholder="ENTER KEY"
                                    value={secretKey}
                                    onChange={handleKeyChange}
                                    className="mask-input"
                                    style={{ borderColor: '#ff0000', color: '#ff0000' }}
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>
                            <button
                                onClick={() => performVerification(secretKey)}
                                className="submit-btn"
                                style={{
                                    background: '#ff0000',
                                    borderColor: '#ff0000',
                                    marginTop: '20px',
                                    width: '100%'
                                }}
                            >
                                VERIFY ACCESS
                            </button>
                            {loading && <div style={{ color: '#ff0000', marginTop: '10px', fontWeight: 'bold' }}>VERIFYING ACCESS...</div>}
                            {error && <div className="mask-error" style={{ color: '#ff0000' }}>{error}</div>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AdminLogin
