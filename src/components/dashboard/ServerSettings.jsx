import { useState, useEffect } from 'react'
import { Save, RefreshCcw, AlertTriangle, Trash2, Users, UserPlus, Shield } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ServerSettings.css'

export default function ServerSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getAuthHeaders, API_BASE, servers } = useApp()
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settings, setSettings] = useState(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [permissions, setPermissions] = useState([])
  const [loadingPerms, setLoadingPerms] = useState(false)

  const server = servers.find(s => s.id === id)
  const isOnline = server?.status === 'online'

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_BASE}/servers/${id}/settings`, {
          headers: getAuthHeaders()
        })
        if (res.ok) {
          const data = await res.json()
          setSettings(data)
        }
      } catch (err) {
        console.error('Failed to fetch settings', err)
      } finally {
        setLoadingSettings(false)
      }
    }
    fetchSettings()
    // getAuthHeaders and API_BASE are stable from context; intentionally omitting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (activeTab === 'access') {
      fetchPermissions()
    }
    // fetchPermissions is defined in this scope; intentionally omitting from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id])

  const fetchPermissions = async () => {
    setLoadingPerms(true)
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/permissions`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setPermissions(data.permissions || [])
      }
    } catch {
      console.error('fetchPermissions failed')
    } finally {
      setLoadingPerms(false)
    }
  }

  const handleShareAccess = async (e) => {
    e.preventDefault()
    const email = e.target.email.value
    const role = e.target.role.value
    
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/permissions`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role })
      })
      if (res.ok) {
        e.target.reset()
        fetchPermissions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to share access')
      }
    } catch {
      alert('Error sharing access')
    }
  }

  const handleRevokeAccess = async (userId) => {
    if (!confirm('Are you sure you want to revoke access for this user?')) return
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/permissions/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (res.ok) {
        fetchPermissions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to revoke access')
      }
    } catch {
      alert('Error revoking access')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    
    const formData = new FormData(e.target)
    const payload = Object.fromEntries(formData.entries())

    try {
      const res = await fetch(`${API_BASE}/servers/${id}/settings`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setSettings(payload)

        // If the server is online, also apply the settings live via RCON commands
        if (isOnline) {
          const commands = []
          if (payload.difficulty) commands.push(`difficulty ${payload.difficulty}`)
          if (payload.gamemode) commands.push(`defaultgamemode ${payload.gamemode}`)
          
          for (const cmd of commands) {
            try {
              await fetch(`${API_BASE}/servers/${id}/players/action`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName: '', action: cmd })
              })
            } catch (e) { /* best effort */ }
          }
        }

        alert("Settings saved successfully." + (isOnline ? " Applied live to running server." : " Restart the server for changes to take effect."))
      }
    } catch (err) {
      // If we have an error object use it, otherwise show generic
      alert('Failed to save settings' + (err && err.message ? (': ' + err.message) : '.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteServer = async () => {
    const confirmInput = prompt(`DANGER: Type "DELETE" to permanently destroy this server and all its files.`);
    if (confirmInput !== 'DELETE') return;

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/servers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        alert("Server permanently deleted.");
        navigate('/dashboard');
        // A full page reload might be needed if Context isn't explicitly dropping the server or re-fetching
        window.location.reload(); 
      } else {
        alert("Failed to delete server.");
      }
    } catch (err) {
      alert("Error: " + (err && err.message ? err.message : 'Unknown'));
    } finally {
      setDeleting(false);
    }
  }

  if (loadingSettings) {
    return <div className="server-settings"><div className="settings-content card" style={{ padding: '2rem', textAlign: 'center' }}>Loading settings...</div></div>
  }

  return (
    <div className="server-settings">
      <div className="settings-sidebar">
        <nav className="settings-nav">
          <button className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General Information</button>
          <button className={`settings-nav-item ${activeTab === 'game' ? 'active' : ''}`} onClick={() => setActiveTab('game')}>Game Settings</button>
          <button className={`settings-nav-item ${activeTab === 'network' ? 'active' : ''}`} onClick={() => setActiveTab('network')}>Network & Ports</button>
          <button className={`settings-nav-item ${activeTab === 'world' ? 'active' : ''}`} onClick={() => setActiveTab('world')}>World Management</button>
          <button className={`settings-nav-item ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security</button>
          <button className={`settings-nav-item ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>Access Sharing</button>
          <button className={`settings-nav-item text-danger ${activeTab === 'danger' ? 'active' : ''}`} onClick={() => setActiveTab('danger')}>Danger Zone</button>
        </nav>
      </div>
      
      <div className="settings-content card">
        {activeTab === 'access' ? (
          <div className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <Users size={18} /> Access Sharing
                </h2>
                <p className="settings-desc">Grant other registered accounts access to manage this server.</p>
              </div>
            </div>

            <form onSubmit={handleShareAccess} className="settings-grid" style={{ marginTop: '2rem', marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                <label>User Email</label>
                <input type="email" name="email" className="form-control" placeholder="user@example.com" required />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Role</label>
                <select name="role" className="form-control" required>
                  <option value="on_off">Power Only (Start/Stop)</option>
                  <option value="full">Full Control</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                <UserPlus size={16} /> Share
              </button>
            </form>

            <div className="settings-grid">
              <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Shared Users</h3>
              {loadingPerms ? (
                <div style={{ color: '#888' }}>Loading permissions...</div>
              ) : permissions.length === 0 ? (
                <div style={{ color: '#888', padding: '1rem', textAlign: 'center', border: '1px dashed var(--border-primary)', borderRadius: '8px' }}>
                  Not shared with anyone yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {permissions.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--border-primary)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: '500', color: '#fff' }}>{p.name}</div>
                          <div style={{ fontSize: '12px', color: '#aaa' }}>{p.email}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span className={`badge ${p.role === 'full' ? 'badge-primary' : 'badge-neutral'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Shield size={12} />
                          {p.role === 'full' ? 'Full Control' : 'Power Only'}
                        </span>
                        <button className="btn-icon btn-ghost text-danger" title="Revoke Access" onClick={() => handleRevokeAccess(p.userId)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'danger' ? (
          <div className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title text-danger" style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <AlertTriangle size={18} /> Danger Zone
                </h2>
                <p className="settings-desc text-danger">Irreversible catastrophic actions for this server instance.</p>
              </div>
            </div>
            <div className="settings-grid" style={{ marginTop: '2rem' }}>
              <div style={{ border: '1px solid var(--border-primary)', padding: '24px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>Delete this server</h4>
                  <p style={{ color: '#aaa', fontSize: '13px' }}>Once you delete a server, there is no going back. Please be certain.</p>
                </div>
                <button 
                  className="btn btn-primary" 
                  style={{ backgroundColor: 'var(--error-color)', borderColor: 'var(--error-color)' }}
                  onClick={handleDeleteServer}
                  disabled={deleting}
                >
                  <Trash2 size={16} /> 
                  <span>{deleting ? 'Deleting...' : 'Delete Server'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'network' ? (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title">Network & Ports</h2>
                <p className="settings-desc">View and manage server network configurations.</p>
              </div>
              <div className="settings-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Server IP Address</label>
                <input type="text" className="form-control" value={server?.ip || 'N/A'} disabled />
                <span className="form-hint">The public IP address mapped to your server.</span>
              </div>

              <div className="form-group">
                <label>Server Port</label>
                <input type="number" className="form-control" value={server?.port || '25565'} disabled />
                <span className="form-hint">The designated port for this server instance.</span>
              </div>
            </div>
          </form>
        ) : activeTab === 'world' ? (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title">World Management</h2>
                <p className="settings-desc">Configure world generation properties. Changes require a server restart and a new world generation if the seed is changed.</p>
              </div>
              <div className="settings-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Level Seed</label>
                <input type="text" className="form-control" name="levelSeed" defaultValue={settings?.levelSeed || ''} placeholder="Leave blank for random" />
              </div>

              <div className="form-group">
                <label>Generate Structures</label>
                <select className="form-control" name="generateStructures" defaultValue={settings?.generateStructures || 'true'}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div className="form-group">
                <label>Hardcore Mode</label>
                <select className="form-control" name="hardcore" defaultValue={settings?.hardcore || 'false'}>
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
                <span className="form-hint text-danger">If enabled, players who die will be permanently banned from the server.</span>
              </div>
            </div>
          </form>
        ) : activeTab === 'security' ? (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title">Security</h2>
                <p className="settings-desc">Configure player access and gameplay security.</p>
              </div>
              <div className="settings-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Online Mode (Authentication)</label>
                <select className="form-control" name="onlineMode" defaultValue={settings?.onlineMode || 'true'}>
                  <option value="true">Enabled (Premium Accounts Only)</option>
                  <option value="false">Disabled (Offline/Cracked Mode)</option>
                </select>
                <span className="form-hint">Disabling this allows non-premium accounts to join but is a security risk.</span>
              </div>

              <div className="form-group">
                <label>Whitelist</label>
                <select className="form-control" name="whiteList" defaultValue={settings?.whiteList || 'false'}>
                  <option value="false">Disabled</option>
                  <option value="true">Enabled</option>
                </select>
              </div>

              <div className="form-group">
                <label>Player vs Player (PvP)</label>
                <select className="form-control" name="pvp" defaultValue={settings?.pvp || 'true'}>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </div>

              <div className="form-group">
                <label>Spawn Protection Radius</label>
                <input type="number" className="form-control" name="spawnProtection" defaultValue={settings?.spawnProtection || '16'} min="0" max="100" />
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title">Game Settings</h2>
                <p className="settings-desc">Configure core gameplay mechanics. {isOnline ? 'Changes will be applied live.' : 'Changes require a server restart to take effect.'}</p>
              </div>
              <div className="settings-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                  <Save size={14} />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Game Mode</label>
                <select className="form-control" name="gamemode" defaultValue={settings?.gamemode || 'survival'}>
                  <option value="survival">Survival</option>
                  <option value="creative">Creative</option>
                  <option value="adventure">Adventure</option>
                  <option value="spectator">Spectator</option>
                </select>
              </div>

              <div className="form-group">
                <label>Difficulty</label>
                <select className="form-control" name="difficulty" defaultValue={settings?.difficulty || 'normal'}>
                  <option value="peaceful">Peaceful</option>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="form-group">
                <label>Max Players</label>
                <input type="number" className="form-control" name="maxPlayers" defaultValue={settings?.maxPlayers || '20'} min="1" max="1000" />
              </div>

              <div className="form-group">
                <label>View Distance</label>
                <input type="number" className="form-control" name="viewDistance" defaultValue={settings?.viewDistance || '10'} min="2" max="32" />
                <span className="form-hint">Higher values consume exponentially more RAM.</span>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
