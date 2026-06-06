import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import { useApp } from '../context/AppContext'
import { 
  Globe2, Cpu, Server, ChevronRight, ChevronLeft, 
  MapPin, Sparkles, Shield, Zap, Check, Loader2, AlertCircle
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

export default function DeployPage() {
  const navigate = useNavigate()
  const { deployServer, getJobStatus, getAuthHeaders, API_BASE } = useApp()
  const [step, setStep] = useState(1)
  const [serverName, setServerName] = useState('')
  const [version, setVersion] = useState('1.21.11')
  const [azureLocation, setAzureLocation] = useState('')
  const [isDeploying, setIsDeploying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [regions, setRegions] = useState([])
  const [regionsLoading, setRegionsLoading] = useState(true)

  // Progress tracking states
  const [deployJobId, setDeployJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)

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
          setAzureLocation(prev => prev || data.regions[0].value)
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

  // Polling for job status
  useEffect(() => {
    let interval;
    if (step === 4 && deployJobId) {
      interval = setInterval(async () => {
        const status = await getJobStatus(deployJobId)
        if (status) {
          setJobStatus(status)
          if (status.status === 'completed' || status.status === 'failed') {
            clearInterval(interval)
          }
        }
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [step, deployJobId, getJobStatus])

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
      const res = await deployServer(serverName || 'CraftHost SMP Server', version, azureLocation)
      if (res.error) {
        alert(res.error)
        setIsDeploying(false)
        return
      }
      
      if (res.jobId) {
        setDeployJobId(res.jobId)
        setStep(4) // Move to progress screen
      } else {
        navigate('/dashboard')
      }
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

  const getTimelineIcon = (stage, currentStatus) => {
    const stages = ['queued', 'provisioning_vm', 'starting_vm', 'deploying_server', 'completed'];
    const currentIndex = stages.indexOf(currentStatus);
    const stageIndex = stages.indexOf(stage);

    if (currentStatus === 'failed') return stageIndex <= currentIndex ? <AlertCircle size={16} /> : <div className="dot" />;
    if (stageIndex < currentIndex || currentStatus === 'completed') return <Check size={16} />;
    if (stageIndex === currentIndex) return <Loader2 size={16} className="spin" />;
    return <div className="dot" />;
  }

  const getTimelineClass = (stage, currentStatus) => {
    const stages = ['queued', 'provisioning_vm', 'starting_vm', 'deploying_server', 'completed'];
    const currentIndex = stages.indexOf(currentStatus);
    const stageIndex = stages.indexOf(stage);

    if (currentStatus === 'failed') return stageIndex <= currentIndex ? 'error' : 'pending';
    if (stageIndex < currentIndex || currentStatus === 'completed') return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="dashboard-main deploy-page">
        <div className="deploy-wizard">
          {/* Wizard Header - Hide on Step 4 */}
          {step < 4 && (
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
          )}

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
                    placeholder="e.g., CraftHost Ultra SMP, SkyBlock Legends..."
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

            {/* Step 4: Progress Screen */}
            {step === 4 && (
              <div className="wizard-step-content fade-in deploy-progress-container">
                <div className="step-hero">
                  <div className="step-icon">
                    {jobStatus?.status === 'completed' ? <Check size={32} className="text-emerald-400" /> : 
                     jobStatus?.status === 'failed' ? <AlertCircle size={32} className="text-red-400" /> :
                     <Loader2 size={32} className="spin text-emerald-400" />}
                  </div>
                  <h1>Deploying "{serverName || 'CraftHost SMP Server'}"</h1>
                  <p>{jobStatus?.message || 'Warming up engines...'}</p>
                </div>

                <div className="progress-glass">
                  <div className="progress-bar-track">
                    <div 
                      className="progress-bar-fill" 
                      style={{ width: `${jobStatus?.progress || 0}%` }}
                    />
                  </div>
                  <div className="progress-percentage">
                    {jobStatus?.progress || 0}%
                  </div>

                  <div className="progress-timeline">
                    <div className={`timeline-item ${getTimelineClass('queued', jobStatus?.status)}`}>
                      <div className="timeline-icon">{getTimelineIcon('queued', jobStatus?.status)}</div>
                      <div className="timeline-text">Server job queued</div>
                    </div>
                    <div className={`timeline-item ${getTimelineClass('provisioning_vm', jobStatus?.status)}`}>
                      <div className="timeline-icon">{getTimelineIcon('provisioning_vm', jobStatus?.status)}</div>
                      <div className="timeline-text">Provisioning Virtual Machine in {selectedRegion?.label}</div>
                    </div>
                    <div className={`timeline-item ${getTimelineClass('starting_vm', jobStatus?.status)}`}>
                      <div className="timeline-icon">{getTimelineIcon('starting_vm', jobStatus?.status)}</div>
                      <div className="timeline-text">
                        {jobStatus?.status === 'starting_vm' && jobStatus?.message 
                          ? jobStatus.message 
                          : `Starting VM & executing cloud-init`}
                      </div>
                    </div>
                    <div className={`timeline-item ${getTimelineClass('deploying_server', jobStatus?.status)}`}>
                      <div className="timeline-icon">{getTimelineIcon('deploying_server', jobStatus?.status)}</div>
                      <div className="timeline-text">Deploying Minecraft Server</div>
                    </div>
                    <div className={`timeline-item ${getTimelineClass('completed', jobStatus?.status)}`}>
                      <div className="timeline-icon">{getTimelineIcon('completed', jobStatus?.status)}</div>
                      <div className="timeline-text">Ready to play</div>
                    </div>
                  </div>

                  {jobStatus?.status === 'failed' && (
                    <div className="deploy-error">
                      <AlertCircle size={20} />
                      <div>
                        <strong>Deployment Failed</strong>
                        <p>{jobStatus.error || 'An unexpected error occurred.'}</p>
                      </div>
                    </div>
                  )}

                  <div className="deploy-actions mt-8 text-center">
                    {jobStatus?.status === 'completed' && (
                      <button className="btn btn-primary btn-large" onClick={() => navigate('/dashboard')}>
                        <Zap size={18} /> Go to Dashboard
                      </button>
                    )}
                    {jobStatus?.status === 'failed' && (
                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={() => { setDeployJobId(null); setJobStatus(null); setIsDeploying(false); handleDeploy(); }}>
                          <Zap size={16} /> Retry Deployment
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setStep(3); setIsDeploying(false); }}>
                          Back to Settings
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Footer - Hide on Step 4 */}
          {step < 4 && (
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
                      <span className="deploying-spinner"><Loader2 size={16} className="spin" /> Queuing...</span>
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
          )}
        </div>
      </div>
    </div>
  )
}
