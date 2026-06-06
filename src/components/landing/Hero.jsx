import { ArrowRight, Zap, Play } from 'lucide-react'
import './Hero.css'

export default function Hero() {
  return (
    <section className="hero" id="hero">
      {/* Animated background */}
      <div className="hero-bg">
        <div className="hero-grid-pattern" />
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="hero-glow hero-glow-3" />
        {/* Floating Minecraft blocks */}
        <div className="floating-block block-1">
          <div className="mc-block mc-grass" />
        </div>
        <div className="floating-block block-2">
          <div className="mc-block mc-diamond" />
        </div>
        <div className="floating-block block-3">
          <div className="mc-block mc-stone" />
        </div>
        <div className="floating-block block-4">
          <div className="mc-block mc-gold" />
        </div>
        <div className="floating-block block-5">
          <div className="mc-block mc-redstone" />
        </div>
      </div>

      <div className="container hero-content">
        {/* Top badge */}
        <div className="hero-badge animate-fade-in">
          <Zap size={14} />
          <span>Now with 99.99% uptime guarantee</span>
        </div>

        {/* Headline */}
        <h1 className="hero-title animate-fade-in-up">
          Launch Your Minecraft
          <br />
          <span className="text-gradient">Server in Seconds</span>
        </h1>

        {/* Subtitle */}
        <p className="hero-subtitle animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          Minecraft hosting powered by enterprise hardware. Instant setup, automatic
          backups, DDoS protection, and full mod support.
        </p>

        {/* CTA Buttons */}
        <div className="hero-actions animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
          <a href="/login" className="btn btn-primary btn-lg" id="hero-cta-primary">
            <span>Get Started</span>
            <ArrowRight size={18} />
          </a>
          <a href="#features" className="btn btn-secondary btn-lg" id="hero-cta-secondary">
            <Play size={16} />
            <span>See How It Works</span>
          </a>
        </div>

        {/* Stats row */}
        <div className="hero-stats animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
          <div className="hero-stat">
            <span className="hero-stat-value">50K+</span>
            <span className="hero-stat-label">Active Servers</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value">99.99%</span>
            <span className="hero-stat-label">Uptime SLA</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value">2</span>
            <span className="hero-stat-label">Global Locations</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat">
            <span className="hero-stat-value">200K+</span>
            <span className="hero-stat-label">Happy Players</span>
          </div>
        </div>

        {/* Terminal preview */}
        <div className="hero-terminal animate-scale-in" style={{ animationDelay: '0.45s' }}>
          <div className="terminal-header">
            <div className="terminal-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <span className="terminal-title">crafthost — server console</span>
          </div>
          <div className="terminal-body">
            <div className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cmd">crafthost deploy --version 1.21.4 --type paper</span>
            </div>
            <div className="terminal-line terminal-output">
              <span className="terminal-success">✓</span> Provisioning server in us-east-1...
            </div>
            <div className="terminal-line terminal-output">
              <span className="terminal-success">✓</span> Installing Paper 1.21.4 (build #445)...
            </div>
            <div className="terminal-line terminal-output">
              <span className="terminal-success">✓</span> Configuring DDoS protection...
            </div>
            <div className="terminal-line terminal-output">
              <span className="terminal-success">✓</span> Server deployed! Connect: <span className="terminal-highlight">play.crafthost.gg:25565</span>
            </div>
            <div className="terminal-line">
              <span className="terminal-prompt">$</span>
              <span className="terminal-cursor">|</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
