import { Server, Users, Cpu, Clock } from 'lucide-react'
import './StatsGrid.css'

const stats = [
  {
    label: 'Total Servers',
    value: '3',
    change: '+1 this week',
    trend: 'up',
    icon: Server,
    color: 'var(--accent-primary)'
  },
  {
    label: 'Total Players',
    value: '54',
    change: 'Peak: 142 today',
    trend: 'neutral',
    icon: Users,
    color: 'var(--accent-secondary)'
  },
  {
    label: 'Avg RAM Usage',
    value: '68%',
    change: 'Stable',
    trend: 'neutral',
    icon: Cpu,
    color: 'hsl(270, 70%, 60%)'
  },
  {
    label: 'Network Uptime',
    value: '99.99%',
    change: '100% last 30d',
    trend: 'up',
    icon: Clock,
    color: 'hsl(142, 70%, 45%)'
  }
]

export default function StatsGrid() {
  return (
    <div className="stats-grid stagger-children">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <div className="stat-card card card-interactive" key={index}>
            <div className="stat-header">
              <span className="stat-label">{stat.label}</span>
              <div className="stat-icon-wrap" style={{ color: stat.color, backgroundColor: `color-mix(in srgb, ${stat.color} 15%, transparent)` }}>
                <Icon size={18} />
              </div>
            </div>
            <div className="stat-body">
              <span className="stat-value">{stat.value}</span>
              <span className={`stat-change trend-${stat.trend}`}>{stat.change}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
