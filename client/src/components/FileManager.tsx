"use client";
import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  Folder, FileText, Save, ArrowUp, AlertCircle, Loader2,
  Trash2, Plus, Edit3, Download, Upload, FolderPlus, MoreVertical
} from 'lucide-react';
import { api } from '@/lib/api';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-muted">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading editor…
    </div>
  )
});

interface FileManagerProps {
  vpsId: string;
  className?: string;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg',
  'mp3', 'mp4', 'avi', 'mkv', 'mov', 'wav', 'flac',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'exe', 'dll', 'so', 'dylib', 'bin',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'sqlite', 'db', 'pyc', 'pyo', 'class', 'o'
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return BINARY_EXTENSIONS.has(ext);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileManager({ vpsId, className }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState('/root');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true); // start true
  const [loadingContent, setLoadingContent] = useState(true); // start true on mount
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: any } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [createModal, setCreateModal] = useState<{ type: 'file' | 'directory' } | null>(null);
  const [createName, setCreateName] = useState('');
  const [binaryWarning, setBinaryWarning] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath]);

  useEffect(() => {
    // After initial load completes, mark content loader off
    const t = setTimeout(() => setLoadingContent(false), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const fetchFiles = async (path: string) => {
    setLoadingFiles(true);
    setError(null);
    try {
      const data = await api<any>(`/api/vps/${vpsId}/files?path=${encodeURIComponent(path)}`);
      if (data.success) {
        setFiles(data.files || []);
      } else {
        throw new Error(data.error || 'Failed to list files');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load directory');
      setFiles([]);
    }
    setLoadingFiles(false);
  };

  const openFile = async (fileName: string) => {
    if (isBinaryFile(fileName)) {
      setBinaryWarning(fileName);
      return;
    }
    const fullPath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
    setLoadingContent(true);
    setError(null);
    try {
      const data = await api<any>(`/api/vps/${vpsId}/file?path=${encodeURIComponent(fullPath)}`);
      if (data.success) {
        setSelectedFile(fullPath);
        setFileContent(data.content);
      } else {
        throw new Error(data.error || 'Failed to read file');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to read file');
    }
    setLoadingContent(false);
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/vps/${vpsId}/file`, {
        method: 'PUT',
        json: { path: selectedFile, content: fileContent }
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to save file');
    }
    setSaving(false);
  };

  const deleteItem = async (filePath: string, isDir: boolean) => {
    const name = filePath.split('/').pop();
    if (!confirm(`Delete "${name}"${isDir ? ' and all its contents' : ''}?`)) return;
    try {
      await api(`/api/vps/${vpsId}/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
      if (selectedFile === filePath) {
        setSelectedFile(null);
        setFileContent('');
      }
      fetchFiles(currentPath);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete');
    }
  };

  const createItem = async () => {
    if (!createName.trim() || !createModal) return;
    const fullPath = currentPath === '/' ? `/${createName}` : `${currentPath}/${createName}`;
    try {
      await api(`/api/vps/${vpsId}/files`, {
        method: 'POST',
        json: { path: fullPath, type: createModal.type }
      });
      setCreateModal(null);
      setCreateName('');
      fetchFiles(currentPath);
    } catch (err: any) {
      setError(err?.message || 'Failed to create');
    }
  };

  const renameItem = async (oldPath: string) => {
    if (!renameValue.trim()) return;
    const parentDir = oldPath.split('/').slice(0, -1).join('/') || '/';
    const newPath = parentDir === '/' ? `/${renameValue}` : `${parentDir}/${renameValue}`;
    try {
      await api(`/api/vps/${vpsId}/files`, {
        method: 'PATCH',
        json: { oldPath, newPath }
      });
      if (selectedFile === oldPath) {
        setSelectedFile(newPath);
      }
      setRenaming(null);
      fetchFiles(currentPath);
    } catch (err: any) {
      setError(err?.message || 'Failed to rename');
    }
  };

  const downloadFile = (filePath: string) => {
    const a = document.createElement('a');
    a.download = filePath.split('/').pop() || 'file';
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const url = `${API_BASE}/api/vps/${vpsId}/file/download?path=${encodeURIComponent(filePath)}`;
    a.href = url;
    fetch(url, { credentials: 'include' })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => setError('Failed to download file'));
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = reader.result as string;
      const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      try {
        await api(`/api/vps/${vpsId}/file`, {
          method: 'PUT',
          json: { path: fullPath, content }
        });
        fetchFiles(currentPath);
      } catch (err: any) {
        setError(err?.message || 'Failed to upload file');
      }
    };
    reader.readAsText(file);
    if (uploadRef.current) uploadRef.current.value = '';
  };

  const navigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parent);
    setSelectedFile(null);
  };

  const handleContextMenu = (e: React.MouseEvent, file: any) => {
    e.preventDefault();
    e.stopPropagation();
    const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    setContextMenu({ x: e.clientX, y: e.clientY, file: { ...file, fullPath } });
  };

  return (
    <div className={`${className || 'flex h-full'} overflow-hidden`}>
      <input ref={uploadRef} type="file" className="hidden" onChange={uploadFile} />

      <div className="w-1/3 border-r border-border-DEFAULT p-2 flex flex-col bg-neutral-bg1/50 min-h-0 overflow-hidden">
        <div className="px-3 py-2 text-xs font-mono text-text-secondary bg-neutral-bg2 rounded-lg border border-border-subtle mb-2 flex items-center gap-2">
          <span className="truncate flex-1">{currentPath}</span>
          <button onClick={navigateUp} className="text-text-muted hover:text-text-primary shrink-0" title="Go up">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex gap-1 mb-2">
          <button onClick={() => setCreateModal({ type: 'file' })} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary hover:text-text-primary rounded-lg border border-border-subtle transition-colors" title="New File">
            <Plus className="w-3 h-3" /> File
          </button>
          <button onClick={() => setCreateModal({ type: 'directory' })} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary hover:text-text-primary rounded-lg border border-border-subtle transition-colors" title="New Folder">
            <FolderPlus className="w-3 h-3" /> Folder
          </button>
          <button onClick={() => uploadRef.current?.click()} className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-neutral-bg2 hover:bg-neutral-bg3 text-text-secondary hover:text-text-primary rounded-lg border border-border-subtle transition-colors" title="Upload File">
            <Upload className="w-3 h-3" /> Upload
          </button>
        </div>

        {error && (
          <div className="mb-2 p-2 bg-status-error/10 border border-status-error/20 rounded-lg text-xs text-status-error flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-all flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-status-error/60 hover:text-status-error shrink-0">&times;</button>
          </div>
        )}

        {binaryWarning && (
          <div className="mb-2 p-2 bg-status-warning/10 border border-status-warning/20 rounded-lg text-xs text-status-warning flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">"{binaryWarning}" is a binary file and cannot be edited as text. You can download it instead.</span>
            <button onClick={() => { setBinaryWarning(null); }} className="text-status-warning/60 hover:text-status-warning shrink-0">&times;</button>
          </div>
        )}

        {createModal && (
          <div className="mb-2 p-2 bg-neutral-bg2 border border-brand/30 rounded-lg">
            <div className="text-xs font-medium text-text-primary mb-1.5">New {createModal.type === 'file' ? 'File' : 'Folder'}</div>
            <div className="flex gap-1">
              <input
                type="text"
                autoFocus
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createItem(); if (e.key === 'Escape') { setCreateModal(null); setCreateName(''); } }}
                placeholder={createModal.type === 'file' ? 'filename.txt' : 'folder-name'}
                className="flex-1 px-2 py-1 text-xs bg-neutral-bg1 border border-border-DEFAULT rounded text-text-primary focus:outline-none focus:border-brand"
              />
              <button onClick={createItem} className="px-2 py-1 text-xs bg-brand text-white rounded hover:bg-brand-hover">OK</button>
              <button onClick={() => { setCreateModal(null); setCreateName(''); }} className="px-2 py-1 text-xs bg-neutral-bg3 text-text-secondary rounded hover:bg-neutral-bg4">X</button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
          {currentPath !== '/' && !createModal && (
            <div
              className="flex items-center gap-2 p-2 hover:bg-neutral-bg3 rounded-lg cursor-pointer text-sm text-text-primary transition-colors"
              onClick={navigateUp}
            >
              <Folder className="w-4 h-4 text-brand-light" />
              ..
            </div>
          )}
          {loadingFiles ? (
            <div className="flex items-center justify-center py-8 text-text-muted">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-xs">Loading...</span>
            </div>
          ) : (
            files.map(f => {
              const fullPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
              const isSelected = selectedFile === fullPath;
              const isRenamingNow = renaming === fullPath;
              return (
                <div
                  key={f.name}
                  className={`group flex justify-between items-center p-2 rounded-lg cursor-pointer text-sm transition-colors ${
                    isSelected ? 'bg-brand/20 text-brand-light' : 'hover:bg-neutral-bg3 text-text-primary'
                  }`}
                  onClick={() => {
                    if (isRenamingNow) return;
                    f.isDir ? setCurrentPath(fullPath) : openFile(f.name);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, f)}
                >
                  {isRenamingNow ? (
                    <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameItem(fullPath); if (e.key === 'Escape') setRenaming(null); }}
                        onBlur={() => renameItem(fullPath)}
                        className="flex-1 px-1 py-0.5 text-xs bg-neutral-bg1 border border-brand rounded text-text-primary focus:outline-none"
                      />
                    </div>
                  ) : (
                    <>
                      <span className="flex items-center gap-2 truncate">
                        {f.isDir
                          ? <Folder className="w-4 h-4 text-dataviz-blue shrink-0" />
                          : <FileText className="w-4 h-4 text-text-muted shrink-0" />
                        }
                        <span className="truncate">{f.name}</span>
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!f.isDir && (
                          <span className="text-xs text-text-muted shrink-0 mr-1">{formatBytes(f.size)}</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleContextMenu(e, f); }}
                          className="p-0.5 hover:bg-neutral-bg4 rounded"
                        >
                          <MoreVertical className="w-3 h-3 text-text-muted" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-neutral-bg2 border border-border-DEFAULT rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {!contextMenu.file.isDir && (
            <button
              className="w-full px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-bg3 flex items-center gap-2 transition-colors"
              onClick={() => { downloadFile(contextMenu.file.fullPath); setContextMenu(null); }}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          )}
          <button
            className="w-full px-3 py-1.5 text-xs text-text-primary hover:bg-neutral-bg3 flex items-center gap-2 transition-colors"
            onClick={() => {
              setRenaming(contextMenu.file.fullPath);
              setRenameValue(contextMenu.file.name);
              setContextMenu(null);
            }}
          >
            <Edit3 className="w-3.5 h-3.5" /> Rename
          </button>
          <button
            className="w-full px-3 py-1.5 text-xs text-status-error hover:bg-status-error/10 flex items-center gap-2 transition-colors"
            onClick={() => { deleteItem(contextMenu.file.fullPath, contextMenu.file.isDir); setContextMenu(null); }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      <div className="w-2/3 flex flex-col min-h-0 overflow-hidden">
        {selectedFile ? (
          <>
            <div className="px-4 py-2 border-b border-border-DEFAULT flex justify-between items-center bg-neutral-bg2/50">
              <span className="text-sm font-mono text-text-primary truncate mr-4">{selectedFile}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadFile(selectedFile)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-bg3 hover:bg-neutral-bg4 rounded-lg text-xs font-medium text-text-primary transition-colors border border-border-subtle"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={saveFile}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors shadow-glow"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {loadingContent ? (
                <div className="flex items-center justify-center h-full text-text-muted">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-sm">Loading file...</span>
                </div>
              ) : (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  value={fileContent}
                  onChange={(val) => setFileContent(val || '')}
                  options={{
                    minimap: { enabled: false },
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: 13,
                    padding: { top: 16 }
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            {loadingContent ? (
              <>
                <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                <span className="text-sm">Initializing file manager…</span>
              </>
            ) : (
              <>
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                Select a file to edit
                <span className="text-xs mt-1">Right-click for more options</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
