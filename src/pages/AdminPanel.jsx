import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { Server, Activity, Cpu, HardDrive, Clock, Search, Bell, Shield } from 'lucide-react'
import { useApp } from '../context/AppContext'
import './AdminPanel.css'

export default function AdminPanel() {
  const navigate = useNavigate()
  const { user, token } = useApp()
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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/vms`, {
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
  }, [user, token, navigate])

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
        {/* Topbar */}
        <header className="dashboard-header" style={{ borderBottom: '1px solid var(--border-primary)', padding: '0 var(--space-xl)', height: 'var(--navbar-height)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="search-bar hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
            <Search size={18} className="text-tertiary" />
            <input type="text" placeholder="Search VMs..." style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
          
          <div className="header-actions" style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn-icon">
              <Bell size={20} />
            </button>
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-header-block">
            <h1 className="admin-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield className="text-accent" /> System Administration
            </h1>
            <p className="admin-subtitle">Monitor live VM nodes and infrastructure capacity.</p>
          </div>

          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
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
                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem' }}>Loading infrastructure...</td>
                  </tr>
                ) : (
                  vms.map(vm => (
                    <tr key={vm.id}>
                      <td>
                        <div className="vm-name">
                          <Server size={16} className={vm.status === 'running' ? 'text-accent' : 'text-tertiary'} />
                          {vm.vmName}
                        </div>
                        <div className="vm-ip" style={{ textTransform: 'capitalize' }}>{vm.region}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${vm.status}`}>
                          {vm.status}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {vm.ip || 'Unassigned'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ background: 'var(--bg-elevated)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            <span style={{ color: vm.runningServers > 0 ? '#10b981' : 'var(--text-secondary)' }}>{vm.runningServers}</span> / {vm.maxServers} <span style={{ fontWeight: 'normal', color: 'var(--text-tertiary)' }}>Running</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
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
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Offline</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
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
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No VMs found in the database.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
