import { Search, Shield, Ban, MessageSquare, Target } from 'lucide-react'
import './PlayerList.css'

const players = [
  { name: 'Alex_Plays', ping: '12ms', time: '4h 12m', status: 'survival', role: 'admin' },
  { name: 'SteveMiner', ping: '45ms', time: '1h 30m', status: 'survival', role: 'player' },
  { name: 'CraftyFox', ping: '22ms', time: '5m', status: 'creative', role: 'moderator' },
  { name: 'DiamondHunter22', ping: '110ms', time: '2h 15m', status: 'survival', role: 'player' },
  { name: 'RedstoneMaster', ping: '18ms', time: '12h 5m', status: 'spectator', role: 'player' },
]

export default function PlayerList() {
  return (
    <div className="player-list card">
      <div className="player-list-header">
        <div className="search-bar">
          <Search size={16} className="search-icon" />
          <input type="text" placeholder="Search players..." className="search-input" />
        </div>
        <div className="player-stats">
          <span className="badge badge-success">5 Online</span>
          <span className="badge badge-neutral">Max: 50</span>
        </div>
      </div>

      <div className="player-table-container">
        <table className="player-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Game Mode</th>
              <th>Ping</th>
              <th>Playtime</th>
              <th className="text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, i) => (
              <tr key={i}>
                <td>
                  <div className="player-name-cell">
                    <img 
                      src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${player.name}`} 
                      alt={player.name} 
                      className="player-avatar"
                    />
                    <span className="player-name">{player.name}</span>
                  </div>
                </td>
                <td>
                  <span className={`role-badge role-${player.role}`}>
                    {player.role}
                  </span>
                </td>
                <td>
                  <span className="gamemode-text">{player.status}</span>
                </td>
                <td>
                  <span className={`ping-text ${parseInt(player.ping) > 100 ? 'ping-high' : 'ping-low'}`}>
                    {player.ping}
                  </span>
                </td>
                <td className="text-tertiary">{player.time}</td>
                <td className="player-actions text-right">
                  <button className="btn-icon btn-ghost btn-xs" title="Message">
                    <MessageSquare size={14} />
                  </button>
                  <button className="btn-icon btn-ghost btn-xs" title="Teleport">
                    <Target size={14} />
                  </button>
                  <button className="btn-icon btn-ghost btn-xs" title="Op/Deop">
                    <Shield size={14} />
                  </button>
                  <button className="btn-icon btn-ghost btn-xs text-danger" title="Kick/Ban">
                    <Ban size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
