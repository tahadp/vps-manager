"use client";
import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Folder, FileText, Save, ArrowUp } from 'lucide-react';

interface FileManagerProps {
  vpsId: string;
  className?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

function getAuthToken(): string {
  return typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
}

export default function FileManager({ vpsId, className }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath]);

  const fetchFiles = async (path: string) => {
    try {
      const res = await fetch(`${API_URL}/api/vps/${vpsId}/files?path=${encodeURIComponent(path)}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to list files:', err);
    }
  };

  const openFile = async (fileName: string) => {
    const fullPath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
    try {
      const res = await fetch(`${API_URL}/api/vps/${vpsId}/file?path=${encodeURIComponent(fullPath)}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedFile(fullPath);
        setFileContent(data.content);
      }
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/vps/${vpsId}/file`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: selectedFile, content: fileContent })
      });
    } catch (err) {
      console.error('Failed to save file:', err);
    }
    setSaving(false);
  };

  const navigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parent);
    setSelectedFile(null);
  };

  return (
    <div className={className || 'flex h-full'}>
      {/* File Tree */}
      <div className="w-1/3 border-r border-border-DEFAULT p-2 flex flex-col bg-neutral-bg1/50">
        <div className="px-3 py-2 text-xs font-mono text-text-secondary bg-neutral-bg2 rounded-lg border border-border-subtle mb-2 flex items-center gap-2">
          <span className="truncate flex-1">{currentPath}</span>
          {currentPath !== '/' && (
            <button onClick={navigateUp} className="text-text-muted hover:text-text-primary shrink-0">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {currentPath !== '/' && (
            <div
              className="flex items-center gap-2 p-2 hover:bg-neutral-bg3 rounded-lg cursor-pointer text-sm text-text-primary transition-colors"
              onClick={navigateUp}
            >
              <Folder className="w-4 h-4 text-brand-light" />
              ..
            </div>
          )}
          {files.map(f => {
            const fullPath = currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`;
            const isSelected = selectedFile === fullPath;
            return (
              <div
                key={f.name}
                className={`flex justify-between items-center p-2 rounded-lg cursor-pointer text-sm transition-colors ${
                  isSelected ? 'bg-brand/20 text-brand-light' : 'hover:bg-neutral-bg3 text-text-primary'
                }`}
                onClick={() => f.isDir
                  ? setCurrentPath(fullPath)
                  : openFile(f.name)
                }
              >
                <span className="flex items-center gap-2 truncate">
                  {f.isDir
                    ? <Folder className="w-4 h-4 text-dataviz-blue shrink-0" />
                    : <FileText className="w-4 h-4 text-text-muted shrink-0" />
                  }
                  <span className="truncate">{f.name}</span>
                </span>
                {!f.isDir && (
                  <span className="text-xs text-text-muted shrink-0 ml-2">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="w-2/3 flex flex-col">
        {selectedFile ? (
          <>
            <div className="px-4 py-2 border-b border-border-DEFAULT flex justify-between items-center bg-neutral-bg2/50">
              <span className="text-sm font-mono text-text-primary truncate mr-4">{selectedFile}</span>
              <button
                onClick={saveFile}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors shadow-glow"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="flex-1">
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
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <FileText className="w-12 h-12 mb-3 opacity-20" />
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  );
}
