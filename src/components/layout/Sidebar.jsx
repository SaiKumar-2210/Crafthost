import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Server, Grid, TerminalSquare, FolderOpen, Users, HardDrive, Settings, CreditCard, ChevronLeft, ChevronRight, LogOut, Plus, Shield, Activity, Play, Database } from 'lucide-react'
import logoImg from '../../assets/logo.jpg'
import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import './Sidebar.css'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useApp()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const navItems = [
    { icon: Grid, label: 'Home', path: '/' },
    { icon: Server, label: 'My Servers', path: '/dashboard' },
    { icon: HardDrive, label: 'Backups', path: '#backups' },
  ]

  if (user?.role === 'admin') {
    navItems.push({ icon: Shield, label: 'Admin Panel', path: '/admin' })
  }

  const settingsItems = [
    { icon: Settings, label: 'Account Settings', path: '#settings' },
    { icon: CreditCard, label: 'Billing', path: '#billing' },
  ]

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src={logoImg} alt="CraftHost Logo" style={{ height: '24px', marginRight: '8px', borderRadius: '4px' }} />
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
            className="btn btn-deploy" 
            style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? '0.75rem 0' : '0.75rem 1rem' }}
            onClick={() => navigate('/deploy')}
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
