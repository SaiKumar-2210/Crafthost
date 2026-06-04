/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useContext, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

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
  const socketRef = useRef(null)
  const serversRef = useRef([])

  // Keep serversRef in sync so socket callbacks see latest server list
  useEffect(() => {
    serversRef.current = servers
  }, [servers])

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
    } catch {
      console.error("Failed to fetch servers")
    }
  }

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 5000)
    return () => clearInterval(interval)
  }, [user])

  // --- Global Socket.IO for real-time status updates ---
  useEffect(() => {
    if (!user) {
      // Cleanup socket on logout
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      return
    }

    const socket = io('/', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 10000,
    })
    socketRef.current = socket

    // Join all server rooms so we get status-update events
    const joinAllServers = () => {
      const currentServers = serversRef.current
      currentServers.forEach(s => {
        socket.emit('join-server', s.id)
      })
    }

    // 'connect' fires on both initial connection AND reconnection in Socket.IO v4
    socket.on('connect', () => {
      console.log('[AppContext] Socket.IO connected')
      joinAllServers()
    })

    // When daemon reports server online/offline, update immediately
    socket.on('status-update', () => {
      fetchServers()
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [user])

  // Join new server rooms when server list changes (e.g., after deploy)
  const joinedServersRef = useRef(new Set())
  useEffect(() => {
    if (socketRef.current?.connected && servers.length > 0) {
      servers.forEach(s => {
        if (!joinedServersRef.current.has(s.id)) {
          socketRef.current.emit('join-server', s.id)
          joinedServersRef.current.add(s.id)
        }
      })
    }
  }, [servers])

  // --- Actions ---
  const deployServer = async (name, version, azureLocation) => {
    try {
      const res = await fetch(`${API_BASE}/servers/deploy`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          name: name || 'New SMP Server', 
          versionType: 'Paper', 
          versionNumber: version || '1.21.11',
          azureLocation: azureLocation || 'eastus'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Deployment failed' };
      }
      return data; // { jobId, message }
    } catch (e) {
      console.error("Deploy failed", e);
      return { error: 'Network connection failed' };
    }
  }

  const getJobStatus = async (jobId) => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const deleteServer = async (serverId) => {
    try {
      const res = await fetch(`${API_BASE}/servers/${serverId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Delete failed');
        return false;
      }
      await fetchServers();
      return true;
    } catch (e) {
      alert('Network failed');
      return false;
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
        // Fetch immediately on error to get correct status
        await fetchServers()
        return
      }
      // Delay the fetch so the backend has time to update the DB status.
      // Without this delay, fetchServers() returns stale 'offline' data
      // and overwrites our optimistic 'starting' status.
      setTimeout(fetchServers, 3000)
    } catch (e) {
      console.error("Power action failed", e)
      alert("Network failed to dispatch server command");
      await fetchServers()
    }
  }

  return (
    <AppContext.Provider value={{ 
      user, loading, login, logout,
      servers, deployServer, toggleServerStatus, deleteServer, getJobStatus,
      getAuthHeaders, API_BASE
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
