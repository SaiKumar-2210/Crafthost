import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Server, Grid, TerminalSquare, FolderOpen, Users, HardDrive, Settings, CreditCard, ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import './Sidebar.css'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, setShowDeployModal } = useApp()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const navItems = [
    { icon: Grid, label: 'Overview', path: '/dashboard' },
    { icon: Server, label: 'My Servers', path: '#servers' },
    { icon: TerminalSquare, label: 'Console', path: '#console' },
    { icon: FolderOpen, label: 'File Manager', path: '#files' },
    { icon: Users, label: 'Players', path: '#players' },
    { icon: HardDrive, label: 'Backups', path: '#backups' },
  ]

  const settingsItems = [
    { icon: Settings, label: 'Account Settings', path: '#settings' },
    { icon: CreditCard, label: 'Billing', path: '#billing' },
  ]

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Server size={24} className="text-secondary" />
          {!collapsed && <span className="logo-text">CraftHost</span>}
        </div>
        <button 
          className="btn-icon collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="sidebar-nav-group">
        <span className="sidebar-nav-title">{!collapsed && 'Management'}</span>
        <nav className="sidebar-nav">
          {navItems.map((item, index) => {
            const isActive = item.path === '/dashboard' 
              ? location.pathname === '/dashboard' && !location.hash 
              : location.hash === item.path;
            
            return (
              <a 
                key={index} 
                href={item.path.startsWith('#') ? `/dashboard${item.path}` : item.path} 
                className={`sidebar-link ${isActive ? 'active' : ''}`}
              >
                <item.icon size={20} />
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-nav-group">
        <span className="sidebar-nav-title">{!collapsed && 'Account'}</span>
        <nav className="sidebar-nav">
          {settingsItems.map((item, index) => (
            <a 
              key={index} 
              href={`/dashboard${item.path}`} 
              className={`sidebar-link ${location.hash === item.path ? 'active' : ''}`}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </a>
          ))}
          <button 
            onClick={handleLogout} 
            className="sidebar-link" 
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
          >
            <LogOut size={20} />
            {!collapsed && <span>Log out</span>}
          </button>
        </nav>
      </div>

      <div className="sidebar-footer">
        <div style={{ padding: '0 1rem 1rem 1rem' }}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0.75rem 0' : '0.75rem 1rem' }}
            onClick={() => setShowDeployModal(true)}
          >
            <Plus size={18} />
            {!collapsed && <span>Deploy Server</span>}
          </button>
        </div>
        <div className="user-profile">
          <div className="user-avatar">
            {user?.initials || 'GH'}
          </div>
          {!collapsed && (
            <div className="user-info">
              <span className="user-name">{user?.name || 'Guest'}</span>
              <span className="user-plan text-accent">{user?.plan || 'No Plan'}</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
