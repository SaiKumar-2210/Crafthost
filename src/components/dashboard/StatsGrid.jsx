import { Server } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import './StatsGrid.css'

export default function StatsGrid() {
  const { servers } = useApp()

  const stats = [
    {
      label: 'Total Servers',
      value: servers.length.toString(),
      change: 'Active in your network',
      trend: 'neutral',
      icon: Server,
      color: 'var(--accent-primary)'
    }
  ]

  return (
    <div className="stats-grid stagger-children" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
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
