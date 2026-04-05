import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import Hero from '../components/landing/Hero'
import Features from '../components/landing/Features'
import Locations from '../components/landing/Locations'
import PricingCards from '../components/landing/PricingCards'
import Testimonials from '../components/landing/Testimonials'
import CtaBanner from '../components/landing/CtaBanner'
import './Landing.css'

export default function Landing() {
  return (
    <div className="landing-page">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Locations />
        <PricingCards />
        <Testimonials />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  )
}
