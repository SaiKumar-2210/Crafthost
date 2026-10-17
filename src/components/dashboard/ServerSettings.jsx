import { useState, useEffect } from 'react'
import { Save, RefreshCcw, AlertTriangle, Trash2, Users, UserPlus, Shield } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ServerSettings.css'

export default function ServerSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getAuthHeaders, API_BASE, servers } = useApp()
  const [activeTab, setActiveTab] = useState('game')
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
    return <div className="server-settings"><div className="settings-content card settings-loading">Loading settings...</div></div>
  }

  return (
    <div className="server-settings">
      <div className="settings-sidebar">
        <nav className="settings-nav">
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
                <h2 className="settings-title settings-title-row">
                  <Users size={18} /> Access Sharing
                </h2>
                <p className="settings-desc">Grant other registered accounts access to manage this server.</p>
              </div>
            </div>

            <form onSubmit={handleShareAccess} className="access-share-form">
              <div className="form-group flex-grow">
                <label>User Email</label>
                <input type="email" name="email" className="form-control" placeholder="user@example.com" required />
              </div>
              <div className="form-group flex-role">
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

            <div>
              <h3 className="settings-subtitle">Shared Users</h3>
              {loadingPerms ? (
                <div className="text-secondary">Loading permissions...</div>
              ) : permissions.length === 0 ? (
                <div className="access-empty">
                  Not shared with anyone yet.
                </div>
              ) : (
                <div className="access-list">
                  {permissions.map((p, i) => (
                    <div key={i} className="access-row">
                      <div className="access-user">
                        <div className="access-avatar">
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="access-user-name">{p.name}</div>
                          <div className="access-user-email">{p.email}</div>
                        </div>
                      </div>
                      <div className="access-row-actions">
                        <span className={`badge ${p.role === 'full' ? 'badge-primary' : 'badge-neutral'}`}>
                          <Shield size={12} />
                          {p.role === 'full' ? 'Full Control' : 'Power Only'}
                        </span>
                        <button type="button" className="btn-icon btn-ghost text-danger" title="Revoke Access" onClick={() => handleRevokeAccess(p.userId)}>
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
                <h2 className="settings-title text-danger settings-title-row">
                  <AlertTriangle size={18} /> Danger Zone
                </h2>
                <p className="settings-desc text-danger">Irreversible catastrophic actions for this server instance.</p>
              </div>
            </div>
            <div className="settings-grid" style={{ marginTop: '2rem' }}>
              <div className="danger-card">
                <div>
                  <h4>Delete this server</h4>
                  <p>Once you delete a server, there is no going back. Please be certain.</p>
                </div>
                <button 
                  type="button"
                  className="btn btn-danger"
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
          <form onSubmit={handleSubmit} className="settings-form" key="network">
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
          <form onSubmit={handleSubmit} className="settings-form" key="world">
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
          <form onSubmit={handleSubmit} className="settings-form" key="security">
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
          <form onSubmit={handleSubmit} className="settings-form" key="game">
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
