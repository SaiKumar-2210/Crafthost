import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Server, ArrowRight, Mail, Lock, User } from 'lucide-react'
import logoImg from '../assets/logo.jpg'
import { useApp } from '../context/AppContext'
import './Auth.css'

export default function Auth({ type = 'login' }) {
  const isLogin = type === 'login'
  const navigate = useNavigate()
  const { login } = useApp()
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    const API_BASE = import.meta.env.VITE_API_BASE || '/api';
    const endpoint = isLogin ? '/auth/login' : '/auth/register'
    
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed')
      }
      
      login(data.user, data.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <Link to="/" className="auth-back-logo">
        <img src={logoImg} alt="CraftHost Logo" style={{ height: '32px', marginRight: '8px', borderRadius: '4px' }} />
        <span className="logo-text">CraftHost</span>
      </Link>
      
      <div className="auth-container card animate-scale-in">
        <div className="auth-header">
          <h1 className="auth-title">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-subtitle">
            {isLogin 
              ? 'Enter your details to access your dashboard.' 
              : 'Start your 7-day free trial. No credit card required.'}
          </p>
        </div>

        <div className="auth-providers">
          <button className="btn btn-secondary provider-btn">
            {/* Fallback to custom SVG since Github lucide icon is missing now */}
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="provider-icon">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            <span>Continue with GitHub</span>
          </button>
        </div>

        <div className="auth-divider">
          <span>or log in with email</span>
        </div>

        {error && <div className="auth-error" style={{ color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '4px', marginBottom: '15px', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="form-group-with-icon">
              <User size={18} className="input-icon" />
              <input 
                type="text" 
                name="name" 
                placeholder="Username" 
                className="form-control auth-input"
                onChange={handleChange}
                required
              />
            </div>
          )}
          
          <div className="form-group-with-icon">
            <Mail size={18} className="input-icon" />
            <input 
              type="email" 
              name="email" 
              placeholder="Email address" 
              className="form-control auth-input"
              onChange={handleChange}
              required
            />
          </div>
          
          <div className="form-group-with-icon">
            <Lock size={18} className="input-icon" />
            <input 
              type="password" 
              name="password" 
              placeholder="Password" 
              className="form-control auth-input"
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? (
              <span className="loading-spinner"></span>
            ) : (
              <>
                <span>{isLogin ? 'Log In' : 'Sign Up'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          {isLogin ? (
            <p>Don't have an account? <Link to="/signup" className="auth-link">Sign up</Link></p>
          ) : (
            <p>Already have an account? <Link to="/login" className="auth-link">Log in</Link></p>
          )}
        </div>
      </div>
      
      {/* Decorative background elements */}
      <div className="auth-glow auth-glow-1"></div>
      <div className="auth-glow auth-glow-2"></div>
    </div>
  )
}
