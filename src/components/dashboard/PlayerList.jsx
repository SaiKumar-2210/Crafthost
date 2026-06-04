import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Search, Shield, UserMinus, UserX } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import './PlayerList.css'

export default function PlayerList({ visible = false }) {
  const { id } = useParams()
  const { getAuthHeaders, API_BASE, servers } = useApp()
  const [players, setPlayers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  const server = servers.find(s => s.id === id)
  const isOnline = server?.status === 'online'

  const fetchPlayers = async () => {
    if (!isOnline) {
      setPlayers([])
      setLoading(false)
      return
    }
    
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/players`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setPlayers(data.players || [])
      }
    } catch {
      console.error("Failed fetching players")
    } finally {
      setLoading(false)
    }
  }

  // Only poll when tab is visible — prevents constant RCON connect/disconnect spam
  useEffect(() => {
    if (!visible) return
    fetchPlayers()
    const interval = setInterval(fetchPlayers, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isOnline, visible])

  const handleAction = async (playerName, action) => {
    if (!confirm(`Are you sure you want to ${action} ${playerName}?`)) return
    
    try {
      await fetch(`${API_BASE}/servers/${id}/players/action`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ playerName, action })
      })
      fetchPlayers()
    } catch {
      console.error(`Failed to ${action} player`)
      alert(`Failed to ${action}`)
    }
  }

  const filteredPlayers = players.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))

  if (!isOnline) {
    return (
      <div className="player-list card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <h3 style={{ color: '#888' }}>Server is offline. Start the server to view players.</h3>
      </div>
    )
  }

  return (
    <div className="player-list card">
      <div className="player-list-header">
        <div className="search-bar">
          <Search size={16} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search players..." 
            className="search-input" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="player-stats">
          <span className="badge badge-success">{players.length} Online</span>
        </div>
      </div>

      <div className="player-table-container">
        <table className="player-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Ping</th>
              <th className="text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {loading && players.length === 0 ? (
               <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Querying server...</td></tr>
            ) : filteredPlayers.length === 0 ? (
               <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>No players online</td></tr>
            ) : filteredPlayers.map((player, i) => (
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
                  {player.isOp ? (
                    <span className="role-badge role-admin" style={{ color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>Operator</span>
                  ) : (
                    <span className="role-badge role-player" style={{ color: '#aaa', border: '1px solid #444', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>Player</span>
                  )}
                </td>
                <td>
                  <span className={`ping-text ${parseInt(player.ping) > 100 ? 'ping-high' : 'ping-low'}`}>
                    {player.ping}ms
                  </span>
                </td>
                <td>
                  <div className="player-actions">
                    {player.isOp ? (
                      <button 
                        className="player-action-btn deop" 
                        title="Remove Operator"
                        onClick={() => handleAction(player.name, 'deop')}
                      >
                        <Shield size={12} style={{ fill: 'currentColor' }} />
                        <span>Deop</span>
                      </button>
                    ) : (
                      <button 
                        className="player-action-btn op" 
                        title="Make Operator"
                        onClick={() => handleAction(player.name, 'op')}
                      >
                        <Shield size={12} />
                        <span>Op</span>
                      </button>
                    )}
                    <button 
                      className="player-action-btn kick" 
                      title="Kick Player"
                      onClick={() => handleAction(player.name, 'kick')}
                    >
                      <UserMinus size={12} />
                      <span>Kick</span>
                    </button>
                    <button 
                      className="player-action-btn ban" 
                      title="Ban Player"
                      onClick={() => handleAction(player.name, 'ban')}
                    >
                      <UserX size={12} />
                      <span>Ban</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
