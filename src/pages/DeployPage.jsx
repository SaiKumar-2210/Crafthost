import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { useApp } from '../context/AppContext'
import { 
  Globe2, Cpu, Server, ChevronRight, ChevronLeft, 
  MapPin, Sparkles, Shield, Zap, Check, Loader2
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

// Full region catalog with metadata
const ALL_REGIONS = [
  { value: 'eastus', label: 'East US', city: 'Virginia', country: '🇺🇸', group: 'Americas' },
  { value: 'eastus2', label: 'East US 2', city: 'Virginia', country: '🇺🇸', group: 'Americas' },
  { value: 'westus2', label: 'West US 2', city: 'Washington', country: '🇺🇸', group: 'Americas' },
  { value: 'westus3', label: 'West US 3', city: 'Arizona', country: '🇺🇸', group: 'Americas' },
  { value: 'centralus', label: 'Central US', city: 'Iowa', country: '🇺🇸', group: 'Americas' },
  { value: 'southcentralus', label: 'South Central US', city: 'Texas', country: '🇺🇸', group: 'Americas' },
  { value: 'northcentralus', label: 'North Central US', city: 'Illinois', country: '🇺🇸', group: 'Americas' },
  { value: 'westus', label: 'West US', city: 'California', country: '🇺🇸', group: 'Americas' },
  { value: 'canadacentral', label: 'Canada Central', city: 'Toronto', country: '🇨🇦', group: 'Americas' },
  { value: 'canadaeast', label: 'Canada East', city: 'Quebec', country: '🇨🇦', group: 'Americas' },
  { value: 'brazilsouth', label: 'Brazil South', city: 'São Paulo', country: '🇧🇷', group: 'Americas' },
  { value: 'brazilsoutheast', label: 'Brazil Southeast', city: 'Rio de Janeiro', country: '🇧🇷', group: 'Americas' },
  { value: 'chilecentral', label: 'Chile Central', city: 'Santiago', country: '🇨🇱', group: 'Americas' },
  { value: 'mexicocentral', label: 'Mexico Central', city: 'Mexico City', country: '🇲🇽', group: 'Americas' },
  { value: 'northeurope', label: 'North Europe', city: 'Dublin', country: '🇮🇪', group: 'Europe' },
  { value: 'westeurope', label: 'West Europe', city: 'Amsterdam', country: '🇳🇱', group: 'Europe' },
  { value: 'uksouth', label: 'UK South', city: 'London', country: '🇬🇧', group: 'Europe' },
  { value: 'ukwest', label: 'UK West', city: 'Cardiff', country: '🇬🇧', group: 'Europe' },
  { value: 'francecentral', label: 'France Central', city: 'Paris', country: '🇫🇷', group: 'Europe' },
  { value: 'francesouth', label: 'France South', city: 'Marseille', country: '🇫🇷', group: 'Europe' },
  { value: 'germanywestcentral', label: 'Germany West Central', city: 'Frankfurt', country: '🇩🇪', group: 'Europe' },
  { value: 'germanynorth', label: 'Germany North', city: 'Berlin', country: '🇩🇪', group: 'Europe' },
  { value: 'swedencentral', label: 'Sweden Central', city: 'Gävle', country: '🇸🇪', group: 'Europe' },
  { value: 'norwayeast', label: 'Norway East', city: 'Oslo', country: '🇳🇴', group: 'Europe' },
  { value: 'norwaywest', label: 'Norway West', city: 'Stavanger', country: '🇳🇴', group: 'Europe' },
  { value: 'switzerlandnorth', label: 'Switzerland North', city: 'Zurich', country: '🇨🇭', group: 'Europe' },
  { value: 'switzerlandwest', label: 'Switzerland West', city: 'Geneva', country: '🇨🇭', group: 'Europe' },
  { value: 'italynorth', label: 'Italy North', city: 'Milan', country: '🇮🇹', group: 'Europe' },
  { value: 'spaincentral', label: 'Spain Central', city: 'Madrid', country: '🇪🇸', group: 'Europe' },
  { value: 'polandcentral', label: 'Poland Central', city: 'Warsaw', country: '🇵🇱', group: 'Europe' },
  { value: 'austriaeast', label: 'Austria East', city: 'Vienna', country: '🇦🇹', group: 'Europe' },
  { value: 'belgiumcentral', label: 'Belgium Central', city: 'Brussels', country: '🇧🇪', group: 'Europe' },
  { value: 'denmarkeast', label: 'Denmark East', city: 'Copenhagen', country: '🇩🇰', group: 'Europe' },
  { value: 'southeastasia', label: 'Southeast Asia', city: 'Singapore', country: '🇸🇬', group: 'Asia Pacific' },
  { value: 'eastasia', label: 'East Asia', city: 'Hong Kong', country: '🇭🇰', group: 'Asia Pacific' },
  { value: 'japaneast', label: 'Japan East', city: 'Tokyo', country: '🇯🇵', group: 'Asia Pacific' },
  { value: 'japanwest', label: 'Japan West', city: 'Osaka', country: '🇯🇵', group: 'Asia Pacific' },
  { value: 'koreacentral', label: 'Korea Central', city: 'Seoul', country: '🇰🇷', group: 'Asia Pacific' },
  { value: 'koreasouth', label: 'Korea South', city: 'Busan', country: '🇰🇷', group: 'Asia Pacific' },
  { value: 'centralindia', label: 'Central India', city: 'Pune', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'westindia', label: 'West India', city: 'Mumbai', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'southindia', label: 'South India', city: 'Chennai', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'jioindiawest', label: 'Jio India West', city: 'Jamnagar', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'jioindiacentral', label: 'Jio India Central', city: 'Nagpur', country: '🇮🇳', group: 'Asia Pacific' },
  { value: 'australiaeast', label: 'Australia East', city: 'Sydney', country: '🇦🇺', group: 'Asia Pacific' },
  { value: 'australiasoutheast', label: 'Australia Southeast', city: 'Melbourne', country: '🇦🇺', group: 'Asia Pacific' },
  { value: 'australiacentral', label: 'Australia Central', city: 'Canberra', country: '🇦🇺', group: 'Asia Pacific' },
  { value: 'newzealandnorth', label: 'New Zealand North', city: 'Auckland', country: '🇳🇿', group: 'Asia Pacific' },
  { value: 'indonesiacentral', label: 'Indonesia Central', city: 'Jakarta', country: '🇮🇩', group: 'Asia Pacific' },
  { value: 'malaysiawest', label: 'Malaysia West', city: 'Kuala Lumpur', country: '🇲🇾', group: 'Asia Pacific' },
  { value: 'uaenorth', label: 'UAE North', city: 'Dubai', country: '🇦🇪', group: 'Middle East & Africa' },
  { value: 'uaecentral', label: 'UAE Central', city: 'Abu Dhabi', country: '🇦🇪', group: 'Middle East & Africa' },
  { value: 'israelcentral', label: 'Israel Central', city: 'Tel Aviv', country: '🇮🇱', group: 'Middle East & Africa' },
  { value: 'qatarcentral', label: 'Qatar Central', city: 'Doha', country: '🇶🇦', group: 'Middle East & Africa' },
  { value: 'southafricanorth', label: 'South Africa North', city: 'Johannesburg', country: '🇿🇦', group: 'Middle East & Africa' },
]

export default function DeployPage() {
  const navigate = useNavigate()
  const { deployServer, getAuthHeaders, API_BASE } = useApp()
  const [step, setStep] = useState(1)
  const [serverName, setServerName] = useState('')
  const [version, setVersion] = useState('1.21.11')
  const [azureLocation, setAzureLocation] = useState('eastus')
  const [isDeploying, setIsDeploying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [regions, setRegions] = useState([])
  const [regionsLoading, setRegionsLoading] = useState(true)

  // Fetch safe Azure regions from backend on mount
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await fetch(`${API_BASE}/system/azure-regions`, {
          headers: getAuthHeaders()
        })
        const data = await res.json()
        if (data.regions && data.regions.length > 0) {
          setRegions(data.regions)
          setAzureLocation(data.regions[0].value)
        } else {
          setRegions([])
        }
      } catch (err) {
        console.error('Failed to fetch Azure regions:', err)
        setRegions([])
      } finally {
        setRegionsLoading(false)
      }
    }
    fetchRegions()
  }, [API_BASE, getAuthHeaders])

  const selectedVersion = versions.find(v => v.id === version)
  const selectedRegion = regions.find(r => r.value === azureLocation)

  // Filter regions by search query
  const visibleRegions = regions.filter(r => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return r.label.toLowerCase().includes(q) || 
           r.city.toLowerCase().includes(q) ||
           r.country.includes(q)
  })

  // Group visible regions
  const regionGroups = ['Americas', 'Europe', 'Asia Pacific', 'Middle East & Africa']
    .map(group => ({
      group,
      items: visibleRegions.filter(r => r.group === group)
    }))
    .filter(g => g.items.length > 0)

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

                {regionsLoading ? (
                  <div className="regions-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Fetching available Azure regions for your subscription...</p>
                  </div>
                ) : (
                  <>
                    <div className="region-search">
                      <input
                        type="text"
                        placeholder="Search regions (e.g. 'Tokyo', 'Europe', 'US')..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="region-search-input"
                      />
                    </div>
                    {regionGroups.length === 0 ? (
                      <div className="regions-empty">
                        <p>No regions match your search. Try a different query.</p>
                      </div>
                    ) : (
                      <div className="region-groups">
                        {regionGroups.map(group => (
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
                    )}
                  </>
                )}
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
                  disabled={isDeploying || regionsLoading}
                >
                  {isDeploying ? (
                    <span className="deploying-spinner">Deploying to {selectedRegion?.label}...</span>
                  ) : (
                    <span><Shield size={18} /> Deploy Server</span>
                  )}
                </button>
              )}
            </div>
            
            {step === 3 && !regionsLoading && (
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
