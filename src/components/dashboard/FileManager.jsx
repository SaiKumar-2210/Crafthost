import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Folder, File, Edit2, Download, Trash2, Upload, CornerLeftUp, X, Save } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import './FileManager.css'

export default function FileManager() {
  const { id } = useParams()
  const { getAuthHeaders, API_BASE } = useApp()
  
  const [files, setFiles] = useState([])
  const [currentPath, setCurrentPath] = useState('/')
  const [loading, setLoading] = useState(true)
  
  // Editor State
  const [editingFile, setEditingFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [saving, setSaving] = useState(false)
  
  const fileInputRef = useRef(null)

  const fetchFiles = async (targetPath = currentPath) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/files?path=${encodeURIComponent(targetPath)}`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
        setCurrentPath(targetPath)
      }
    } catch (err) {
      console.error("Failed fetching files", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles('/')
  }, [id])

  const handleItemClick = (file) => {
    if (file.type === 'folder') {
      const newPath = currentPath.endsWith('/') ? `${currentPath}${file.name}` : `${currentPath}/${file.name}`
      fetchFiles(newPath)
    }
  }

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    fetchFiles(parts.length ? '/' + parts.join('/') : '/')
  }

  const deleteFile = async (e, fileName) => {
    e.stopPropagation();
    if (!confirm(`Delete ${fileName}?`)) return;
    const target = currentPath.endsWith('/') ? `${currentPath}${fileName}` : `${currentPath}/${fileName}`
    try {
      await fetch(`${API_BASE}/servers/${id}/files?path=${encodeURIComponent(target)}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      fetchFiles()
    } catch (err) {
      console.error(err)
    }
  }

  const openEditor = async (e, fileName) => {
    e.stopPropagation();
    const target = currentPath.endsWith('/') ? `${currentPath}${fileName}` : `${currentPath}/${fileName}`
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/files/content?path=${encodeURIComponent(target)}`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (res.ok) {
        setEditingFile(target)
        setFileContent(data.content || '')
      } else {
        alert("Cannot read this file (might be binary)")
      }
    } catch (err) {
      console.error(err)
    }
  }

  const saveFile = async () => {
    setSaving(true)
    try {
      await fetch(`${API_BASE}/servers/${id}/files/content`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ path: editingFile, content: fileContent })
      })
      setEditingFile(null)
    } catch (err) {
      alert("Save failed")
    } finally {
      setSaving(false)
    }
  }

  const uploadFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return;

    const formData = new FormData()
    formData.append('file', file)

    try {
      await fetch(`${API_BASE}/servers/${id}/files/upload?path=${encodeURIComponent(currentPath)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('crafthost_token')}` },
        body: formData
      })
      fetchFiles()
    } catch (err) {
      console.error(err)
      alert("Upload failed")
    }
  }

  const downloadFolder = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/servers/${id}/files/download?path=${encodeURIComponent(currentPath)}`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        
        // intelligently name the zip file
        const safeName = currentPath === '/' ? 'server-backup' : currentPath.split('/').filter(Boolean).pop()
        a.download = `${safeName}.zip`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        alert("Download failed on backend.")
      }
    } catch (err) {
      console.error(err)
      alert("Download failed")
    } finally {
      setLoading(false)
    }
  }

  if (editingFile) {
    return (
      <div className="file-manager card file-editor">
        <div className="file-manager-header">
          <div className="breadcrumbs">
            <span className="crumb crumb-active">Editing: {editingFile}</span>
          </div>
          <div className="file-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingFile(null)}>
              <X size={14} /> Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveFile} disabled={saving}>
              <Save size={14} /> {saving ? 'Saving...' : 'Save File'}
            </button>
          </div>
        </div>
        <textarea 
          className="code-editor-textarea"
          value={fileContent}
          onChange={e => setFileContent(e.target.value)}
          spellCheck="false"
          style={{ height: '75vh', width: '100%', padding: '16px', fontFamily: "'Fira Code', 'Courier New', monospace", backgroundColor: '#1e1e1e', color: '#d4d4d4', border: '1px solid #333', borderRadius: '4px', resize: 'none', outline: 'none', lineHeight: '1.5' }}
        />
      </div>
    )
  }

  return (
    <div className="file-manager card">
      <div className="file-manager-header">
        <div className="breadcrumbs">
          <span className="crumb crumb-active">{currentPath}</span>
        </div>
        <div className="file-actions">
          <button className="btn btn-secondary btn-sm" onClick={downloadFolder} disabled={loading}>
            <Download size={14} />
            <span>{loading ? 'Zipping...' : 'Download ZIP'}</span>
          </button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={uploadFile} />
          <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
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
            {currentPath !== '/' && currentPath !== '' && (
              <tr className="file-row cursor-pointer" onClick={navigateUp}>
                <td className="col-name">
                  <div className="file-name-cell">
                    <CornerLeftUp size={18} className="icon-folder" />
                    <span>..</span>
                  </div>
                </td>
                <td className="col-size"></td>
                <td className="col-modified"></td>
                <td className="col-actions"></td>
              </tr>
            )}
            
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>Loading files...</td></tr>
            ) : files.map((file, i) => (
              <tr key={i} className="file-row" onClick={() => handleItemClick(file)} style={{ cursor: file.type === 'folder' ? 'pointer' : 'default' }}>
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
                  {file.type === 'file' && (
                    <button className="btn-icon btn-ghost btn-xs" title="Edit" onClick={(e) => openEditor(e, file.name)}>
                      <Edit2 size={14} />
                    </button>
                  )}
                  <button className="btn-icon btn-ghost btn-xs text-danger" title="Delete" onClick={(e) => deleteFile(e, file.name)}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {files.length === 0 && !loading && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Empty directory</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
