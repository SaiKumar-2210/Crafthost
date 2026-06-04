import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Cpu, HardDrive } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import './ResourceCharts.css'

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

export default function ResourceCharts({ server, visible = false }) {
  const { getAuthHeaders, API_BASE } = useApp();
  const [data, setData] = useState(Array.from({ length: 20 }, (_, i) => ({ time: `-${20 - i}s`, cpu: 0, ram: 0 })));
  const [currentCpu, setCurrentCpu] = useState(0);
  const [currentRam, setCurrentRam] = useState(0);

  useEffect(() => {
    let isInitialFetch = true;
    if (!visible) return;
    if (server.status !== 'online' && server.status !== 'starting') return;

    const fetchStats = async () => {
      try {
        if (isInitialFetch) {
          const histRes = await fetch(`${API_BASE}/servers/${server.id}/stats-history`, { headers: getAuthHeaders() });
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData.history && histData.history.length > 0) {
              const formattedHistory = histData.history.map((h, i) => ({
                time: `-${(histData.history.length - 1 - i) * 2}s`,
                cpu: h.cpu,
                ram: h.ram
              }));
              let nextData = [...formattedHistory];
              while (nextData.length < 20) {
                nextData.unshift({ time: `-${nextData.length * 2}s`, cpu: 0, ram: 0 });
              }
              if (nextData.length > 20) {
                nextData = nextData.slice(nextData.length - 20);
              }
              setData(nextData);
              const latest = histData.history[histData.history.length - 1];
              setCurrentCpu(latest.cpu || 0);
              setCurrentRam(latest.ram || 0);
            }
          }
          isInitialFetch = false;
        }

        const res = await fetch(`${API_BASE}/servers/${server.id}/stats`, { headers: getAuthHeaders() });
        if (res.ok) {
          const stats = await res.json();
          setCurrentCpu(stats.cpu || 0);
          setCurrentRam(stats.ram || 0);
          setData(prev => {
            const next = [...prev.slice(1), { 
              time: 'Now', 
              cpu: stats.cpu || 0, 
              ram: stats.ram || 0 
            }];
            return next.map((d, i) => ({ ...d, time: `-${(19 - i) * 2}s` }));
          });
        }
      } catch {
        // ignore
      }
    };

    fetchStats();

    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, server.status, visible]);

  return (
    <div className="resource-charts">
      <div className="chart-card card">
        <div className="chart-header">
          <div className="chart-title">
            <Cpu size={16} className="text-secondary" />
            <h3>CPU Usage</h3>
          </div>
          <span className="chart-current">{currentCpu.toFixed(1)}%</span>
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
          <span className="chart-current">{currentRam.toFixed(2)} GB</span>
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
              <YAxis domain={[0, 'auto']} stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
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
