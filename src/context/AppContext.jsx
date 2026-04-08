import { createContext, useState, useContext, useEffect } from 'react'

const AppContext = createContext()
const API_BASE = '/api'

export function AppProvider({ children }) {
  // --- Auth State ---
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Verify token on load
  useEffect(() => {
    const verifyUser = async () => {
      const token = localStorage.getItem('crafthost_token')
      if (!token) {
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        
        if (data.user) {
          setUser({ ...data.user, initials: data.user.name.substring(0, 2).toUpperCase() })
        } else {
          localStorage.removeItem('crafthost_token')
        }
      } catch (err) {
        console.error('Auth verification failed', err)
      } finally {
        setLoading(false)
      }
    }

    verifyUser()
  }, [])

  const login = (userData, token) => {
    localStorage.setItem('crafthost_token', token)
    setUser({ ...userData, initials: userData.name.substring(0, 2).toUpperCase() })
  }

  const logout = () => {
    localStorage.removeItem('crafthost_token')
    setUser(null)
  }

  // --- Servers State ---
  const [servers, setServers] = useState([])

  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('crafthost_token')}`
    }
  }

  // Fetch servers from real backend
  const fetchServers = async () => {
    if (!localStorage.getItem('crafthost_token')) return;
    try {
      const res = await fetch(`${API_BASE}/servers`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      setServers(data.servers || [])
    } catch (e) {
      console.error("Failed to fetch servers", e)
    }
  }

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 3000)
    return () => clearInterval(interval)
  }, [user])

  // --- Actions ---
  const deployServer = async (name, version) => {
    try {
      await fetch(`${API_BASE}/servers/deploy`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          name: name || 'New Vanilla Server', 
          versionType: 'Paper', 
          versionNumber: '1.21.11'
        })
      })
      await fetchServers()
    } catch (e) {
      console.error("Deploy failed", e)
    }
  }

  const toggleServerStatus = async (id, targetStatus) => {
    setServers(prev => prev.map(s => {
      if (s.id === id) {
        if (targetStatus === 'start' || targetStatus === 'restart') return { ...s, status: 'starting' }
        if (targetStatus === 'stop') return { ...s, status: 'stopping' }
      }
      return s
    }))

    try {
      await fetch(`${API_BASE}/servers/${id}/power`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: targetStatus })
      })
      await fetchServers()
    } catch (e) {
      console.error("Power action failed", e)
    }
  }

  return (
    <AppContext.Provider value={{ 
      user, loading, login, logout,
      servers, deployServer, toggleServerStatus,
      getAuthHeaders, API_BASE
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
