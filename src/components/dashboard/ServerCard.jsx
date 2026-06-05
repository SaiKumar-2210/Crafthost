import { useState, useEffect } from 'react'
import { Play, Square, Settings, HardDrive, Users, Cpu, Copy, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ServerCard.css'

export default function ServerCard({ server }) {
  const { toggleServerStatus, getAuthHeaders, API_BASE } = useApp()
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

  const [liveStats, setLiveStats] = useState({ cpu: 0, ram: 0, players: server.players || '0/20' });

  useEffect(() => {
    if (!isOnline) return;
    
    let isMounted = true;
    const fetchLiveStats = async () => {
      try {
        const headers = getAuthHeaders();
        const [statsRes, playersRes] = await Promise.all([
          fetch(`${API_BASE}/servers/${server.id}/stats`, { headers }),
          fetch(`${API_BASE}/servers/${server.id}/players`, { headers })
        ]);
        
        if (!isMounted) return;
        
        let newStats = { ...liveStats };
        if (statsRes.ok) {
          const stats = await statsRes.json();
          newStats.cpu = stats.cpu || 0;
          newStats.ram = stats.ram || 0;
        }
        if (playersRes.ok) {
          const data = await playersRes.json();
          const pList = data.players || [];
          newStats.players = `${pList.length}/20`;
        }
        setLiveStats(newStats);
      } catch (e) {
        // ignore
      }
    };

    fetchLiveStats();
    const interval = setInterval(fetchLiveStats, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOnline, server.id, getAuthHeaders, API_BASE]);

  const safePlayers = isOnline ? liveStats.players : (server.players || '0/20');
  const safeRam = isOnline ? `${liveStats.ram.toFixed(1)}GB / 4.0GB` : (server.ram || '0GB / 4GB');
  const safeCpu = isOnline ? `${liveStats.cpu.toFixed(1)}%` : (server.cpu || '0%');

  const playersArr = safePlayers.split('/');
  const playerPercent = playersArr.length === 2 ? (parseInt(playersArr[0]) / parseInt(playersArr[1])) * 100 : 0;

  const ramPercent = isOnline ? (liveStats.ram / 4.0) * 100 : 0;
  const cpuPercent = isOnline ? liveStats.cpu : 0;

  return (
    <div className={`server-card card ${isTransitioning ? 'starting-animation' : ''} ${isOnline ? 'server-live' : ''}`}>
      <div className="server-card-header">
        <div className="server-info">
          <div className={`status-indicator ${isOnline ? 'status-online' : isTransitioning ? 'status-online' : 'status-offline'}`}>
            {isTransitioning && <RotateCcw size={10} className="spin" />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 className="server-name" style={{ margin: 0 }}>{server.name}</h3>
              <span className={`badge ${isOnline ? 'badge-success' : isTransitioning ? 'badge-success' : 'badge-neutral'}`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                {statusLabel}
              </span>
            </div>
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
            
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
              <div className="server-version badge badge-neutral">{server.node}</div>
              <div className="server-version badge badge-neutral">{server.versionType} {server.versionNumber}</div>
              {isOnline && <div className="server-version badge badge-success" style={{ backgroundColor: 'var(--status-online)', color: '#000', border: 'none' }}>Uptime: {server.uptime}</div>}
            </div>
          </div>
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
              style={{ width: `${Math.min(cpuPercent, 100)}%`, backgroundImage: 'linear-gradient(90deg, var(--accent-secondary), var(--accent-primary))' }}
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
