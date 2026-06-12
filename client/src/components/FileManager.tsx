"use client";
import React, { useState } from 'react';
import Editor from '@monaco-editor/react';

export default function FileManager({ vpsId }: { vpsId: string }) {
  const [code, setCode] = useState('// Select a file to view or edit');
  const [filePath, setFilePath] = useState('/etc/nginx/nginx.conf');

  const handleSave = () => {
    console.log("Saving file:", filePath, "on VPS:", vpsId);
    // TODO: Send to backend
  };

  return (
    <div className="h-96 border border-gray-700 mt-4 rounded overflow-hidden flex flex-col">
      <div className="bg-gray-800 p-2 flex justify-between items-center">
        <input 
          className="bg-gray-900 px-3 py-1 text-sm w-2/3 rounded border border-gray-700 text-white focus:outline-none" 
          value={filePath} 
          onChange={(e) => setFilePath(e.target.value)} 
          placeholder="Path to file..."
        />
        <button className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded text-sm text-white font-semibold transition" onClick={handleSave}>
          Kaydet
        </button>
      </div>
      <Editor
        height="100%"
        theme="vs-dark"
        path={filePath}
        defaultLanguage="shell"
        value={code}
        onChange={(val) => setCode(val || '')}
        options={{ minimap: { enabled: false }, fontSize: 14 }}
      />
    </div>
  );
}
