import { Play, Square, Settings, HardDrive, TerminalSquare, RotateCcw } from 'lucide-react'
import './ActivityFeed.css'

const activities = [
  {
    id: 1,
    type: 'server_start',
    server: 'PixelRealms SMP',
    user: 'You',
    time: '2 mins ago',
    icon: Play,
    color: 'var(--status-online)',
    details: 'Server fully booted (took 18.2s)'
  },
  {
    id: 2,
    type: 'console_command',
    server: 'PixelRealms SMP',
    user: 'System',
    time: '5 mins ago',
    icon: TerminalSquare,
    color: 'var(--accent-secondary)',
    details: 'Executed scheduled: /save-all'
  },
  {
    id: 3,
    type: 'backup',
    server: 'Modded Hub',
    user: 'Auto Backup',
    time: '1 hour ago',
    icon: HardDrive,
    color: 'hsl(270, 70%, 60%)',
    details: 'Snapshot created: backup_140526_1100.tar.gz'
  },
  {
    id: 4,
    type: 'server_stop',
    server: 'Event Server',
    user: 'johndoe_admin',
    time: '3 hours ago',
    icon: Square,
    color: 'var(--text-tertiary)',
    details: 'Server gracefully stopped'
  },
  {
    id: 5,
    type: 'settings',
    server: 'Modded Hub',
    user: 'You',
    time: 'Yesterday',
    icon: Settings,
    color: 'var(--accent-primary)',
    details: 'Modified server.properties (max-players: 20)'
  },
  {
    id: 6,
    type: 'server_restart',
    server: 'PixelRealms SMP',
    user: 'You',
    time: 'Yesterday',
    icon: RotateCcw,
    color: 'var(--status-warning)',
    details: 'Manual restart initiated'
  }
]

export default function ActivityFeed() {
  return (
    <div className="activity-feed-section">
      <div className="section-header-compact">
        <h2 className="section-title-sm">Recent Activity</h2>
      </div>
      
      <div className="activity-card card">
        <div className="timeline">
          {activities.map((activity, index) => {
            const Icon = activity.icon;
            return (
              <div className="timeline-item" key={activity.id}>
                {/* Connector line */}
                {index !== activities.length - 1 && <div className="timeline-connector"></div>}
                
                {/* Icon node */}
                <div 
                  className="timeline-icon" 
                  style={{ 
                    color: activity.color, 
                    backgroundColor: `color-mix(in srgb, ${activity.color} 15%, transparent)`,
                    borderColor: `color-mix(in srgb, ${activity.color} 30%, transparent)`
                  }}
                >
                  <Icon size={14} />
                </div>
                
                {/* Content */}
                <div className="timeline-content">
                  <div className="timeline-header">
                    <p className="timeline-title">
                      <span className="user-emphasized">{activity.user}</span> 
                      {' performed '}<span className="action-type">{activity.type.replace('_', ' ')}</span>
                      {' on '} <span className="server-emphasized">{activity.server}</span>
                    </p>
                    <span className="timeline-time">{activity.time}</span>
                  </div>
                  <p className="timeline-details">{activity.details}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
