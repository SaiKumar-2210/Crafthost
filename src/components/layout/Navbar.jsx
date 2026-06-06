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
          <a href="#locations" className="nav-link" onClick={() => setMobileOpen(false)}>Locations</a>
          <a href="https://discord.gg/9mUscXNt" target="_blank" rel="noopener noreferrer" className="nav-link" onClick={() => setMobileOpen(false)}>Discord</a>
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
