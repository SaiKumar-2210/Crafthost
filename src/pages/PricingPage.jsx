import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import PricingCards from '../components/landing/PricingCards'
import { CheckCircle2, Zap, Shield, Headphones } from 'lucide-react'
import './PricingPage.css'

export default function PricingPage() {
  return (
    <div className="pricing-page">
      <Navbar />
      
      <main className="pricing-main">
        <PricingCards />

        <div className="container comparison-section">
          <h2 className="comparison-title text-center">Every plan includes</h2>
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <Shield size={24} className="text-accent" />
              </div>
              <h4>Enterprise DDoS Protection</h4>
              <p className="text-secondary text-sm">Automated mitigation of L3/L4 & L7 attacks up to 1 Tbps.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <Zap size={24} className="text-accent" />
              </div>
              <h4>NVMe SSD Storage</h4>
              <p className="text-secondary text-sm">Blazing fast read/write speeds for instant chunk loading.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <CheckCircle2 size={24} className="text-accent" />
              </div>
              <h4>99.99% Uptime SLA</h4>
              <p className="text-secondary text-sm">We guarantee your server stays online, or you get credited.</p>
            </div>
            <div className="feature-item">
              <div className="feature-icon-wrapper">
                <Headphones size={24} className="text-accent" />
              </div>
              <h4>24/7 Expert Support</h4>
              <p className="text-secondary text-sm">Our Minecraft veterans are always awake and ready to help.</p>
            </div>
          </div>
        </div>

        <div className="container faq-section">
          <h2 className="faq-title text-center">Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item card p-6">
              <h4 className="font-bold mb-2">Can I upgrade my plan later?</h4>
              <p className="text-secondary text-sm">Yes! You can upgrade or downgrade your plan at any time from your dashboard. Prorated charges apply automatically.</p>
            </div>
            <div className="faq-item card p-6">
              <h4 className="font-bold mb-2">Do you support modpacks?</h4>
              <p className="text-secondary text-sm">Absolutely. We have a 1-click installer for over 1,000 popular modpacks (CurseForge, FTB, Technic) and support custom JARs.</p>
            </div>
            <div className="faq-item card p-6">
              <h4 className="font-bold mb-2">Where are your servers located?</h4>
              <p className="text-secondary text-sm">We have 12 data centers globally including NA (East/West/Central), EU (UK, Germany, Finland), Asia (Singapore, Tokyo), and Australia.</p>
            </div>
            <div className="faq-item card p-6">
              <h4 className="font-bold mb-2">Is there a refund policy?</h4>
              <p className="text-secondary text-sm">We offer a 7-day money-back guarantee. If you're not satisfied within your first week, contact support for a full refund.</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
