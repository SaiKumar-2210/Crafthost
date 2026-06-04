import { Play, Square, Settings, HardDrive, Users, Cpu, Copy, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ServerCard.css'

export default function ServerCard({ server }) {
  const { toggleServerStatus } = useApp()
  const isOnline = server.status === 'online'
  const isTransitioning = ['starting', 'stopping', 'queued', 'provisioning', 'deploying'].includes(server.status)

  const statusLabel = {
    online: 'Online',
    starting: 'Starting...',
    stopping: 'Stopping...',
    queued: 'Queued...',
    provisioning: 'Provisioning...',
    deploying: 'Deploying...',
    offline: 'Offline',
  }[server.status] || server.status

  const safePlayers = server.players || '0/20';
  const safeRam = server.ram || '0GB / 4GB';
  const safeCpu = server.cpu || '0%';

  const playersArr = safePlayers.split('/');
  const playerPercent = playersArr.length === 2 ? (parseInt(playersArr[0]) / parseInt(playersArr[1])) * 100 : 0;

  const ramArr = safeRam.split('/');
  const ramPercent = ramArr.length === 2 ? (parseFloat(ramArr[0].replace('GB', '')) / parseFloat(ramArr[1].replace('GB', ''))) * 100 : 0;

  return (
    <div className={`server-card card ${isTransitioning ? 'starting-animation' : ''}`}>
      <div className="server-card-header">
        <div className="server-info">
          <div className={`status-indicator ${isOnline ? 'status-online' : isTransitioning ? 'status-warning' : 'status-offline'}`}>
            {isTransitioning && <RotateCcw size={10} className="spin" />}
          </div>
          <div>
            <h3 className="server-name">{server.name}</h3>
            <div className="server-ip">
              <span>{(() => {
                if (!server.ip) return 'Provisioning...';
                const host = server.hostname || server.ip;
                return server.port ? `${host}:${server.port}` : host;
              })()}</span>
              <button 
                className="btn-icon btn-ghost btn-xs copy-btn"
                onClick={() => {
                  if (!server.ip) return;
                  const host = server.hostname || server.ip;
                  const addr = server.port ? `${host}:${server.port}` : host;
                  navigator.clipboard.writeText(addr);
                  alert("Copied to clipboard!");
                }}
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="server-version badge badge-neutral">{server.node}</div>
          <div className="server-version badge badge-neutral">{server.versionType} {server.versionNumber}</div>
          {isOnline && <div className="server-version badge badge-success" style={{ backgroundColor: 'var(--success-color)', color: '#000', border: 'none' }}>Uptime: {server.uptime}</div>}
        </div>
      </div>

      <div className="server-metrics">
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label"><Users size={12} /> Players</span>
            <span className="metric-value">{safePlayers}</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${playerPercent}%` }}
            />
          </div>
        </div>
        
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label"><HardDrive size={12} /> RAM</span>
            <span className="metric-value">{safeRam}</span>
          </div>
          <div className="progress-bar">
            <div 
              className={`progress-fill ${ramPercent > 80 ? 'progress-fill-warning' : ''}`} 
              style={{ width: `${ramPercent}%` }}
            />
          </div>
        </div>
        
        <div className="metric">
          <div className="metric-header">
            <span className="metric-label"><Cpu size={12} /> CPU</span>
            <span className="metric-value">{safeCpu}</span>
          </div>
           <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: safeCpu === 'Active' ? '15%' : safeCpu, backgroundImage: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))' }}
            />
          </div>
        </div>
      </div>

      <div className="server-card-actions">
        <div className="action-group">
          <button 
             className={`btn ${isOnline ? 'btn-secondary' : 'btn-primary'} btn-sm flex-1`}
             disabled={isOnline || isTransitioning}
             onClick={() => toggleServerStatus(server.id, 'start')}
           >
            <Play size={14} />
            <span>Start</span>
          </button>
          <button 
            className="btn btn-secondary btn-sm flex-1" 
            disabled={!isOnline && !isTransitioning}
            onClick={() => toggleServerStatus(server.id, 'stop')}
          >
            <Square size={14} />
            <span>Stop</span>
          </button>
          <button 
            className="btn btn-secondary btn-sm flex-1" 
            disabled={!isOnline}
            onClick={() => toggleServerStatus(server.id, 'restart')}
          >
            <RotateCcw size={14} />
            <span>Restart</span>
          </button>
        </div>
        <Link to={`/server/${server.id}`} className="btn btn-secondary btn-sm manage-btn" style={{textDecoration: 'none', display: 'flex'}}>
          <span>Manage</span>
          <Settings size={14} />
        </Link>
      </div>
    </div>
  )
}
