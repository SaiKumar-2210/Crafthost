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

  // --- Deploy Modal State ---
  const [showDeployModal, setShowDeployModal] = useState(false)

  // --- Actions ---
  const deployServer = async (name, version, region) => {
    try {
      const res = await fetch(`${API_BASE}/servers/deploy`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          name: name || 'New SMP Server', 
          versionType: 'Paper', 
          versionNumber: version || '1.21.11',
          region: region || 'ap-south-1'
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(`Deployment Error: ${errData.error || 'Unknown network error'}`);
        return;
      }
      await fetchServers()
    } catch (e) {
      console.error("Deploy failed", e)
      alert("Deployment network connection failed.");
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
      const res = await fetch(`${API_BASE}/servers/${id}/power`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: targetStatus })
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(`Server Error: ${errData.error || 'Unknown command rejection'}`);
      }
      await fetchServers()
    } catch (e) {
      console.error("Power action failed", e)
      alert("Network failed to dispatch server command");
    }
  }

  return (
    <AppContext.Provider value={{ 
      user, loading, login, logout,
      servers, deployServer, toggleServerStatus,
      showDeployModal, setShowDeployModal,
      getAuthHeaders, API_BASE
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
