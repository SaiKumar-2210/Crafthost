import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { ChevronLeft, Terminal, FolderOpen, Users, Cpu, Settings as SettingsIcon, Play, Square, RotateCcw, Copy } from 'lucide-react'
import ConsoleTerminal from '../components/dashboard/ConsoleTerminal'
import FileManager from '../components/dashboard/FileManager'
import PlayerList from '../components/dashboard/PlayerList'
import ResourceCharts from '../components/dashboard/ResourceCharts'
import ServerSettings from '../components/dashboard/ServerSettings'
import { useApp } from '../context/AppContext'
import './ServerPanel.css'

export default function ServerPanel() {
  const { id } = useParams()
  const { servers, toggleServerStatus } = useApp()
  const [activeTab, setActiveTab] = useState('overview')
  
  const server = servers.find(s => s.id === id)

  if (!server) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <div className="dashboard-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '1rem' }}>Server Not Found</h2>
            <Link to="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
          </div>
        </div>
      </div>
    )
  }

  const isOnline = server.status === 'online'
  const isTransitioning = ['starting', 'stopping', 'queued', 'provisioning', 'deploying'].includes(server.status)

  const statusLabel = {
    online: 'Online',
    starting: 'Starting VM / Server...',
    stopping: 'Stopping...',
    queued: 'Queued...',
    provisioning: 'Provisioning...',
    deploying: 'Deploying...',
    offline: 'Offline',
  }[server.status] || server.status

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Cpu },
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'files', label: 'File Manager', icon: FolderOpen },
    { id: 'players', label: 'Players', icon: Users },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ]

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-main">
        {/* Deep dive header */}
        <header className="server-panel-header">
          <div className="header-breadcrumbs">
            <Link to="/dashboard" className="back-link">
              <ChevronLeft size={16} />
              <span>Back to Servers</span>
            </Link>
          </div>
          
          <div className="server-critical-actions">
             <button 
               className="btn btn-secondary btn-sm" 
               disabled={isOnline || isTransitioning}
               onClick={() => toggleServerStatus(server.id, 'start')}
             >
              <Play size={14} />
              <span>Start</span>
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={!isOnline && !isTransitioning}
              onClick={() => toggleServerStatus(server.id, 'stop')}
            >
              <Square size={14} />
              <span>Stop</span>
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={!isOnline}
              onClick={() => toggleServerStatus(server.id, 'restart')}
            >
              <RotateCcw size={14} />
              <span>Restart</span>
            </button>
          </div>
        </header>

        <div className="dashboard-content server-panel-content">
          {/* Server Info Bar */}
          <div className="server-info-banner card">
            <div className="info-primary">
              <div className={`status-pulse ${isOnline ? 'pulse-online' : isTransitioning ? 'pulse-warning' : ''}`} />
              <div>
                <h1 className="server-banner-name" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {server.name}
                  <span className={`badge ${isOnline ? 'badge-success' : isTransitioning ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '0.85rem', fontWeight: '500', padding: '4px 8px' }}>
                    {statusLabel}
                  </span>
                </h1>
                <div className="server-banner-ip">
                  <span>{(() => {
                    if (!server.ip) return 'Provisioning...';
                    const host = server.hostname || server.ip;
                    return server.port ? `${host}:${server.port}` : host;
                  })()}</span>
                  <button 
                    className="btn-icon btn-ghost btn-xs"
                    onClick={() => {
                      if (!server.ip) return;
                      const host = server.hostname || server.ip;
                      const addr = server.port ? `${host}:${server.port}` : host;
                      if (navigator.clipboard && window.isSecureContext) {
                        navigator.clipboard.writeText(addr);
                      } else {
                        const textArea = document.createElement("textarea");
                        textArea.value = addr;
                        document.body.appendChild(textArea);
                        textArea.select();
                        try { document.execCommand('copy'); } catch { }
                        document.body.removeChild(textArea);
                      }
                      alert("Copied to clipboard!");
                    }}
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="info-stats hide-mobile">
              <div className="info-stat">
                <span className="stat-sm-label">Node</span>
                <span className="stat-sm-value">{server.node}</span>
              </div>
              <div className="info-stat">
                <span className="stat-sm-label">Version</span>
                <span className="stat-sm-value">{server.version}</span>
              </div>
              <div className="info-stat">
                <span className="stat-sm-label">Uptime</span>
                <span className="stat-sm-value">{server.uptime}</span>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="panel-tabs">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button 
                  key={tab.id}
                  className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Tab Content Area — all panels stay mounted, only active one visible */}
          <div className="tab-content-area">
            <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
              <ResourceCharts server={server} visible={activeTab === 'overview'} />
            </div>
            <div style={{ display: activeTab === 'console' ? 'block' : 'none' }}>
              <ConsoleTerminal />
            </div>
            <div style={{ display: activeTab === 'files' ? 'block' : 'none' }}>
              <FileManager />
            </div>
            <div style={{ display: activeTab === 'players' ? 'block' : 'none' }}>
              <PlayerList visible={activeTab === 'players'} />
            </div>
            <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
              <ServerSettings />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
