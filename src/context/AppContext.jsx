import { createContext, useState, useContext, useEffect } from 'react'

const AppContext = createContext()
const API_BASE = 'http://18.232.179.244/api'

export function AppProvider({ children }) {
  // --- Auth State ---
  const [user, setUser] = useState({
    name: 'Admin',
    email: 'admin@crafthost.gg',
    plan: 'Enterprise',
    initials: 'AD'
  })

  const login = (email) => {
    setUser({
      name: email.split('@')[0],
      email: email,
      plan: 'Pro Plan',
      initials: email.split('@')[0].substring(0, 2).toUpperCase()
    })
  }

  const logout = () => {
    setUser(null)
  }

  // --- Servers State ---
  const [servers, setServers] = useState([])

  // Fetch servers from real backend
  const fetchServers = async () => {
    try {
      const res = await fetch(`${API_BASE}/servers`)
      const data = await res.json()
      setServers(data.servers || [])
    } catch (e) {
      console.error("Failed to fetch servers", e)
    }
  }

  useEffect(() => {
    // Initial fetch
    fetchServers()
    // Poll every 3 seconds to keep status in sync with backend
    const interval = setInterval(fetchServers, 3000)
    return () => clearInterval(interval)
  }, [])

  // --- Actions ---
  const deployServer = async (name, version) => {
    try {
      await fetch(`${API_BASE}/servers/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: name || 'New Vanilla Server', 
          versionType: 'Paper', 
          versionNumber: '1.16.5' // Using 1.16.5 specifically for Java 8 compatibility
        })
      })
      await fetchServers() // Refresh list immediately
    } catch (e) {
      console.error("Deploy failed", e)
    }
  }

  const toggleServerStatus = async (id, targetStatus) => {
    // Optimistic UI update
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: targetStatus })
      })
      await fetchServers()
    } catch (e) {
      console.error("Power action failed", e)
    }
  }

  return (
    <AppContext.Provider value={{ 
      user, login, logout,
      servers, deployServer, toggleServerStatus
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
