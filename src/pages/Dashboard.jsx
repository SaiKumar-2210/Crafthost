import Sidebar from '../components/layout/Sidebar'
import StatsGrid from '../components/dashboard/StatsGrid'
import ServerCard from '../components/dashboard/ServerCard'
import DeployModal from '../components/dashboard/DeployModal'
import { Search, Bell } from 'lucide-react'
import { useApp } from '../context/AppContext'
import './Dashboard.css'

export default function Dashboard() {
  const { user, servers, showDeployModal, setShowDeployModal } = useApp()

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-main">
        {/* Topbar */}
        <header className="dashboard-topbar">
          <div className="search-bar hide-mobile">
            <Search size={18} />
            <input type="text" placeholder="Search servers..." />
          </div>
          
          <div className="topbar-actions">
            <button className="btn-icon">
              <Bell size={20} />
              <span className="notification-dot"></span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="dashboard-content">
          <div className="dashboard-welcome">
            <h1 className="dashboard-title">Welcome back, {user?.name || 'Player'}</h1>
            <p className="dashboard-subtitle">Here's what's happening across your network today.</p>
          </div>

          <StatsGrid />

          <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="servers-section">
              <div className="section-header-compact">
                <h2 className="section-title-sm">Active Servers</h2>
                <button className="btn-link text-sm">View All</button>
              </div>
              <div className="servers-list">
                {servers.map(server => (
                  <ServerCard key={server.id} server={server} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showDeployModal && <DeployModal onClose={() => setShowDeployModal(false)} />}
    </div>
  )
}
