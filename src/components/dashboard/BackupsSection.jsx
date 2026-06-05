import { HardDrive, Download, Trash2, Clock } from 'lucide-react'

export default function BackupsSection() {
  // Placeholder data for backups
  const backups = [
    { id: 1, name: 'survival-world-pre-dragon.zip', size: '245 MB', date: 'Just now', server: 'Vanilla SMP' },
    { id: 2, name: 'backup-auto-2026-06-04.zip', size: '240 MB', date: 'Yesterday', server: 'Vanilla SMP' },
    { id: 3, name: 'modpack-initial-state.tar.gz', size: '1.2 GB', date: 'Last week', server: 'Forge Modpack' },
  ]

  return (
    <div className="servers-section">
      <div className="section-header-compact">
        <h2 className="section-title-sm">My Backups</h2>
        <button className="btn btn-primary btn-sm">Create Backup</button>
      </div>
      
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-elevated)' }}>
              <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>File Name</th>
              <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Server</th>
              <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Size</th>
              <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Created</th>
              <th style={{ padding: '1rem', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <td style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <HardDrive size={16} className="text-accent" />
                  <span style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{backup.name}</span>
                </td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{backup.server}</td>
                <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{backup.size}</td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-secondary)' }}>
                    <Clock size={14} />
                    <span>{backup.date}</span>
                  </div>
                </td>
                <td style={{ padding: '1rem', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn-icon btn-ghost btn-xs" title="Download">
                      <Download size={14} />
                    </button>
                    <button className="btn-icon btn-ghost btn-xs text-danger" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {backups.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <HardDrive size={32} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <p>No backups found. Create one from your server dashboard.</p>
          </div>
        )}
      </div>
    </div>
  )
}
