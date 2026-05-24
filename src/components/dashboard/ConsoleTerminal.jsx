import { useState, useEffect, useRef } from 'react'
import { Terminal as TerminalIcon, Play } from 'lucide-react'
import { io } from 'socket.io-client'
import { useParams } from 'react-router-dom'
import './ConsoleTerminal.css'

export default function ConsoleTerminal() {
  const { id } = useParams()
  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'INFO', text: 'Connecting to console websocket...' }
  ])
  const [input, setInput] = useState('')
  const [socket, setSocket] = useState(null)
  const logsEndRef = useRef(null)

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Setup WebSocket
  useEffect(() => {
    // If we're strictly serving via monolothic backend, socket.io automatically infers host if no url is passed, but '/' works too.
    const newSocket = io('/')
    setSocket(newSocket)

    newSocket.on('connect', () => {
      newSocket.emit('join-server', id)
      setLogs([{
        id: Date.now(),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'INFO',
        text: 'Connected to live console feed. Loading history...'
      }])
    })

    newSocket.on('console-history', (historyString) => {
      const lines = historyString.split('\n').filter(line => line.trim() !== '')
      const historyLogs = lines.map((line, i) => {
        let level = 'INFO'
        if (line.includes('WARN')) level = 'WARN'
        if (line.includes('ERROR') || line.includes('Exception') || line.includes('Failed')) level = 'ERROR'
        if (line.startsWith('>')) level = 'INPUT'
        return {
          id: Date.now() + i,
          time: '', // History lines might not have our custom time format unless parsed, keeping blank for simplicity or we can add a generic time
          level,
          text: line.trim()
        }
      });
      setLogs(prev => [...prev, ...historyLogs].slice(-250))
    })

    newSocket.on('console-log', (data) => {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      lines.forEach(line => {
        let level = 'INFO'
        if (line.includes('WARN')) level = 'WARN'
        if (line.includes('ERROR') || line.includes('Exception') || line.includes('Failed')) level = 'ERROR'
        if (line.startsWith('>')) level = 'INPUT'
        
        setLogs(prev => [...prev.slice(-250), {
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
          level,
          text: line.trim()
        }])
      })
    })

    newSocket.on('console-error', (data) => {
      setLogs(prev => [...prev.slice(-250), {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        level: 'ERROR',
        text: data.toString().trim()
      }])
    })

    return () => newSocket.close()
  }, [id])

  const handleCommandSubmit = (e) => {
    e.preventDefault()
    if (!input.trim() || !socket) return

    setLogs(prev => [...prev, {
      id: Date.now(),
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      level: 'INPUT',
      text: `> ${input}`
    }])

    socket.emit('send-command', { serverId: id, command: input })
    setInput('')
  }

  const getLogColor = (level) => {
    switch (level) {
      case 'WARN': return 'text-warning'
      case 'ERROR': return 'text-error'
      case 'INPUT': return 'text-primary'
      default: return 'text-secondary'
    }
  }

  return (
    <div className="console-terminal card">
      <div className="console-header">
        <TerminalIcon size={16} className="text-secondary" />
        <span className="console-title font-semibold">Live Console</span>
        <div className="console-badge badge badge-neutral">WebSocket Live</div>
      </div>
      
      <div className="console-window">
        {logs.map((log) => (
          <div key={log.id} className="console-line">
            {log.level === 'INPUT' ? (
              <span className="console-text input-text">{log.text}</span>
            ) : (
              <>
                <span className="console-time">[{log.time}]</span>
                <span className={`console-level ${getLogColor(log.level)}`}>[{log.level}]</span>
                <span className="console-text">{log.text}</span>
              </>
            )}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <form className="console-input-area" onSubmit={handleCommandSubmit}>
        <span className="console-prompt">root@crafthost:~#</span>
        <input
          type="text"
          className="console-input"
          placeholder="_"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck="false"
        />
        <button type="submit" className="console-btn">
          <Play size={14} />
        </button>
      </form>
    </div>
  )
}
