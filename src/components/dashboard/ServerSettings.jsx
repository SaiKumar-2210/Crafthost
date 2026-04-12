import { useState } from 'react'
import { Save, RefreshCcw, AlertTriangle, Trash2 } from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ServerSettings.css'

export default function ServerSettings() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { getAuthHeaders, API_BASE } = useApp()
  const [activeTab, setActiveTab] = useState('general')
  const [deleting, setDeleting] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    // Simulated save
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
      alert("Error: " + err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="server-settings">
      <div className="settings-sidebar">
        <nav className="settings-nav">
          <button className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General Information</button>
          <button className={`settings-nav-item ${activeTab === 'game' ? 'active' : ''}`} onClick={() => setActiveTab('game')}>Game Settings</button>
          <button className="settings-nav-item">Network & Ports</button>
          <button className="settings-nav-item">World Management</button>
          <button className="settings-nav-item">Security</button>
          <button className={`settings-nav-item text-danger ${activeTab === 'danger' ? 'active' : ''}`} onClick={() => setActiveTab('danger')}>Danger Zone</button>
        </nav>
      </div>
      
      <div className="settings-content card">
        {activeTab === 'danger' ? (
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
        ) : (
          <form onSubmit={handleSubmit} className="settings-form">
            <div className="settings-header">
              <div>
                <h2 className="settings-title">Game Settings</h2>
                <p className="settings-desc">Configure core gameplay mechanics. Changes require a server restart to take effect.</p>
              </div>
              <div className="settings-actions">
                <button type="button" className="btn btn-secondary btn-sm">
                  <RefreshCcw size={14} />
                  <span>Reset</span>
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Save size={14} />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            <div className="settings-grid">
              <div className="form-group">
                <label>Game Mode</label>
                <select className="form-control" defaultValue="survival">
                  <option value="survival">Survival</option>
                  <option value="creative">Creative</option>
                  <option value="adventure">Adventure</option>
                  <option value="spectator">Spectator</option>
                </select>
              </div>

              <div className="form-group">
                <label>Difficulty</label>
                <select className="form-control" defaultValue="normal">
                  <option value="peaceful">Peaceful</option>
                  <option value="easy">Easy</option>
                  <option value="normal">Normal</option>
                  <option value="hard">Hard</option>
                </select>
              </div>

              <div className="form-group">
                <label>Max Players</label>
                <input type="number" className="form-control" defaultValue="50" min="1" max="1000" />
              </div>

              <div className="form-group">
                <label>View Distance</label>
                <input type="number" className="form-control" defaultValue="10" min="2" max="32" />
                <span className="form-hint">Higher values consume exponentially more RAM.</span>
              </div>
            </div>

            <div className="settings-toggles">
              <label className="toggle-label">
                <div className="toggle-info">
                  <span className="toggle-title">Hardcore Mode</span>
                  <span className="form-hint">Death is permanent. Players are banned upon dying.</span>
                </div>
                <div className="toggle-switch">
                  <input type="checkbox" />
                  <span className="slider"></span>
                </div>
              </label>

              <label className="toggle-label">
                <div className="toggle-info">
                  <span className="toggle-title">Allow Nether</span>
                  <span className="form-hint">Enable or disable the Nether dimension.</span>
                </div>
                <div className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="slider"></span>
                </div>
              </label>

              <label className="toggle-label">
                <div className="toggle-info">
                  <span className="toggle-title">Spawn Monsters</span>
                  <span className="form-hint">Determines if hostiles will spawn at night or in the dark.</span>
                </div>
                <div className="toggle-switch">
                  <input type="checkbox" defaultChecked />
                  <span className="slider"></span>
                </div>
              </label>
              
              <label className="toggle-label">
                <div className="toggle-info">
                  <span className="toggle-title">Force Gamemode</span>
                  <span className="form-hint">Force players to join in the default gamemode.</span>
                </div>
                <div className="toggle-switch">
                  <input type="checkbox" />
                  <span className="slider"></span>
                </div>
              </label>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
