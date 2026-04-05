import { Server, ExternalLink, Send, MessageSquare } from 'lucide-react'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="container">
        <div className="footer-grid">
          {/* Brand */}
          <div className="footer-brand">
            <div className="navbar-logo" style={{ marginBottom: '1rem' }}>
              <div className="logo-icon">
                <Server size={20} />
              </div>
              <span className="logo-text">CraftHost</span>
            </div>
            <p className="footer-desc">
              Premium Minecraft server hosting with instant deployment,
              enterprise-grade DDoS protection, and 24/7 expert support.
            </p>
            <div className="footer-socials">
              <a href="#" className="social-link" aria-label="GitHub"><ExternalLink size={18} /></a>
              <a href="#" className="social-link" aria-label="Twitter"><Send size={18} /></a>
              <a href="#" className="social-link" aria-label="Discord"><MessageSquare size={18} /></a>
            </div>
          </div>

          {/* Links */}
          <div className="footer-col">
            <h4 className="footer-heading">Product</h4>
            <a href="#features" className="footer-link">Features</a>
            <a href="#pricing" className="footer-link">Pricing</a>
            <a href="#locations" className="footer-link">Server Locations</a>
            <a href="#" className="footer-link">Mod Support</a>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Resources</h4>
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">API Reference</a>
            <a href="#" className="footer-link">Status Page</a>
            <a href="#" className="footer-link">Blog</a>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Company</h4>
            <a href="#" className="footer-link">About Us</a>
            <a href="#" className="footer-link">Careers</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copyright">
            © {new Date().getFullYear()} CraftHost. All rights reserved.
          </p>
          <p className="footer-note">
            Not affiliated with Mojang Studios or Microsoft.
          </p>
        </div>
      </div>
    </footer>
  )
}
