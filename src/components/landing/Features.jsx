import {
  Shield, Zap, HardDrive, Globe, Clock, Headphones,
  Puzzle, Database, ArrowUpRight
} from 'lucide-react'
import './Features.css'

const features = [
  {
    icon: Zap,
    title: 'Instant Deployment',
    description: 'Your server is live in under 30 seconds. One-click install for Vanilla, Paper, Spigot, Forge, and Fabric.',
    color: 'var(--accent-primary)',
    tag: 'Fast'
  },
  {
    icon: Shield,
    title: 'DDoS Protection',
    description: 'Enterprise-grade 1 Tbps+ DDoS mitigation keeps your server online even under the heaviest attacks.',
    color: 'var(--accent-secondary)',
    tag: 'Secure'
  },
  {
    icon: HardDrive,
    title: 'NVMe Storage',
    description: 'Blazing fast NVMe SSDs ensure instant chunk loading, zero lag world saves, and rapid server boot.',
    color: 'hsl(270, 70%, 60%)',
    tag: 'Performance'
  },
  {
    icon: Globe,
    title: '2 Global Locations',
    description: 'Servers in India and Korea. Choose the closest location for minimal ping.',
    color: 'hsl(38, 92%, 50%)',
    tag: 'Global'
  },
  {
    icon: Puzzle,
    title: 'Full Mod Support',
    description: 'One-click modpack installers for Forge and Fabric. Upload custom JARs, manage plugins with ease.',
    color: 'hsl(330, 70%, 55%)',
    tag: 'Mods'
  },
  {
    icon: Database,
    title: 'Automatic Backups',
    description: 'Scheduled cloud backups every 6 hours with 30-day retention. One-click restore to any snapshot.',
    color: 'hsl(200, 80%, 55%)',
    tag: 'Backups'
  },
  {
    icon: Clock,
    title: '99.99% Uptime SLA',
    description: 'Redundant infrastructure with automatic failover. Your server stays online 24/7/365.',
    color: 'hsl(160, 70%, 45%)',
    tag: 'Reliable'
  },
  {
    icon: Headphones,
    title: '24/7 Expert Support',
    description: 'Our Minecraft experts are always available via live chat, Discord, and tickets. Average response: 3 minutes.',
    color: 'hsl(15, 80%, 55%)',
    tag: 'Support'
  }
]

export default function Features() {
  return (
    <section className="features-section section" id="features">
      <div className="container">
        {/* Section header */}
        <div className="section-header animate-fade-in-up">
          <span className="section-badge">
            <Zap size={14} />
            Features
          </span>
          <h2 className="section-title">
            Everything You Need to
            <span className="text-gradient"> Dominate</span>
          </h2>
          <p className="section-subtitle">
            Powerful features backed by enterprise-grade infrastructure,
            designed for builders who demand the best.
          </p>
        </div>

        {/* Features grid */}
        <div className="features-grid stagger-children">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div className="feature-card card card-interactive" key={index} id={`feature-${index}`}>
                <div className="feature-icon-wrap" style={{ '--feature-color': feature.color }}>
                  <Icon size={22} />
                </div>
                <div className="feature-content">
                  <div className="feature-top">
                    <h3 className="feature-title">{feature.title}</h3>
                    <span className="feature-tag" style={{ color: feature.color }}>
                      {feature.tag}
                    </span>
                  </div>
                  <p className="feature-desc">{feature.description}</p>
                </div>
                <div className="feature-arrow">
                  <ArrowUpRight size={16} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
