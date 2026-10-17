import { HardDrive, Download, Trash2, Clock } from 'lucide-react'
import './BackupsSection.css'

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
        <button type="button" className="btn btn-primary btn-sm">Create Backup</button>
      </div>
      
      <div className="card backups-table-wrap">
        <table className="backups-table">
          <thead>
            <tr>
              <th>File Name</th>
              <th>Server</th>
              <th>Size</th>
              <th>Created</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id}>
                <td>
                  <div className="backup-name">
                    <HardDrive size={16} className="text-accent" />
                    <span>{backup.name}</span>
                  </div>
                </td>
                <td>{backup.server}</td>
                <td>{backup.size}</td>
                <td>
                  <div className="backup-date">
                    <Clock size={14} />
                    <span>{backup.date}</span>
                  </div>
                </td>
                <td className="td-actions">
                  <div className="backup-actions">
                    <button type="button" className="btn-icon btn-ghost btn-xs" title="Download">
                      <Download size={14} />
                    </button>
                    <button type="button" className="btn-icon btn-ghost btn-xs text-danger" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {backups.length === 0 && (
          <div className="backups-empty">
            <HardDrive size={32} />
            <p>No backups found. Create one from your server dashboard.</p>
          </div>
        )}
      </div>
    </div>
  )
}
