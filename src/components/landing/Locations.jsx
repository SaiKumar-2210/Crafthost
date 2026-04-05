import { MapPin, Globe } from 'lucide-react'
import './Locations.css'

const locations = [
  { name: 'New York', region: 'US East', x: '26%', y: '38%', ping: '12ms' },
  { name: 'Los Angeles', region: 'US West', x: '14%', y: '40%', ping: '18ms' },
  { name: 'Dallas', region: 'US Central', x: '20%', y: '42%', ping: '15ms' },
  { name: 'London', region: 'EU West', x: '47%', y: '30%', ping: '8ms' },
  { name: 'Frankfurt', region: 'EU Central', x: '50%', y: '31%', ping: '10ms' },
  { name: 'Helsinki', region: 'EU North', x: '54%', y: '24%', ping: '14ms' },
  { name: 'Singapore', region: 'Asia SE', x: '74%', y: '56%', ping: '22ms' },
  { name: 'Tokyo', region: 'Asia East', x: '82%', y: '38%', ping: '16ms' },
  { name: 'Sydney', region: 'Oceania', x: '83%', y: '72%', ping: '20ms' },
  { name: 'São Paulo', region: 'S. America', x: '30%', y: '68%', ping: '25ms' },
  { name: 'Mumbai', region: 'Asia South', x: '66%', y: '48%', ping: '18ms' },
  { name: 'Johannesburg', region: 'Africa', x: '53%', y: '70%', ping: '28ms' },
]

export default function Locations() {
  return (
    <section className="locations-section section" id="locations">
      <div className="container">
        <div className="section-header animate-fade-in-up">
          <span className="section-badge">
            <Globe size={14} />
            Global Network
          </span>
          <h2 className="section-title">
            Servers
            <span className="text-gradient"> Everywhere</span>
          </h2>
          <p className="section-subtitle">
            12 data centers across 6 continents. Choose the location
            closest to your players for the lowest possible ping.
          </p>
        </div>

        {/* Map container */}
        <div className="locations-map-wrap">
          <div className="locations-map">
            {/* World map outline (simplified SVG) */}
            <svg className="world-svg" viewBox="0 0 1000 500" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Simplified continent outlines */}
              {/* North America */}
              <path d="M120 80 L200 70 L260 90 L280 120 L260 150 L280 180 L270 220 L240 250 L200 260 L180 220 L140 200 L100 160 L90 120 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
              {/* South America */}
              <path d="M240 280 L280 270 L310 300 L320 350 L300 400 L270 380 L250 340 L230 310 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
              {/* Europe */}
              <path d="M440 80 L500 70 L540 90 L560 110 L540 140 L500 150 L470 140 L450 110 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
              {/* Africa */}
              <path d="M440 180 L500 170 L540 200 L560 260 L540 340 L500 370 L460 340 L440 280 L430 230 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
              {/* Asia */}
              <path d="M560 60 L700 50 L800 70 L850 110 L830 160 L780 190 L720 200 L660 180 L600 160 L570 120 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
              {/* Australia */}
              <path d="M780 320 L860 310 L890 340 L880 380 L840 390 L800 370 L780 340 Z"
                stroke="hsla(215,20%,30%,0.3)" strokeWidth="1" fill="hsla(215,20%,20%,0.1)" />
            </svg>

            {/* Location pins */}
            {locations.map((loc, i) => (
              <div
                key={i}
                className="location-pin"
                style={{ left: loc.x, top: loc.y }}
                title={`${loc.name} — ${loc.ping}`}
              >
                <div className="pin-pulse" />
                <div className="pin-dot" />
                <div className="pin-tooltip">
                  <div className="pin-tooltip-name">
                    <MapPin size={12} />
                    {loc.name}
                  </div>
                  <div className="pin-tooltip-region">{loc.region}</div>
                  <div className="pin-tooltip-ping">{loc.ping} latency</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Location cards */}
        <div className="locations-list stagger-children">
          {locations.map((loc, i) => (
            <div className="location-chip" key={i}>
              <MapPin size={12} />
              <span>{loc.name}</span>
              <span className="location-chip-ping">{loc.ping}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
