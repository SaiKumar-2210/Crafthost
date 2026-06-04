import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal as TerminalIcon, Play, Wifi, WifiOff } from 'lucide-react'
import { io } from 'socket.io-client'
import { useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import './ConsoleTerminal.css'

const MAX_LOGS = 500

function parseLogLine(line, timestamp) {
  let level = 'INFO'
  if (line.includes('WARN')) level = 'WARN'
  if (line.includes('ERROR') || line.includes('Exception') || line.includes('Failed')) level = 'ERROR'
  if (line.startsWith('>')) level = 'INPUT'
  return {
    id: Date.now() + Math.random(),
    time: timestamp || '',
    level,
    text: line.trim()
  }
}

export default function ConsoleTerminal() {
  const { id } = useParams()
  const { getAuthHeaders } = useApp()
  const [logs, setLogs] = useState([
    { id: 1, time: new Date().toLocaleTimeString('en-US', { hour12: false }), level: 'INFO', text: 'Connecting to console...' }
  ])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const socketRef = useRef(null)
  const logsEndRef = useRef(null)
  // Track the length of the last HTTP response so we only append new lines
  const lastHttpLengthRef = useRef(0)

  const now = () => new Date().toLocaleTimeString('en-US', { hour12: false })

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // --- HTTP Polling: Always fetch console history and append NEW lines only ---
  const fetchConsoleHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${id}/console`, {
        headers: getAuthHeaders()
      })
      if (!res.ok) return
      const data = await res.json()
      if (!data.logs) return

      const fullText = data.logs
      const currentLength = fullText.length

      // First fetch — load everything
      if (lastHttpLengthRef.current === 0 && currentLength > 0) {
        lastHttpLengthRef.current = currentLength
        const lines = fullText.split('\n').filter(l => l.trim() !== '')
        if (lines.length > 0) {
          const historyLogs = lines.map(line => parseLogLine(line, ''))
          setLogs(prev => {
            // Only seed if we have very few logs (initial state)
            if (prev.length <= 2) {
              return [
                { id: 0, time: now(), level: 'INFO', text: `Console history loaded (${lines.length} lines).` },
                ...historyLogs
              ].slice(-MAX_LOGS)
            }
            return prev
          })
        }
        return
      }

      // Subsequent fetches — only append the NEW portion
      if (currentLength > lastHttpLengthRef.current) {
        const newText = fullText.substring(lastHttpLengthRef.current)
        lastHttpLengthRef.current = currentLength
        const newLines = newText.split('\n').filter(l => l.trim() !== '')
        if (newLines.length > 0) {
          const newLogs = newLines.map(line => parseLogLine(line, now()))
          setLogs(prev => [...prev, ...newLogs].slice(-MAX_LOGS))
        }
      }
    } catch {
      // Silently fail — HTTP is best-effort
    }
  }, [id, getAuthHeaders])

  // Fetch history on mount
  useEffect(() => {
    fetchConsoleHistory()
  }, [fetchConsoleHistory])

  // Always poll HTTP every 8 seconds — this catches stderr logs that
  // Socket.IO relay might miss (Paper MC uses Log4J2 → stderr after boot)
  useEffect(() => {
    const interval = setInterval(fetchConsoleHistory, 8000)
    return () => clearInterval(interval)
  }, [fetchConsoleHistory])

  // --- Socket.IO: Real-time streaming (supplements HTTP polling) ---
  useEffect(() => {
    let isFirstConnect = true

    const newSocket = io('/', {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 10000,
    })
    socketRef.current = newSocket

    newSocket.on('connect', () => {
      setConnected(true)
      newSocket.emit('join-server', id)

      if (isFirstConnect) {
        isFirstConnect = false
        setLogs(prev => {
          // If we already loaded HTTP history, don't wipe it
          if (prev.length > 2) {
            return [...prev.slice(-MAX_LOGS), {
              id: Date.now(),
              time: now(),
              level: 'INFO',
              text: 'Live console feed connected.'
            }]
          }
          return [{
            id: Date.now(),
            time: now(),
            level: 'INFO',
            text: 'Connected to live console feed. Loading history...'
          }]
        })
      } else {
        setLogs(prev => [...prev.slice(-MAX_LOGS), {
          id: Date.now() + Math.random(),
          time: now(),
          level: 'INFO',
          text: 'Reconnected to console feed.'
        }])
      }
    })

    newSocket.on('connect_error', () => {
      setConnected(false)
    })

    newSocket.on('disconnect', (reason) => {
      setConnected(false)
      setLogs(prev => [...prev.slice(-MAX_LOGS), {
        id: Date.now() + Math.random(),
        time: now(),
        level: 'WARN',
        text: `Disconnected: ${reason}. Reconnecting...`
      }])
    })

    // Socket.IO console-history is also handled — if it arrives, it supplements HTTP data
    newSocket.on('console-history', (historyString) => {
      const lines = historyString.split('\n').filter(line => line.trim() !== '')
      const historyLogs = lines.map(line => parseLogLine(line, ''))
      setLogs(prev => {
        // Only replace if Socket.IO history is richer than what we have
        if (historyLogs.length > prev.length) {
          return historyLogs.slice(-MAX_LOGS)
        }
        return prev
      })
    })

    newSocket.on('console-log', (data) => {
      const lines = data.split('\n').filter(line => line.trim() !== '')
      lines.forEach(line => {
        setLogs(prev => [...prev.slice(-MAX_LOGS), parseLogLine(line, now())])
      })
    })

    newSocket.on('console-error', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim() !== '')
      lines.forEach(line => {
        setLogs(prev => [...prev.slice(-MAX_LOGS), parseLogLine(line, now())])
      })
    })

    newSocket.on('status-update', (status) => {
      setLogs(prev => [...prev.slice(-MAX_LOGS), {
        id: Date.now() + Math.random(),
        time: now(),
        level: 'INFO',
        text: `[System] Server status changed to: ${status}`
      }])
    })

    return () => {
      try { newSocket.close() } catch { /* ignore */ }
      socketRef.current = null
    }
  }, [id])

  const handleCommandSubmit = (e) => {
    e.preventDefault()
    if (!input.trim() || !socketRef.current) return

    setLogs(prev => [...prev, {
      id: Date.now(),
      time: now(),
      level: 'INPUT',
      text: `> ${input}`
    }])

    socketRef.current.emit('send-command', { serverId: id, command: input })
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
        <div className={`console-badge badge ${connected ? 'badge-success' : 'badge-neutral'}`} style={connected ? { backgroundColor: 'var(--success-color)', color: '#000', border: 'none' } : {}}>
          {connected ? <><Wifi size={12} /> Connected</> : <><WifiOff size={12} /> Connecting...</>}
        </div>
      </div>
      
      <div className="console-window">
        {logs.map((log) => (
          <div key={log.id} className="console-line">
            {log.level === 'INPUT' ? (
              <span className="console-text input-text">{log.text}</span>
            ) : (
              <>
                {log.time && <span className="console-time">[{log.time}]</span>}
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
