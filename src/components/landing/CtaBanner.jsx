import { ArrowRight, Rocket } from 'lucide-react'
import './CtaBanner.css'

export default function CtaBanner() {
  return (
    <section className="cta-section" id="cta-banner">
      <div className="container">
        <div className="cta-card">
          <div className="cta-bg-glow cta-glow-1" />
          <div className="cta-bg-glow cta-glow-2" />

          <div className="cta-content">
            <div className="cta-icon-wrap">
              <Rocket size={28} />
            </div>
            <h2 className="cta-title">
              Ready to Launch Your Server?
            </h2>
            <p className="cta-subtitle">
              Join 50,000+ server owners who trust CraftHost. Deploy in seconds,
              scale instantly, and never worry about lag again.
            </p>
            <div className="cta-actions">
              <a href="/login" className="btn btn-primary btn-lg" id="cta-get-started">
                <span>Get Started</span>
                <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
