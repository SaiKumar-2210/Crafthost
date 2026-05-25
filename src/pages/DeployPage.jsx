import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { useApp } from '../context/AppContext'
import { 
  Globe2, Cpu, Server, ChevronRight, ChevronLeft, 
  MapPin, Sparkles, Shield, HardDrive, Zap, Check
} from 'lucide-react'
import './DeployPage.css'

const versions = [
  { 
    id: '1.21.11', 
    title: 'Paper 1.21.11', 
    desc: 'Latest stable release with optimal performance and full plugin compatibility.',
    badge: 'Recommended',
    recommended: true,
    features: ['Best Performance', 'Latest Features', 'Active Support']
  },
  { 
    id: '1.20.4', 
    title: 'Paper 1.20.4', 
    desc: 'Proven stability with extensive mod and plugin ecosystem support.',
    badge: 'Stable',
    recommended: false,
    features: ['Highly Stable', 'Wide Mod Support', 'Battle-Tested']
  },
  { 
    id: '1.16.5', 
    title: 'Paper 1.16.5', 
    desc: 'Legacy version for older custom plugins and classic gameplay.',
    badge: 'Legacy',
    recommended: false,
    features: ['Classic Plugins', 'Nostalgia', 'Lightweight']
  }
]

const regionGroups = [
  {
    group: 'Americas',
    items: [
      { value: 'eastus', label: 'East US', city: 'Virginia', country: '🇺🇸', flag: 'us' },
      { value: 'eastus2', label: 'East US 2', city: 'Virginia', country: '🇺🇸', flag: 'us' },
      { value: 'westus2', label: 'West US 2', city: 'Washington', country: '🇺🇸', flag: 'us' },
      { value: 'westus3', label: 'West US 3', city: 'Arizona', country: '🇺🇸', flag: 'us' },
      { value: 'centralus', label: 'Central US', city: 'Iowa', country: '🇺🇸', flag: 'us' },
      { value: 'southcentralus', label: 'South Central US', city: 'Texas', country: '🇺🇸', flag: 'us' },
      { value: 'canadacentral', label: 'Canada Central', city: 'Toronto', country: '🇨🇦', flag: 'ca' },
      { value: 'brazilsouth', label: 'Brazil South', city: 'São Paulo', country: '🇧🇷', flag: 'br' },
      { value: 'mexicocentral', label: 'Mexico Central', city: 'Mexico City', country: '🇲🇽', flag: 'mx' },
      { value: 'chilecentral', label: 'Chile Central', city: 'Santiago', country: '🇨🇱', flag: 'cl' },
    ]
  },
  {
    group: 'Europe',
    items: [
      { value: 'northeurope', label: 'North Europe', city: 'Dublin', country: '🇮🇪', flag: 'ie' },
      { value: 'westeurope', label: 'West Europe', city: 'Amsterdam', country: '🇳🇱', flag: 'nl' },
      { value: 'uksouth', label: 'UK South', city: 'London', country: '🇬🇧', flag: 'gb' },
      { value: 'francecentral', label: 'France Central', city: 'Paris', country: '🇫🇷', flag: 'fr' },
      { value: 'germanywestcentral', label: 'Germany West Central', city: 'Frankfurt', country: '🇩🇪', flag: 'de' },
      { value: 'swedencentral', label: 'Sweden Central', city: 'Gävle', country: '🇸🇪', flag: 'se' },
      { value: 'norwayeast', label: 'Norway East', city: 'Oslo', country: '🇳🇴', flag: 'no' },
      { value: 'switzerlandnorth', label: 'Switzerland North', city: 'Zurich', country: '🇨🇭', flag: 'ch' },
      { value: 'italynorth', label: 'Italy North', city: 'Milan', country: '🇮🇹', flag: 'it' },
      { value: 'spaincentral', label: 'Spain Central', city: 'Madrid', country: '🇪🇸', flag: 'es' },
      { value: 'polandcentral', label: 'Poland Central', city: 'Warsaw', country: '🇵🇱', flag: 'pl' },
      { value: 'austriaeast', label: 'Austria East', city: 'Vienna', country: '🇦🇹', flag: 'at' },
    ]
  },
  {
    group: 'Asia Pacific',
    items: [
      { value: 'southeastasia', label: 'Southeast Asia', city: 'Singapore', country: '🇸🇬', flag: 'sg' },
      { value: 'eastasia', label: 'East Asia', city: 'Hong Kong', country: '🇭🇰', flag: 'hk' },
      { value: 'japaneast', label: 'Japan East', city: 'Tokyo', country: '🇯🇵', flag: 'jp' },
      { value: 'japanwest', label: 'Japan West', city: 'Osaka', country: '🇯🇵', flag: 'jp' },
      { value: 'koreacentral', label: 'Korea Central', city: 'Seoul', country: '🇰🇷', flag: 'kr' },
      { value: 'centralindia', label: 'Central India', city: 'Pune', country: '🇮🇳', flag: 'in' },
      { value: 'westindia', label: 'West India', city: 'Mumbai', country: '🇮🇳', flag: 'in' },
      { value: 'southindia', label: 'South India', city: 'Chennai', country: '🇮🇳', flag: 'in' },
      { value: 'australiaeast', label: 'Australia East', city: 'Sydney', country: '🇦🇺', flag: 'au' },
      { value: 'australiasoutheast', label: 'Australia Southeast', city: 'Melbourne', country: '🇦🇺', flag: 'au' },
      { value: 'newzealandnorth', label: 'New Zealand North', city: 'Auckland', country: '🇳🇿', flag: 'nz' },
      { value: 'indonesiacentral', label: 'Indonesia Central', city: 'Jakarta', country: '🇮🇩', flag: 'id' },
      { value: 'malaysiawest', label: 'Malaysia West', city: 'Kuala Lumpur', country: '🇲🇾', flag: 'my' },
    ]
  },
  {
    group: 'Middle East & Africa',
    items: [
      { value: 'uaenorth', label: 'UAE North', city: 'Dubai', country: '🇦🇪', flag: 'ae' },
      { value: 'israelcentral', label: 'Israel Central', city: 'Tel Aviv', country: '🇮🇱', flag: 'il' },
      { value: 'qatarcentral', label: 'Qatar Central', city: 'Doha', country: '🇶🇦', flag: 'qa' },
      { value: 'southafricanorth', label: 'South Africa North', city: 'Johannesburg', country: '🇿🇦', flag: 'za' },
    ]
  }
]

export default function DeployPage() {
  const navigate = useNavigate()
  const { deployServer } = useApp()
  const [step, setStep] = useState(1)
  const [serverName, setServerName] = useState('')
  const [version, setVersion] = useState('1.21.11')
  const [azureLocation, setAzureLocation] = useState('eastus')
  const [isDeploying, setIsDeploying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const selectedVersion = versions.find(v => v.id === version)
  const selectedRegion = regionGroups.flatMap(g => g.items).find(r => r.value === azureLocation)

  const filteredGroups = searchQuery 
    ? regionGroups.map(g => ({
        ...g,
        items: g.items.filter(r => 
          r.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.country.includes(searchQuery)
        )
      })).filter(g => g.items.length > 0)
    : regionGroups

  const handleDeploy = async () => {
    setIsDeploying(true)
    try {
      await deployServer(serverName || 'CraftHost SMP Server', version, azureLocation)
      navigate('/dashboard')
    } catch (e) {
      console.error(e)
      setIsDeploying(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return serverName.trim().length > 0
    if (step === 2) return true
    if (step === 3) return true
    return false
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-main deploy-page">
        <div className="deploy-wizard">
          {/* Wizard Header */}
          <div className="wizard-header">
            <div className="wizard-progress">
              <div className={`wizard-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                <div className="step-number">{step > 1 ? <Check size={14} /> : '1'}</div>
                <span>Name</span>
              </div>
              <div className={`wizard-connector ${step >= 2 ? 'active' : ''}`} />
              <div className={`wizard-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                <div className="step-number">{step > 2 ? <Check size={14} /> : '2'}</div>
                <span>Version</span>
              </div>
              <div className={`wizard-connector ${step >= 3 ? 'active' : ''}`} />
              <div className={`wizard-step ${step >= 3 ? 'active' : ''}`}>
                <div className="step-number">3</div>
                <span>Region</span>
              </div>
            </div>
          </div>

          {/* Wizard Body */}
          <div className="wizard-body">
            {/* Step 1: Server Name */}
            {step === 1 && (
              <div className="wizard-step-content fade-in">
                <div className="step-hero">
                  <div className="step-icon"><Server size={32} /></div>
                  <h1>Name Your Server</h1>
                  <p>Give your Minecraft world a memorable identity.</p>
                </div>
                <div className="name-input-wrapper">
                  <input
                    type="text"
                    placeholder="e.g., CraftHost Ultra SMP, SkyBlock Legends, Pixelmon World..."
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="deploy-name-input"
                    maxLength={40}
                    autoFocus
                  />
                  <div className="name-hint">{serverName.length}/40 characters</div>
                </div>
              </div>
            )}

            {/* Step 2: Version */}
            {step === 2 && (
              <div className="wizard-step-content fade-in">
                <div className="step-hero">
                  <div className="step-icon"><Cpu size={32} /></div>
                  <h1>Choose Server Software</h1>
                  <p>Select the Minecraft version that fits your gameplay.</p>
                </div>
                <div className="version-cards">
                  {versions.map(v => (
                    <div
                      key={v.id}
                      className={`version-card-large ${version === v.id ? 'active' : ''} ${v.recommended ? 'recommended' : ''}`}
                      onClick={() => setVersion(v.id)}
                    >
                      {v.recommended && (
                        <div className="recommended-ribbon">
                          <Sparkles size={12} /> Recommended
                        </div>
                      )}
                      <div className="version-header">
                        <h3>{v.title}</h3>
                        <span className={`version-badge ${v.badge.toLowerCase()}`}>{v.badge}</span>
                      </div>
                      <p className="version-desc">{v.desc}</p>
                      <div className="version-features">
                        {v.features.map((f, i) => (
                          <span key={i} className="feature-tag"><Zap size={12} /> {f}</span>
                        ))}
                      </div>
                      {version === v.id && (
                        <div className="version-selected-check"><Check size={20} /></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Region */}
            {step === 3 && (
              <div className="wizard-step-content fade-in">
                <div className="step-hero">
                  <div className="step-icon"><Globe2 size={32} /></div>
                  <h1>Select Azure Region</h1>
                  <p>Deploy your VM exactly where your players are located.</p>
                </div>
                <div className="region-search">
                  <input
                    type="text"
                    placeholder="Search regions (e.g. 'Tokyo', 'Europe', 'US')..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="region-search-input"
                  />
                </div>
                <div className="region-groups">
                  {filteredGroups.map(group => (
                    <div key={group.group} className="region-group">
                      <h4 className="region-group-title">{group.group}</h4>
                      <div className="region-grid">
                        {group.items.map(r => (
                          <div
                            key={r.value}
                            className={`region-card ${azureLocation === r.value ? 'active' : ''}`}
                            onClick={() => setAzureLocation(r.value)}
                          >
                            <div className="region-flag">{r.country}</div>
                            <div className="region-info">
                              <div className="region-label">{r.label}</div>
                              <div className="region-city"><MapPin size={10} /> {r.city}</div>
                            </div>
                            {azureLocation === r.value && (
                              <div className="region-check"><Check size={16} /></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer */}
          <div className="wizard-footer">
            <div className="wizard-nav">
              {step > 1 && (
                <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                  <ChevronLeft size={16} /> Back
                </button>
              )}
              {step < 3 ? (
                <button 
                  className="btn btn-primary" 
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                >
                  Next <ChevronRight size={16} />
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-large" 
                  onClick={handleDeploy}
                  disabled={isDeploying}
                >
                  {isDeploying ? (
                    <span className="deploying-spinner">Deploying to {selectedRegion?.label}...</span>
                  ) : (
                    <span><Shield size={18} /> Deploy Server</span>
                  )}
                </button>
              )}
            </div>
            
            {step === 3 && (
              <div className="deploy-summary">
                <div className="summary-item">
                  <Server size={14} /> {serverName || 'CraftHost SMP Server'}
                </div>
                <div className="summary-item">
                  <Cpu size={14} /> {selectedVersion?.title}
                </div>
                <div className="summary-item">
                  <Globe2 size={14} /> {selectedRegion?.label}, {selectedRegion?.city}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
