import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { Server, Activity, Cpu, HardDrive, Clock, Search, Bell, Shield } from 'lucide-react'
import { useApp } from '../context/AppContext'
import './AdminPanel.css'

export default function AdminPanel() {
  const navigate = useNavigate()
  const { user } = useApp()
  const token = localStorage.getItem('crafthost_token')
  const [vms, setVms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Redirect if not admin
    if (user && user.role !== 'admin') {
      navigate('/dashboard')
      return
    }

    const fetchVMs = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE || '/api'
        const res = await fetch(`${API_BASE}/admin/vms`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setVms(data.vms)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (user && token) {
      fetchVMs()
      // Poll every 10 seconds
      const interval = setInterval(fetchVMs, 10000)
      return () => clearInterval(interval)
    }
  }, [user, navigate])

  const formatTimeAgo = (dateString) => {
    if (!dateString) return 'Never'
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    return `${Math.floor(minutes / 60)}h ago`
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-main">
        <header className="dashboard-header">
          <div className="search-bar hide-mobile">
            <Search size={18} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search VMs..." />
          </div>
          
          <div className="header-actions">
            <button className="btn-icon" type="button" aria-label="Notifications">
              <Bell size={20} />
            </button>
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-header-block">
            <h1 className="admin-title">
              <Shield className="text-accent" size={28} /> System Administration
            </h1>
            <p className="admin-subtitle">Monitor live VM nodes and infrastructure capacity.</p>
          </div>

          {error && (
            <div className="admin-error" role="alert">
              Error loading VMs: {error}
            </div>
          )}

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Node ID / Region</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Capacity</th>
                  <th>System Resources</th>
                  <th>Last Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {loading && vms.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="admin-loading-cell">Loading infrastructure...</td>
                  </tr>
                ) : (
                  vms.map(vm => (
                    <tr key={vm.id}>
                      <td>
                        <div className="vm-name">
                          <Server size={16} className={vm.status === 'running' ? 'text-accent' : 'text-tertiary'} />
                          {vm.vmName}
                        </div>
                        <div className="vm-ip">{vm.region}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${vm.status}`}>
                          {vm.status}
                        </span>
                      </td>
                      <td className="vm-ip-mono">
                        {vm.ip || 'Unassigned'}
                      </td>
                      <td>
                        <div className="vm-capacity">
                          <div className="vm-capacity-pill">
                            <span className={vm.runningServers > 0 ? 'running' : ''}>{vm.runningServers}</span> / {vm.maxServers} <span className="text-tertiary" style={{ fontWeight: 400 }}>Running</span>
                          </div>
                        </div>
                        <div className="vm-capacity-meta">
                          {vm.deployedServers} Total Deployed
                        </div>
                      </td>
                      <td className="metrics-cell">
                        {vm.status === 'running' ? (
                          <>
                            <div className="resource-bar-container">
                              <Cpu size={14} className="text-tertiary" />
                              <div className="resource-bar-bg">
                                <div 
                                  className={`resource-bar-fill ${vm.cpuPercent > 80 ? 'critical' : vm.cpuPercent > 50 ? 'high' : ''}`} 
                                  style={{ width: `${Math.min(100, Math.max(0, vm.cpuPercent))}%` }}
                                />
                              </div>
                              <span className="resource-text">{vm.cpuPercent}%</span>
                            </div>
                            <div className="resource-bar-container">
                              <HardDrive size={14} className="text-tertiary" />
                              <div className="resource-bar-bg">
                                <div 
                                  className={`resource-bar-fill ${vm.ramUsedMB > 6000 ? 'critical' : vm.ramUsedMB > 4000 ? 'high' : ''}`} 
                                  style={{ width: `${Math.min(100, (vm.ramUsedMB / 8000) * 100)}%` }}
                                />
                              </div>
                              <span className="resource-text">{vm.ramUsedMB}MB</span>
                            </div>
                          </>
                        ) : (
                          <span className="admin-offline-label">Offline</span>
                        )}
                      </td>
                      <td>
                        <div className="vm-heartbeat">
                          <Activity size={14} className={vm.status === 'running' && new Date() - new Date(vm.lastHeartbeat) < 15000 ? 'text-accent' : ''} />
                          {formatTimeAgo(vm.lastHeartbeat)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {vms.length === 0 && !loading && !error && (
              <div className="admin-empty">
                No VMs found in the database.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
