import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './components/Login'
import TrainerLogin from './components/TrainerLogin'
import TrainerDashboard from './components/TrainerDashboard'
import ClientDashboard from './components/ClientDashboard'
import AIChatbot from './components/AIChatbot'
import AdminLogin from './components/AdminLogin'
import AdminDashboard from './components/AdminDashboard'
import PaymentPage from './components/PaymentPage'
import SelectCoach from './components/SelectCoach'
import CoachChat from './components/CoachChat'
import GymPayment from './components/GymPayment'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/trainer" element={<TrainerLogin />} />
            <Route path="/trainer/dashboard" element={<TrainerDashboard />} />
            <Route path="/dashboard" element={<ClientDashboard />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/payment" element={<PaymentPage />} />
            <Route path="/select-coach" element={<SelectCoach />} />
            <Route path="/coach-chat" element={<CoachChat />} />
            <Route path="/gym-payment" element={<GymPayment />} />
          </Routes>
          <AIChatbot />
        </div>
      </Router>
    </ErrorBoundary>
  )
}


export default App
