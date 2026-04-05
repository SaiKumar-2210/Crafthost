import { Save, RefreshCcw } from 'lucide-react'
import './ServerSettings.css'

export default function ServerSettings() {
  const handleSubmit = (e) => {
    e.preventDefault()
    // Simulated save
  }

  return (
    <div className="server-settings">
      <div className="settings-sidebar">
        <nav className="settings-nav">
          <button className="settings-nav-item active">General Information</button>
          <button className="settings-nav-item">Game Settings</button>
          <button className="settings-nav-item">Network & Ports</button>
          <button className="settings-nav-item">World Management</button>
          <button className="settings-nav-item">Security</button>
          <button className="settings-nav-item text-danger">Danger Zone</button>
        </nav>
      </div>
      
      <div className="settings-content card">
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
      </div>
    </div>
  )
}
