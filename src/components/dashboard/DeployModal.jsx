import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { X, Server, Globe2, Cpu, Sparkles, Wifi, MapPin, ChevronDown } from 'lucide-react';
import './DeployModal.css';

export default function DeployModal({ onClose }) {
  const { deployServer } = useApp();
  const [name, setName] = useState('');
  const [azureLocation, setAzureLocation] = useState('eastus');
  const [version, setVersion] = useState('1.21.11');
  const [isDeploying, setIsDeploying] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  const regions = [
    {
      group: 'Americas',
      items: [
        { value: 'eastus', label: 'East US', city: 'Virginia', country: '🇺🇸' },
        { value: 'eastus2', label: 'East US 2', city: 'Virginia', country: '🇺🇸' },
        { value: 'westus2', label: 'West US 2', city: 'Washington', country: '🇺🇸' },
        { value: 'westus3', label: 'West US 3', city: 'Arizona', country: '🇺🇸' },
        { value: 'centralus', label: 'Central US', city: 'Iowa', country: '🇺🇸' },
        { value: 'southcentralus', label: 'South Central US', city: 'Texas', country: '🇺🇸' },
        { value: 'northcentralus', label: 'North Central US', city: 'Illinois', country: '🇺🇸' },
        { value: 'westus', label: 'West US', city: 'California', country: '🇺🇸' },
        { value: 'canadacentral', label: 'Canada Central', city: 'Toronto', country: '🇨🇦' },
        { value: 'canadaeast', label: 'Canada East', city: 'Quebec', country: '🇨🇦' },
        { value: 'brazilsouth', label: 'Brazil South', city: 'São Paulo', country: '🇧🇷' },
        { value: 'brazilsoutheast', label: 'Brazil Southeast', city: 'Rio de Janeiro', country: '🇧🇷' },
        { value: 'chilecentral', label: 'Chile Central', city: 'Santiago', country: '🇨🇱' },
        { value: 'mexicocentral', label: 'Mexico Central', city: 'Mexico City', country: '🇲🇽' },
      ]
    },
    {
      group: 'Europe',
      items: [
        { value: 'northeurope', label: 'North Europe', city: 'Dublin', country: '🇮🇪' },
        { value: 'westeurope', label: 'West Europe', city: 'Amsterdam', country: '🇳🇱' },
        { value: 'uksouth', label: 'UK South', city: 'London', country: '🇬🇧' },
        { value: 'ukwest', label: 'UK West', city: 'Cardiff', country: '🇬🇧' },
        { value: 'francecentral', label: 'France Central', city: 'Paris', country: '🇫🇷' },
        { value: 'germanywestcentral', label: 'Germany West Central', city: 'Frankfurt', country: '🇩🇪' },
        { value: 'germanynorth', label: 'Germany North', city: 'Berlin', country: '🇩🇪' },
        { value: 'swedencentral', label: 'Sweden Central', city: 'Gävle', country: '🇸🇪' },
        { value: 'norwayeast', label: 'Norway East', city: 'Oslo', country: '🇳🇴' },
        { value: 'switzerlandnorth', label: 'Switzerland North', city: 'Zurich', country: '🇨🇭' },
        { value: 'italynorth', label: 'Italy North', city: 'Milan', country: '🇮🇹' },
        { value: 'spaincentral', label: 'Spain Central', city: 'Madrid', country: '🇪🇸' },
        { value: 'polandcentral', label: 'Poland Central', city: 'Warsaw', country: '🇵🇱' },
        { value: 'austriaeast', label: 'Austria East', city: 'Vienna', country: '🇦🇹' },
        { value: 'belgiumcentral', label: 'Belgium Central', city: 'Brussels', country: '🇧🇪' },
        { value: 'denmarkeast', label: 'Denmark East', city: 'Copenhagen', country: '🇩🇰' },
      ]
    },
    {
      group: 'Asia Pacific',
      items: [
        { value: 'southeastasia', label: 'Southeast Asia', city: 'Singapore', country: '🇸🇬' },
        { value: 'eastasia', label: 'East Asia', city: 'Hong Kong', country: '🇭🇰' },
        { value: 'japaneast', label: 'Japan East', city: 'Tokyo', country: '🇯🇵' },
        { value: 'japanwest', label: 'Japan West', city: 'Osaka', country: '🇯🇵' },
        { value: 'koreacentral', label: 'Korea Central', city: 'Seoul', country: '🇰🇷' },
        { value: 'koreasouth', label: 'Korea South', city: 'Busan', country: '🇰🇷' },
        { value: 'centralindia', label: 'Central India', city: 'Pune', country: '🇮🇳' },
        { value: 'westindia', label: 'West India', city: 'Mumbai', country: '🇮🇳' },
        { value: 'southindia', label: 'South India', city: 'Chennai', country: '🇮🇳' },
        { value: 'australiaeast', label: 'Australia East', city: 'Sydney', country: '🇦🇺' },
        { value: 'australiasoutheast', label: 'Australia Southeast', city: 'Melbourne', country: '🇦🇺' },
        { value: 'newzealandnorth', label: 'New Zealand North', city: 'Auckland', country: '🇳🇿' },
        { value: 'indonesiacentral', label: 'Indonesia Central', city: 'Jakarta', country: '🇮🇩' },
        { value: 'malaysiawest', label: 'Malaysia West', city: 'Kuala Lumpur', country: '🇲🇾' },
      ]
    },
    {
      group: 'Middle East & Africa',
      items: [
        { value: 'uaenorth', label: 'UAE North', city: 'Dubai', country: '🇦🇪' },
        { value: 'israelcentral', label: 'Israel Central', city: 'Tel Aviv', country: '🇮🇱' },
        { value: 'qatarcentral', label: 'Qatar Central', city: 'Doha', country: '🇶🇦' },
        { value: 'southafricanorth', label: 'South Africa North', city: 'Johannesburg', country: '🇿🇦' },
        { value: 'southafricawest', label: 'South Africa West', city: 'Cape Town', country: '🇿🇦' },
      ]
    }
  ];

  const versions = [
    { id: '1.21.11', title: 'Paper 1.21.11', desc: 'Latest Version • Optimized Performance', recommended: true, badge: 'Recommended' },
    { id: '1.20.4', title: 'Paper 1.20.4', desc: 'Highly Stable • Great Mod Compatibility', recommended: false, badge: 'Stable' },
    { id: '1.16.5', title: 'Paper 1.16.5', desc: 'Legacy Classic • For Custom Plugins', recommended: false, badge: 'Legacy' }
  ];

  const selectedRegion = regions.flatMap(g => g.items).find(r => r.value === azureLocation);

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      await deployServer(name || 'CraftHost SMP Server', version, azureLocation);
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
          <p>Choose any Azure region worldwide. Your VM will be provisioned exactly where you select.</p>
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
            <label className="section-label">2. Select Azure Region</label>
            
            <div className="location-dropdown">
              <button 
                className="location-dropdown-trigger"
                onClick={() => setShowLocationDropdown(!showLocationDropdown)}
              >
                <div className="location-selected">
                  <span className="location-flag">{selectedRegion?.country}</span>
                  <div className="location-info">
                    <span className="location-name">{selectedRegion?.label}</span>
                    <span className="location-city"><MapPin size={10} /> {selectedRegion?.city}</span>
                  </div>
                </div>
                <ChevronDown size={16} className={`dropdown-chevron ${showLocationDropdown ? 'open' : ''}`} />
              </button>

              {showLocationDropdown && (
                <div className="location-dropdown-menu">
                  {regions.map(group => (
                    <div key={group.group} className="location-group">
                      <div className="location-group-header">{group.group}</div>
                      {group.items.map(r => (
                        <div
                          key={r.value}
                          className={`location-option ${azureLocation === r.value ? 'active' : ''}`}
                          onClick={() => {
                            setAzureLocation(r.value);
                            setShowLocationDropdown(false);
                          }}
                        >
                          <span className="location-flag">{r.country}</span>
                          <div className="location-info">
                            <span className="location-name">{r.label}</span>
                            <span className="location-city">{r.city}</span>
                          </div>
                          {azureLocation === r.value && <div className="location-check">✓</div>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer select-screen-footer">
          <div className="node-specs">
            <Cpu size={16} className="cpu-icon" /> 
            <span>Azure Standard_B2s (2 vCPU, 4GB RAM) • Ubuntu 22.04 • Auto-provisioned</span>
          </div>
          <button 
            className="btn btn-primary deploy-btn" 
            onClick={handleDeploy}
            disabled={isDeploying}
          >
            {isDeploying ? (
              <span className="deploy-loader">
                <RotateCcwLoader /> Provisioning in {selectedRegion?.label}...
              </span>
            ) : (
              <span>Deploy to {selectedRegion?.label}</span>
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
