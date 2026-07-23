import { MapPin, Globe } from 'lucide-react'
import './Locations.css'

const locations = [
  { name: 'US East', region: 'United States', x: '21%', y: '37%', ping: '92ms' },
  { name: 'London', region: 'United Kingdom', x: '47%', y: '26%', ping: '108ms' },
  { name: 'Mumbai', region: 'India', x: '67%', y: '47%', ping: '18ms' },
  { name: 'Seoul', region: 'Korea', x: '79%', y: '34%', ping: '12ms' },
  { name: 'Sydney', region: 'Australia', x: '84%', y: '71%', ping: '142ms' },
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
            Deploy close to your players with nodes in the US, UK, India, Korea, and Australia.
          </p>
        </div>

        <div className="locations-map-wrap">
          <div className="locations-map">
            <svg className="world-svg" viewBox="0 0 1000 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CraftHost global server locations">
              <g className="map-land" fill="url(#landFill)" stroke="rgba(183,243,107,.16)" strokeWidth="1.2">
                <path d="M91 116l33-35 57-10 39 18 32 40-21 34 17 39-9 42-34 35-39 10-17-38-35-18-42-40-12-42 22-27z" />
                <path d="M241 285l31-13 25 27 7 43-17 50-25 39-25-14-22-40-25-48 8-29z" />
                <path d="M402 106l28-18 32 8 28 27-18 29-32 9-37-17-14-30z" />
                <path d="M408 196l58-10 38 25 19 54-17 72-35 40-45-32-22-58-9-57z" />
                <path d="M521 96l68-13 67 7 49 24 44 43-17 45-34 12-45 30-54-12-50-33-24-48z" />
                <path d="M747 303l55-9 28 27-9 38-40 13-35-18-18-34z" />
                <path d="M636 215l12-8 11 6-7 14-14 2zM672 218l15-5 12 8-7 12-16-2zM698 233l11-3 8 11-11 8z" />
              </g>
              <defs>
                <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#1a2b2b" />
                  <stop offset="1" stopColor="#111c24" />
                </linearGradient>
              </defs>
            </svg>

            {locations.map((loc) => (
              <div
                key={loc.name}
                className="location-pin"
                style={{ left: loc.x, top: loc.y }}
                title={loc.name + ' — ' + loc.ping}
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

        <div className="locations-list stagger-children">
          {locations.map((loc) => (
            <div className="location-chip" key={loc.name}>
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
