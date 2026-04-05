import { Check, Star, ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import './PricingCards.css'

const plans = [
  {
    name: 'Starter',
    tagline: 'Perfect for small groups',
    price: '4.99',
    period: '/mo',
    ram: '2 GB RAM',
    features: [
      '10 Player Slots',
      '2 GB RAM',
      '10 GB NVMe Storage',
      'DDoS Protection',
      'Automatic Backups',
      'Custom JAR Support',
      '1 MySQL Database',
    ],
    cta: 'Start Free Trial',
    popular: false,
    color: 'var(--text-secondary)',
  },
  {
    name: 'Pro',
    tagline: 'Most popular for communities',
    price: '12.99',
    period: '/mo',
    ram: '6 GB RAM',
    features: [
      '50 Player Slots',
      '6 GB RAM',
      '50 GB NVMe Storage',
      'Advanced DDoS Protection',
      'Automatic Backups (2hr)',
      'Full Mod/Plugin Support',
      '3 MySQL Databases',
      'Dedicated IP Address',
      'Sub-user Access',
    ],
    cta: 'Start Free Trial',
    popular: true,
    color: 'var(--accent-primary)',
  },
  {
    name: 'Enterprise',
    tagline: 'For large networks & events',
    price: '34.99',
    period: '/mo',
    ram: '16 GB RAM',
    features: [
      'Unlimited Players',
      '16 GB RAM',
      '200 GB NVMe Storage',
      'Premium DDoS (1Tbps+)',
      'Real-time Backups',
      'Full Mod/Plugin Support',
      'Unlimited Databases',
      'Dedicated IP Address',
      'Priority 24/7 Support',
      'Custom JVM Tuning',
      'Multi-server Linking',
    ],
    cta: 'Contact Sales',
    popular: false,
    color: 'var(--accent-secondary)',
  },
]

export default function PricingCards() {
  return (
    <section className="pricing-section section" id="pricing">
      <div className="container">
        {/* Section header */}
        <div className="section-header animate-fade-in-up">
          <span className="section-badge">
            <Sparkles size={14} />
            Pricing
          </span>
          <h2 className="section-title">
            Simple, Transparent
            <span className="text-gradient"> Pricing</span>
          </h2>
          <p className="section-subtitle">
            No hidden fees. No surprise charges. Scale up or down anytime with
            full prorated refunds.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="pricing-grid stagger-children">
          {plans.map((plan, index) => (
            <div
              className={`pricing-card card ${plan.popular ? 'pricing-card-popular' : ''}`}
              key={index}
              id={`pricing-${plan.name.toLowerCase()}`}
            >
              {plan.popular && (
                <div className="pricing-popular-badge">
                  <Star size={12} />
                  Most Popular
                </div>
              )}

              <div className="pricing-header">
                <h3 className="pricing-name" style={{ color: plan.color }}>{plan.name}</h3>
                <p className="pricing-tagline">{plan.tagline}</p>
              </div>

              <div className="pricing-price">
                <span className="pricing-currency">$</span>
                <span className="pricing-amount">{plan.price}</span>
                <span className="pricing-period">{plan.period}</span>
              </div>

              <div className="pricing-ram-badge">
                {plan.ram}
              </div>

              <ul className="pricing-features">
                {plan.features.map((feature, i) => (
                  <li className="pricing-feature" key={i}>
                    <Check size={15} className="pricing-check" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/signup"
                className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'} btn-lg pricing-cta`}
                id={`pricing-cta-${plan.name.toLowerCase()}`}
                style={{textDecoration: 'none', display: 'flex'}}
              >
                <span>{plan.cta}</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>

        {/* Guarantee */}
        <p className="pricing-guarantee animate-fade-in">
          🛡️ 7-day money-back guarantee · No contracts · Cancel anytime
        </p>
      </div>
    </section>
  )
}
