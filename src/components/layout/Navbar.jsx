import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, Server, ChevronDown } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import './Navbar.css'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useApp()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`} id="main-nav">
      <div className="navbar-inner container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" id="nav-logo">
          <div className="logo-icon">
            <Server size={22} />
          </div>
          <span className="logo-text">CraftHost</span>
        </Link>

        {/* Nav Links */}
        <div className={`navbar-links ${mobileOpen ? 'navbar-links-open' : ''}`}>
          <a href="#features" className="nav-link" onClick={() => setMobileOpen(false)}>Features</a>
          <Link to="/pricing" className="nav-link" onClick={() => setMobileOpen(false)}>Pricing</Link>
          <a href="#locations" className="nav-link" onClick={() => setMobileOpen(false)}>Locations</a>
          <a href="#testimonials" className="nav-link" onClick={() => setMobileOpen(false)}>Reviews</a>
          <div className="nav-link nav-dropdown-trigger hide-mobile">
            <span>Resources</span>
            <ChevronDown size={14} />
            <div className="nav-dropdown">
              <a href="#" className="nav-dropdown-item">Documentation</a>
              <a href="#" className="nav-dropdown-item">API Reference</a>
              <a href="#" className="nav-dropdown-item">Status Page</a>
              <a href="#" className="nav-dropdown-item">Blog</a>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="navbar-actions">
           {user ? (
             <Link to="/dashboard" className="btn btn-primary" id="nav-dashboard">Go to Dashboard</Link>
           ) : (
             <>
               <Link to="/login" className="btn btn-ghost hide-mobile" id="nav-login">Log In</Link>
               <Link to="/login" className="btn btn-primary" id="nav-signup">Get Started</Link>
             </>
           )}
          <button
            className="btn btn-icon navbar-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            id="nav-toggle"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && <div className="navbar-overlay" onClick={() => setMobileOpen(false)} />}
    </nav>
  )
}
