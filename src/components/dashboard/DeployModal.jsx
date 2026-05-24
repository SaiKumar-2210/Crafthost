import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Server, Globe2, Cpu, Sparkles, Wifi } from 'lucide-react';
import './DeployModal.css';

export default function DeployModal({ onClose }) {
  const { deployServer } = useApp();
  const [name, setName] = useState('');
  const [region, setRegion] = useState('ap-south-1');
  const [version, setVersion] = useState('1.21.11');
  const [isDeploying, setIsDeploying] = useState(false);

  const regions = [
    { id: 'ap-south-1', name: 'Asia Pacific', desc: 'Mumbai', icon: '🇮🇳', latency: '15ms' },
    { id: 'ap-southeast-1', name: 'Southeast Asia', desc: 'Singapore', icon: '🇸🇬', latency: '45ms' },
    { id: 'ap-northeast-1', name: 'Asia Northeast', desc: 'Tokyo', icon: '🇯🇵', latency: '70ms' },
    { id: 'us-east-1', name: 'US East', desc: 'N. Virginia', icon: '🇺🇸', latency: '85ms' },
    { id: 'us-west-2', name: 'US West', desc: 'Oregon', icon: '🇺🇸', latency: '120ms' },
    { id: 'eu-central-1', name: 'Europe Central', desc: 'Frankfurt', icon: '🇩🇪', latency: '140ms' },
    { id: 'eu-west-1', name: 'Europe West', desc: 'Ireland', icon: '🇮🇪', latency: '160ms' },
    { id: 'au-southeast-2', name: 'Australia', desc: 'Sydney', icon: '🇦🇺', latency: '90ms' },
    { id: 'sa-east-1', name: 'South America', desc: 'São Paulo', icon: '🇧🇷', latency: '180ms' }
  ];

  const versions = [
    { id: '1.21.11', title: 'Paper 1.21.11', desc: 'Latest Version • Optimized Performance', recommended: true, badge: 'Recommended' },
    { id: '1.20.4', title: 'Paper 1.20.4', desc: 'Highly Stable • Great Mod Compatibility', recommended: false, badge: 'Stable' },
    { id: '1.16.5', title: 'Paper 1.16.5', desc: 'Legacy Classic • For Custom Plugins', recommended: false, badge: 'Legacy' }
  ];

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      await deployServer(name || 'CraftHost SMP Server', version, region);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeploying(false);
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content deploy-modal select-screen-modal">
        <button className="modal-close" onClick={onClose}><X size={20} /></button>
        
        <div className="modal-header">
          <div className="modal-icon-wrapper"><Globe2 size={24} /></div>
          <h2 className="text-gradient">Deploy Global Server</h2>
          <p>Instantly provision a high-performance, auto-scaling Minecraft node in seconds.</p>
        </div>

        <div className="modal-body select-screen-body">
          <div className="form-group select-screen-group">
            <label className="section-label">Server Name</label>
            <input 
              type="text" 
              placeholder="e.g., CraftHost Ultra SMP" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="modal-input select-screen-input"
            />
          </div>

          <div className="form-group select-screen-group">
            <label className="section-label">1. Choose Server Software</label>
            <div className="version-grid">
              {versions.map(v => (
                <div 
                  key={v.id}
                  className={`version-card ${version === v.id ? 'active' : ''} ${v.recommended ? 'recommended-border' : ''}`}
                  onClick={() => setVersion(v.id)}
                >
                  <div className="version-card-header">
                    <span className="version-tag">{v.badge}</span>
                    {v.recommended && <Sparkles size={14} className="sparkle-icon" />}
                  </div>
                  <h4>{v.title}</h4>
                  <p>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group select-screen-group">
            <label className="section-label">2. Select Deployment Location</label>
            <div className="region-grid-3x3">
              {regions.map(r => (
                <div 
                  key={r.id} 
                  className={`region-card-3x3 ${region === r.id ? 'active' : ''}`}
                  onClick={() => setRegion(r.id)}
                >
                  <div className="region-icon-flag">{r.icon}</div>
                  <div className="region-details">
                    <h4>{r.name}</h4>
                    <span>{r.desc}</span>
                  </div>
                  <div className="region-latency-pill">
                    <Wifi size={10} className="wifi-icon" />
                    <span>{r.latency}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer select-screen-footer">
          <div className="node-specs">
            <Cpu size={16} className="cpu-icon" /> 
            <span>Azure D2s v5 (8GB RAM) • Premium NVMe Nodes</span>
          </div>
          <button 
            className="btn btn-primary deploy-btn" 
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? (
              <span className="deploy-loader">
                <RotateCcwLoader /> Provisioning...
              </span>
            ) : (
              <span>Deploy Instance</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RotateCcwLoader() {
  return (
    <svg className="spin-loader" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: '14px', height: '14px', marginRight: '6px', display: 'inline-block', verticalAlign: 'middle', animation: 'spin 1s linear infinite' }}>
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}
