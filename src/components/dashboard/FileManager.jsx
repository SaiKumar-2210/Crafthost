import { Folder, File, MoreVertical, Edit2, Download, Trash2, Upload } from 'lucide-react'
import './FileManager.css'

const files = [
  { name: 'plugins', type: 'folder', size: '--', modified: '2 days ago' },
  { name: 'world', type: 'folder', size: '245 MB', modified: 'Just now' },
  { name: 'world_nether', type: 'folder', size: '42 MB', modified: 'Just now' },
  { name: 'world_the_end', type: 'folder', size: '12 MB', modified: '1 hour ago' },
  { name: 'server.properties', type: 'file', size: '1.2 KB', modified: '3 days ago' },
  { name: 'banned-players.json', type: 'file', size: '45 B', modified: '1 week ago' },
  { name: 'ops.json', type: 'file', size: '128 B', modified: '2 weeks ago' },
  { name: 'spigot.yml', type: 'file', size: '4.5 KB', modified: '1 month ago' },
]

export default function FileManager() {
  return (
    <div className="file-manager card">
      <div className="file-manager-header">
        <div className="breadcrumbs">
          <span className="crumb crumb-active">/ (root)</span>
        </div>
        <div className="file-actions">
          <button className="btn btn-secondary btn-sm">
            <Folder size={14} />
            <span>New Folder</span>
          </button>
          <button className="btn btn-primary btn-sm">
            <Upload size={14} />
            <span>Upload File</span>
          </button>
        </div>
      </div>

      <div className="file-list-container">
        <table className="file-table">
          <thead>
            <tr>
              <th className="col-name">Name</th>
              <th className="col-size">Size</th>
              <th className="col-modified">Last Modified</th>
              <th className="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, i) => (
              <tr key={i} className="file-row">
                <td className="col-name">
                  <div className="file-name-cell">
                    {file.type === 'folder' ? (
                      <Folder size={18} className="icon-folder" />
                    ) : (
                      <File size={18} className="icon-file" />
                    )}
                    <span>{file.name}</span>
                  </div>
                </td>
                <td className="col-size">{file.size}</td>
                <td className="col-modified">{file.modified}</td>
                <td className="col-actions">
                  <button className="btn-icon btn-ghost btn-xs" title="Edit">
                    <Edit2 size={14} />
                  </button>
                  <button className="btn-icon btn-ghost btn-xs" title="Download">
                    <Download size={14} />
                  </button>
                  <button className="btn-icon btn-ghost btn-xs text-danger" title="Delete">
                    <Trash2 size={14} />
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
