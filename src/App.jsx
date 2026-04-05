import { Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ServerPanel from './pages/ServerPanel'
import Auth from './pages/Auth'
import PricingPage from './pages/PricingPage'
import './App.css'

function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth type="login" />} />
        <Route path="/signup" element={<Auth type="signup" />} />
        <Route path="/pricing" element={<PricingPage />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/server/:id" element={<ServerPanel />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}

export default App
