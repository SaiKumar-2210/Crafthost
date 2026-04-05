import { useState, useEffect } from 'react'
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import './Testimonials.css'

const testimonials = [
  {
    name: 'Alex Rivera',
    role: 'Owner of PixelRealms SMP',
    avatar: '🧑‍💻',
    rating: 5,
    text: "Migrated from another host and the difference is night and day. Zero lag during peak hours with 40+ players. The auto-backup feature saved us twice already. Best hosting decision we've ever made.",
  },
  {
    name: 'Sarah Chen',
    role: 'Modpack Developer',
    avatar: '👩‍🎨',
    rating: 5,
    text: "Running a 200+ mod Forge pack with zero crashes. The one-click modpack installer is incredible — what used to take hours now takes 30 seconds. Support team actually understands modded MC too!",
  },
  {
    name: 'Marcus Johnson',
    role: 'Community Manager, BuildCraft Network',
    avatar: '👨‍💼',
    rating: 5,
    text: "We run a network of 8 interconnected servers on CraftHost. The multi-server linking and dedicated IPs make it seamless. 99.99% uptime isn't just marketing — we've tracked it ourselves.",
  },
  {
    name: 'Emma Williams',
    role: 'Streamer & Content Creator',
    avatar: '🎮',
    rating: 5,
    text: "My viewers love the instant setup. I can spin up a fresh server mid-stream and have everyone join in seconds. The console access is chef's kiss — exactly what power users need.",
  },
  {
    name: 'Takeshi Yamamoto',
    role: 'Event Organizer, MC Championships',
    avatar: '🏆',
    rating: 5,
    text: "Hosted a 200-player tournament with zero dropped connections. The enterprise DDoS protection handled everything thrown at us. CraftHost is the only host I trust for competitive events.",
  },
]

export default function Testimonials() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)

  useEffect(() => {
    if (!isAutoPlaying) return
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPlaying])

  const goTo = (index) => {
    setActiveIndex(index)
    setIsAutoPlaying(false)
    setTimeout(() => setIsAutoPlaying(true), 10000)
  }

  const prev = () => goTo((activeIndex - 1 + testimonials.length) % testimonials.length)
  const next = () => goTo((activeIndex + 1) % testimonials.length)

  const current = testimonials[activeIndex]

  return (
    <section className="testimonials-section section" id="testimonials">
      <div className="container">
        <div className="section-header animate-fade-in-up">
          <span className="section-badge">
            <Star size={14} />
            Reviews
          </span>
          <h2 className="section-title">
            Loved by
            <span className="text-gradient"> 50,000+ </span>
            Server Owners
          </h2>
          <p className="section-subtitle">
            Don't just take our word for it — hear from the community.
          </p>
        </div>

        <div className="testimonial-carousel">
          <div className="testimonial-card card-glass animate-scale-in" key={activeIndex}>
            <Quote size={32} className="testimonial-quote-icon" />

            <div className="testimonial-stars">
              {Array.from({ length: current.rating }).map((_, i) => (
                <Star key={i} size={16} fill="hsl(45, 93%, 47%)" color="hsl(45, 93%, 47%)" />
              ))}
            </div>

            <blockquote className="testimonial-text">
              "{current.text}"
            </blockquote>

            <div className="testimonial-author">
              <div className="testimonial-avatar">{current.avatar}</div>
              <div>
                <p className="testimonial-name">{current.name}</p>
                <p className="testimonial-role">{current.role}</p>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="testimonial-controls">
            <button className="btn btn-icon btn-secondary" onClick={prev} aria-label="Previous review">
              <ChevronLeft size={18} />
            </button>

            <div className="testimonial-dots">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  className={`testimonial-dot ${i === activeIndex ? 'testimonial-dot-active' : ''}`}
                  onClick={() => goTo(i)}
                  aria-label={`Review ${i + 1}`}
                />
              ))}
            </div>

            <button className="btn btn-icon btn-secondary" onClick={next} aria-label="Next review">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
