import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Cpu, HardDrive } from 'lucide-react'
import './ResourceCharts.css'

const generateData = () => {
  const data = []
  let ram = 4.2
  let cpu = 45
  for (let i = 20; i >= 0; i--) {
    data.push({
      time: `-${i}m`,
      ram: Math.max(1, Math.min(6, ram + (Math.random() - 0.5) * 0.5)),
      cpu: Math.max(5, Math.min(100, cpu + (Math.random() - 0.5) * 15))
    })
  }
  return data
}

const data = generateData()

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="chart-tooltip card-glass">
        <p className="tooltip-time">{label}</p>
        <p className="tooltip-value" style={{ color: payload[0].color }}>
          {payload[0].name}: {payload[0].value.toFixed(1)} {payload[0].name === 'RAM' ? 'GB' : '%'}
        </p>
      </div>
    )
  }
  return null
}

export default function ResourceCharts({ server }) {
  return (
    <div className="resource-charts">
      <div className="chart-card card">
        <div className="chart-header">
          <div className="chart-title">
            <Cpu size={16} className="text-secondary" />
            <h3>CPU Usage</h3>
          </div>
          <span className="chart-current">{server.cpu}</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-secondary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent-secondary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="cpu" 
                name="CPU"
                stroke="var(--accent-secondary)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorCpu)" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card card">
        <div className="chart-header">
          <div className="chart-title">
            <HardDrive size={16} className="text-secondary" />
            <h3>RAM Usage</h3>
          </div>
          <span className="chart-current">{server.ram.split(' ')[0]}</span>
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 6]} stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="ram" 
                name="RAM"
                stroke="var(--accent-primary)" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRam)" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
