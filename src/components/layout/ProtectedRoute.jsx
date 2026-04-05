import { Navigate, Outlet } from 'react-router-dom'
import { useApp } from '../../context/AppContext'

export default function ProtectedRoute() {
  const { user, loading } = useApp()

  if (loading) {
    return <div className="loading-screen" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>Loading...</div>
  }

  // If there is no user logged in, kick them back to login page
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If user exists, render the protected component
  return <Outlet />
}
