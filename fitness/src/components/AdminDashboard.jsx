import { useState, useEffect } from 'react'
import { db, auth } from '../firebase'
import { collection, getDocs, updateDoc, doc, query, where, deleteDoc, orderBy, limit, onSnapshot, addDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import './ClientDashboard.css' // Reuse basic styles

function AdminDashboard() {
    const navigate = useNavigate()
    const [clients, setClients] = useState([])
    const [trainers, setTrainers] = useState([])
    const [admins, setAdmins] = useState([])
    const [payments, setPayments] = useState([])
    const [coaches, setCoaches] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [rawUserCount, setRawUserCount] = useState(0)

    // Add Coach Form State
    const [showAddCoach, setShowAddCoach] = useState(false)
    const [coachForm, setCoachForm] = useState({
        name: '',
        trainerEmail: '', // New: For linking to Auth Account
        specialty: '',
        experience: '',
        bio: '',
        certifications: '',
        photoURL: '',
        rating: '4.8',
        clients: '0'
    })
    const [addingCoach, setAddingCoach] = useState(false)
    const [loadingAction, setLoadingAction] = useState(false)

    // Scalability State: Search & Pagination
    const [searchTerm, setSearchTerm] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 10

    useEffect(() => {
        // Real-time listeners
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const allUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // ULTRA-RESILIENT FILTERING
            // Clients are anyone who isn't explicitly a trainer/admin/coach
            const clientsList = allUsers.filter(u => {
                const r = (u.role || '').toLowerCase();
                return r === 'client' || r === 'user' || r === '' || (!u.role && r !== 'trainer' && r !== 'admin' && r !== 'coach');
            });

            const trainersList = allUsers.filter(u => {
                const r = (u.role || '').toLowerCase();
                return r === 'trainer' || r === 'coach' || r === 'trainer';
            });

            const adminsList = allUsers.filter(u => {
                const r = (u.role || '').toLowerCase();
                return r === 'admin';
            });

            // LOG FOR DEBUG (User can see this in console)
            console.log(`Admin Sync: Fetched ${allUsers.length} total users. Clients: ${clientsList.length}`);

            setClients(clientsList);
            setTrainers(trainersList);
            setAdmins(adminsList);
            setLoading(false);
            setRawUserCount(allUsers.length); // Track raw count for debug
        }, (err) => {
            console.error("Users fetch error:", err);
            setError("FETCH ERROR: " + err.message);
            setLoading(false);
        });

        const unsubPayments = onSnapshot(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(50)), (snap) => {
            setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        }, (err) => console.error("Payments fetch error:", err));

        const unsubCoaches = onSnapshot(collection(db, 'coaches'), (snap) => {
            setCoaches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.error("Coaches fetch error:", err));

        return () => {
            unsubUsers();
            unsubPayments();
            unsubCoaches();
        }
    }, [])

    const handleAssignTrainer = async (clientId, trainerId) => {
        if (!clientId || loadingAction) return;
        setLoadingAction(true)
        try {
            await updateDoc(doc(db, 'users', clientId), {
                trainerId: trainerId,
                updatedAt: serverTimestamp()
            })
            // Local state is already updated via onSnapshot
            console.log(`Success: Assigned trainer ${trainerId} to client ${clientId}`)
        } catch (err) {
            console.error("Assignment failed:", err)
            alert("CRITICAL ERROR: Assignment failed to save. " + err.message)
        } finally {
            setLoadingAction(false)
        }
    }

    const handleAddCoach = async (e) => {
        e.preventDefault()
        if (!coachForm.name.trim()) return alert('Coach name is required')

        // Prevent duplicate hits while saving
        if (addingCoach) return;

        setAddingCoach(true)
        try {
            const coachData = {
                name: coachForm.name.trim(),
                trainerEmail: coachForm.trainerEmail.trim().toLowerCase(), // NEW: Critical for linking
                specialty: coachForm.specialty.trim() || 'General Fitness',
                experience: coachForm.experience.trim() || '1+ Years',
                bio: coachForm.bio.trim() || 'Professional fitness coach.',
                certifications: coachForm.certifications.split(',').map(c => c.trim()).filter(Boolean),
                photoURL: coachForm.photoURL.trim() || '',
                rating: parseFloat(coachForm.rating) || 4.8,
                clients: parseInt(coachForm.clients) || 0,
                role: 'coach',
                createdAt: serverTimestamp()
            }

            // CRITICAL: Ensure write completion before UI reset
            const docRef = await addDoc(collection(db, 'coaches'), coachData)
            console.log("Coach added with ID: ", docRef.id)

            // Only reset UI after success
            setCoachForm({ name: '', trainerEmail: '', specialty: '', experience: '', bio: '', certifications: '', photoURL: '', rating: '4.8', clients: '0' })
            setShowAddCoach(false)
            // alert("Coach added successfully!")
        } catch (err) {
            console.error('Add coach failed:', err)
            setError('DATA ERROR: ' + err.message)
            alert('CRITICAL ERROR: Data could not be saved. ' + err.message)
        } finally {
            setAddingCoach(false)
        }
    }

    const handleDeleteCoach = async (coachId) => {
        if (!window.confirm('Delete this coach permanently?') || loadingAction) return
        setLoadingAction(true)
        try {
            await deleteDoc(doc(db, 'coaches', coachId))
            console.log("Coach deleted successfully")
        } catch (err) {
            console.error('Delete coach failed:', err)
            alert('Failed to delete coach. Please check your connection.')
        } finally {
            setLoadingAction(false)
        }
    }

    // Compute Stats
    const allUsers = [...clients, ...trainers];
    const totalLogins = allUsers.reduce((acc, user) => acc + (user.loginCount || 0), 0);

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const activeUsers = allUsers.filter(user => {
        if (!user.lastLogin) return false;
        // Handle both Firestore Timestamp and ISO string
        const loginDate = user.lastLogin.toDate ? user.lastLogin.toDate() : new Date(user.lastLogin);
        return loginDate > oneDayAgo;
    }).length;

    // Filtered & Paginated Clients
    const filteredClients = clients.filter(client =>
        (client.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1); // Reset to first page on search
    };



    return (
        <div style={{ minHeight: '100vh', background: '#050505', color: '#fff', padding: '40px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #333', paddingBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h1 style={{ color: '#ff0000', margin: 0, letterSpacing: '2px' }}>ADMIN // COMMAND CENTER</h1>
                    {loading && <span style={{ color: '#666', fontSize: '0.8rem', animation: 'pulse 1s infinite' }}>● SYNCING DATA...</span>}
                </div>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <button
                        onClick={() => navigate('/trainer/dashboard')}
                        style={{
                            background: '#22c55e',
                            border: 'none',
                            color: '#000',
                            padding: '10px 20px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: '900',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        <span>🏋️</span> TRAINER PORTAL
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        style={{ background: 'transparent', border: '1px solid #333', color: '#666', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        EXIT TERMINAL
                    </button>
                </div>
                <style>{`
                    @keyframes pulse {
                        0% { opacity: 0.5; }
                        50% { opacity: 1; }
                        100% { opacity: 0.5; }
                    }
                `}</style>
            </header>

            {/* DEBUG / CONNECTION STATUS BAR */}
            <div style={{
                background: error ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 255, 0, 0.1)',
                border: error ? '1px solid #ff0000' : '1px solid #00ff00',
                padding: '10px',
                borderRadius: '8px',
                marginBottom: '20px',
                color: error ? '#ff0000' : '#00ff00',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>
                    STATUS: {loading ? 'CONNECTING...' : (error ? `ERROR: ${error}` : 'SYSTEM ONLINE')}
                </span>
                <span>
                    TOTAL SYSTEM USERS: {rawUserCount} | CLIENTS: {clients.length} | TRAINERS: {trainers.length}
                </span>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
                <div style={{ background: '#111', padding: '20px', borderRadius: '10px', border: '1px solid #222' }}>
                    <h3 style={{ margin: 0, color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Clients</h3>
                    <p style={{ margin: '10px 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>{clients.length}</p>
                </div>
                <div style={{ background: '#111', padding: '20px', borderRadius: '10px', border: '1px solid #222' }}>
                    <h3 style={{ margin: 0, color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Active Trainers</h3>
                    <p style={{ margin: '10px 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>{trainers.length}</p>
                </div>
                <div style={{ background: '#111', padding: '20px', borderRadius: '10px', border: '1px solid #222' }}>
                    <h3 style={{ margin: 0, color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Active Users (24h)</h3>
                    <p style={{ margin: '10px 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#22c55e' }}>{activeUsers}</p>
                </div>
                <div style={{ background: '#111', padding: '20px', borderRadius: '10px', border: '1px solid #222' }}>
                    <h3 style={{ margin: 0, color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Logins</h3>
                    <p style={{ margin: '10px 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#eab308' }}>{totalLogins}</p>
                </div>
                <div style={{ background: '#111', padding: '20px', borderRadius: '10px', border: '1px solid #222' }}>
                    <h3 style={{ margin: 0, color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>Coaches</h3>
                    <p style={{ margin: '10px 0 0', fontSize: '2rem', fontWeight: 'bold', color: '#f97316' }}>{coaches.length}</p>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '30px' }}>

                {/* Client Registry */}
                <div style={{ background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #222' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '20px' }}>
                        <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: '#ff0000' }}>👥</span> CLIENT REGISTRY
                        </h2>

                        {/* SEARCH BAR */}
                        <div style={{ position: 'relative', width: '300px' }}>
                            <input
                                type="text"
                                placeholder="Search Name or Email..."
                                value={searchTerm}
                                onChange={handleSearch}
                                style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '10px',
                                    padding: '12px 15px 12px 40px',
                                    color: '#fff',
                                    outline: 'none',
                                    fontSize: '0.85rem'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #222', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '15px' }}>Client Name</th>
                                    <th style={{ padding: '15px' }}>Email</th>
                                    <th style={{ padding: '15px' }}>Assigned Trainer</th>
                                    <th style={{ padding: '15px' }}>Last Login</th>
                                    <th style={{ padding: '15px' }}>Logins</th>
                                    <th style={{ padding: '15px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedClients.map(client => (
                                    <tr key={client.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                        <td style={{ padding: '15px', fontWeight: 'bold' }}>{client.name || 'Unknown'}</td>
                                        <td style={{ padding: '15px', color: '#888' }}>{client.email}</td>
                                        <td style={{ padding: '15px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <select
                                                    value={client.trainerId || ''}
                                                    onChange={(e) => handleAssignTrainer(client.id, e.target.value)}
                                                    style={{
                                                        background: client.trainerId ? 'rgba(34, 197, 94, 0.1)' : '#000',
                                                        border: client.trainerId ? '1px solid #22c55e' : '1px solid #333',
                                                        color: client.trainerId ? '#22c55e' : '#fff',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        outline: 'none',
                                                        minWidth: '200px'
                                                    }}
                                                >
                                                    <option value="">-- No Trainer Assigned --</option>
                                                    {trainers.map(t => (
                                                        <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                                                    ))}
                                                </select>
                                                {client.trainerName && !trainers.find(t => t.id === client.trainerId) && (
                                                    <span style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 'bold' }}>
                                                        PENDING CLAIM: {client.trainerName}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '15px', color: '#888', fontSize: '0.9rem' }}>
                                            {client.lastLogin ? (client.lastLogin.toDate ? client.lastLogin.toDate().toLocaleDateString() : new Date(client.lastLogin).toLocaleDateString()) : 'Never'}
                                        </td>
                                        <td style={{ padding: '15px', color: '#fff', fontWeight: 'bold' }}>
                                            {client.loginCount || 0}
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <button
                                                onClick={async () => {
                                                    if (!window.confirm("Permanently delete this user?")) return;
                                                    try {
                                                        await deleteDoc(doc(db, 'users', client.id));
                                                        setClients(prev => prev.filter(c => c.id !== client.id));
                                                    } catch (err) { console.error(err); alert("Delete failed"); }
                                                }}
                                                style={{ background: '#333', border: 'none', color: '#ff4444', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                DELETE
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {clients.length === 0 && (
                                    <tr>
                                        <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#666' }}>No clients found in the system.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Trainer Registry */}
                <div style={{ background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #222' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#3b82f6' }}>🏋️</span> TRAINER REGISTRY
                    </h2>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #222', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '15px' }}>Trainer Name</th>
                                    <th style={{ padding: '15px' }}>Email</th>
                                    <th style={{ padding: '15px' }}>Last Login</th>
                                    <th style={{ padding: '15px' }}>Logins</th>
                                    <th style={{ padding: '15px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trainers.map(trainer => (
                                    <tr key={trainer.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                        <td style={{ padding: '15px', fontWeight: 'bold', color: '#3b82f6' }}>{trainer.name || 'Unknown'}</td>
                                        <td style={{ padding: '15px', color: '#888' }}>{trainer.email}</td>
                                        <td style={{ padding: '15px', color: '#888', fontSize: '0.9rem' }}>
                                            {trainer.lastLogin ? (trainer.lastLogin.toDate ? trainer.lastLogin.toDate().toLocaleDateString() : new Date(trainer.lastLogin).toLocaleDateString()) : 'Never'}
                                        </td>
                                        <td style={{ padding: '15px', color: '#fff', fontWeight: 'bold' }}>
                                            {trainer.loginCount || 0}
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <button
                                                onClick={async () => {
                                                    if (!window.confirm("Permanently delete this trainer?")) return;
                                                    try {
                                                        await deleteDoc(doc(db, 'users', trainer.id));
                                                        setTrainers(prev => prev.filter(t => t.id !== trainer.id));
                                                    } catch (err) { console.error(err); alert("Delete failed"); }
                                                }}
                                                style={{ background: '#333', border: 'none', color: '#ff4444', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                DELETE
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {trainers.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#666' }}>No trainers found in the system.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ===== COACH MANAGEMENT ===== */}
                <div style={{ background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #f97316', borderWidth: '1px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                            <span style={{ color: '#f97316' }}>🏅</span> COACH MANAGEMENT
                        </h2>
                        <button
                            onClick={() => setShowAddCoach(!showAddCoach)}
                            style={{
                                background: showAddCoach ? '#333' : 'linear-gradient(135deg, #f97316, #ea580c)',
                                border: 'none',
                                color: '#fff',
                                padding: '10px 24px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '0.85rem',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {showAddCoach ? '✕ CANCEL' : '+ ADD NEW COACH'}
                        </button>
                    </div>

                    {/* Add Coach Form */}
                    {showAddCoach && (
                        <form onSubmit={handleAddCoach} style={{
                            background: '#0a0a0a',
                            border: '1px solid #333',
                            borderRadius: '12px',
                            padding: '24px',
                            marginBottom: '24px',
                            display: 'grid',
                            gap: '16px',
                            animation: 'fadeInUp 0.3s ease-out'
                        }}>
                            <h3 style={{ margin: 0, color: '#f97316', fontSize: '1rem', fontWeight: '900', letterSpacing: '1px' }}>NEW COACH DETAILS</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <input
                                    type="text" placeholder="Coach Name *" required
                                    value={coachForm.name} onChange={(e) => setCoachForm({ ...coachForm, name: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                                <input
                                    type="email" placeholder="Trainer Login Email *" required
                                    value={coachForm.trainerEmail} onChange={(e) => setCoachForm({ ...coachForm, trainerEmail: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #f97316', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                                <p style={{ gridColumn: 'span 2', margin: '-8px 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
                                    ⚠️ IMPORTANT: This MUST match the email the coach uses to log in.
                                </p>
                                <input
                                    type="text" placeholder="Specialty (e.g. Strength & Conditioning)"
                                    value={coachForm.specialty} onChange={(e) => setCoachForm({ ...coachForm, specialty: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                                <input
                                    type="text" placeholder="Experience (e.g. 5+ Years)"
                                    value={coachForm.experience} onChange={(e) => setCoachForm({ ...coachForm, experience: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                                <input
                                    type="text" placeholder="Rating (e.g. 4.8)"
                                    value={coachForm.rating} onChange={(e) => setCoachForm({ ...coachForm, rating: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                                <input
                                    type="text" placeholder="Total Clients (e.g. 50)"
                                    value={coachForm.clients} onChange={(e) => setCoachForm({ ...coachForm, clients: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                            </div>
                            <textarea
                                placeholder="Coach Bio / Description"
                                value={coachForm.bio} onChange={(e) => setCoachForm({ ...coachForm, bio: e.target.value })}
                                style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit', height: '80px', resize: 'none' }}
                            />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <input
                                    type="text" placeholder="Certifications (comma separated, e.g. NSCA, ACE)"
                                    value={coachForm.certifications} onChange={(e) => setCoachForm({ ...coachForm, certifications: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                                <input
                                    type="text" placeholder="Photo URL (optional)"
                                    value={coachForm.photoURL} onChange={(e) => setCoachForm({ ...coachForm, photoURL: e.target.value })}
                                    style={{ padding: '12px 16px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '0.9rem', fontFamily: 'inherit' }}
                                />
                            </div>
                            <button
                                type="submit" disabled={addingCoach}
                                style={{
                                    padding: '14px',
                                    background: addingCoach ? '#333' : 'linear-gradient(135deg, #f97316, #ea580c)',
                                    color: addingCoach ? '#888' : '#fff',
                                    border: 'none',
                                    borderRadius: '10px',
                                    fontWeight: '900',
                                    fontSize: '0.95rem',
                                    cursor: addingCoach ? 'not-allowed' : 'pointer',
                                    letterSpacing: '1px',
                                    transition: 'all 0.3s ease'
                                }}
                            >
                                {addingCoach ? 'ADDING COACH...' : 'ADD COACH TO SYSTEM'}
                            </button>
                        </form>
                    )}

                    {/* Coaches List */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #222', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '15px' }}>Photo</th>
                                    <th style={{ padding: '15px' }}>Name & Email</th>
                                    <th style={{ padding: '15px' }}>Specialty</th>
                                    <th style={{ padding: '15px' }}>Experience</th>
                                    <th style={{ padding: '15px' }}>Rating</th>
                                    <th style={{ padding: '15px' }}>Clients</th>
                                    <th style={{ padding: '15px' }}>Certifications</th>
                                    <th style={{ padding: '15px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {coaches.map(coach => (
                                    <tr key={coach.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                        <td style={{ padding: '15px' }}>
                                            {coach.photoURL ? (
                                                <img src={coach.photoURL} alt={coach.name} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #333' }} />
                                            ) : (
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#f97316', fontSize: '1rem' }}>
                                                    {coach.name?.[0] || '?'}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <div style={{ fontWeight: 'bold', color: '#f97316' }}>{coach.name}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{coach.trainerEmail}</div>
                                        </td>
                                        <td style={{ padding: '15px', color: '#ccc' }}>{coach.specialty}</td>
                                        <td style={{ padding: '15px', color: '#888' }}>{coach.experience}</td>
                                        <td style={{ padding: '15px', color: '#facc15', fontWeight: 'bold' }}>★ {coach.rating}</td>
                                        <td style={{ padding: '15px', color: '#fff', fontWeight: 'bold' }}>{coach.clients}</td>
                                        <td style={{ padding: '15px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {(coach.certifications || []).map((cert, i) => (
                                                    <span key={i} style={{ fontSize: '0.65rem', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', padding: '2px 8px', borderRadius: '4px', fontWeight: '700' }}>{cert}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ padding: '15px' }}>
                                            <button
                                                onClick={() => handleDeleteCoach(coach.id)}
                                                style={{ background: '#333', border: 'none', color: '#ff4444', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                            >
                                                DELETE
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {coaches.length === 0 && (
                                    <tr>
                                        <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#666' }}>No coaches added yet. Click "+ ADD NEW COACH" to add your first coach.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Permanent Login History */}
                <div style={{ background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #222' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#a855f7' }}>📜</span> PERMANENT LOGIN HISTORY
                    </h2>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #222', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '15px' }}>User Name</th>
                                    <th style={{ padding: '15px' }}>Role</th>
                                    <th style={{ padding: '15px' }}>Email</th>
                                    <th style={{ padding: '15px' }}>First Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...clients, ...trainers]
                                    .sort((a, b) => {
                                        const dateA = a.firstLogin ? (a.firstLogin.toDate ? a.firstLogin.toDate() : new Date(a.firstLogin)) : (a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0));
                                        const dateB = b.firstLogin ? (b.firstLogin.toDate ? b.firstLogin.toDate() : new Date(b.firstLogin)) : (b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0));
                                        return dateB - dateA;
                                    })
                                    .map(user => (
                                        <tr key={user.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                            <td style={{ padding: '15px', fontWeight: 'bold', color: '#fff' }}>{user.name || 'Unknown'}</td>
                                            <td style={{ padding: '15px' }}>
                                                <span style={{
                                                    background: user.role === 'trainer' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                                    color: user.role === 'trainer' ? '#3b82f6' : '#22c55e',
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td style={{ padding: '15px', color: '#888' }}>{user.email}</td>
                                            <td style={{ padding: '15px', color: '#888', fontSize: '0.9rem' }}>
                                                {user.firstLogin ?
                                                    (user.firstLogin.toDate ? user.firstLogin.toDate().toLocaleString() : new Date(user.firstLogin).toLocaleString()) :
                                                    (user.createdAt ? (user.createdAt.toDate ? user.createdAt.toDate().toLocaleString() : new Date(user.createdAt).toLocaleString()) : 'Unknown')
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                {[...clients, ...trainers].length === 0 && (
                                    <tr>
                                        <td colSpan="4" style={{ padding: '30px', textAlign: 'center', color: '#666' }}>No permanent records found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Payment History */}
                <div style={{ background: '#111', padding: '30px', borderRadius: '12px', border: '1px solid #222' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#eab308' }}>💳</span> RECENT PAYMENTS
                    </h2>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #222', color: '#666', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                    <th style={{ padding: '15px' }}>User Email</th>
                                    <th style={{ padding: '15px' }}>Plan</th>
                                    <th style={{ padding: '15px' }}>Amount</th>
                                    <th style={{ padding: '15px' }}>Method</th>
                                    <th style={{ padding: '15px' }}>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(payment => (
                                    <tr key={payment.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                                        <td style={{ padding: '15px', color: '#fff' }}>{payment.userEmail}</td>
                                        <td style={{ padding: '15px', color: '#22c55e', fontWeight: 'bold' }}>{payment.planName}</td>
                                        <td style={{ padding: '15px', color: '#fff' }}>₹{payment.amount}</td>
                                        <td style={{ padding: '15px', color: '#888', textTransform: 'capitalize' }}>{payment.paymentMethod}</td>
                                        <td style={{ padding: '15px', color: '#888' }}>
                                            {payment.createdAt ? (payment.createdAt.toDate ? payment.createdAt.toDate().toLocaleDateString() : new Date(payment.createdAt).toLocaleDateString()) : 'Unknown'}
                                        </td>
                                    </tr>
                                ))}
                                {payments.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#666' }}>No payment records found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RAW DATABASE DIAGNOSTICS (Admin Only) */}
                <div style={{ background: '#050505', padding: '30px', borderRadius: '12px', border: '2px solid #333', marginTop: '40px' }}>
                    <h2 style={{ fontSize: '1.2rem', color: '#666', marginBottom: '20px', letterSpacing: '2px' }}>RAW DATABASE DIAGNOSTICS (ALL DOCUMENTS)</h2>
                    <p style={{ color: '#444', fontSize: '0.8rem', marginBottom: '20px' }}>Use this to find users missing roles or with typos in emails.</p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #222', color: '#444' }}>
                                    <th style={{ padding: '10px' }}>DOC_ID</th>
                                    <th style={{ padding: '10px' }}>EMAIL</th>
                                    <th style={{ padding: '10px' }}>ROLE</th>
                                    <th style={{ padding: '10px' }}>TRAINER_EMAIL</th>
                                    <th style={{ padding: '10px' }}>TRAINER_ID</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...clients, ...trainers, ...admins].map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #111' }}>
                                        <td style={{ padding: '10px', color: '#666' }}>{u.id}</td>
                                        <td style={{ padding: '10px', color: '#fff' }}>{u.email}</td>
                                        <td style={{ padding: '10px', color: '#f97316' }}>{u.role || 'NULL'}</td>
                                        <td style={{ padding: '10px', color: '#3b82f6' }}>{u.trainerEmail || 'NONE'}</td>
                                        <td style={{ padding: '10px', color: '#22c55e' }}>{u.trainerId || 'NONE'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINATION CONTROLS */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '30px', borderTop: '1px solid #222', paddingTop: '20px' }}>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: currentPage === 1 ? '#444' : '#fff',
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    cursor: currentPage === 1 ? 'default' : 'pointer',
                                    fontWeight: '900',
                                    fontSize: '0.75rem'
                                }}
                            >PREV</button>

                            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                                PAGE <span style={{ color: '#fff' }}>{currentPage}</span> OF {totalPages}
                            </div>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: currentPage === totalPages ? '#444' : '#fff',
                                    padding: '10px 20px',
                                    borderRadius: '8px',
                                    cursor: currentPage === totalPages ? 'default' : 'pointer',
                                    fontWeight: '900',
                                    fontSize: '0.75rem'
                                }}
                            >NEXT</button>
                        </div>
                    )}

                    {paginatedClients.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
                            No clients match your search criteria.
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}

export default AdminDashboard
