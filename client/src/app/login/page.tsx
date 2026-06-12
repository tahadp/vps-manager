"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call to Node.js backend
    console.log(isRegister ? "Registering" : "Logging in", email, password);
    router.push('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded shadow">
        <h1 className="text-2xl font-bold mb-6 text-center">VPS Management</h1>
        <h2 className="text-md text-gray-400 mb-6 text-center">{isRegister ? 'Register (Requires Admin Approval)' : 'Login'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input 
              type="email" 
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500" 
              value={email} onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input 
              type="password" 
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-blue-500" 
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>
          <button className="w-full p-2 bg-blue-600 rounded hover:bg-blue-500 transition font-bold">
            {isRegister ? 'Create Account' : 'Login'}
          </button>
        </form>
        <p className="mt-4 text-sm text-center text-gray-400">
          {isRegister ? 'Already have an account? ' : 'Need an account? '}
          <button onClick={() => setIsRegister(!isRegister)} className="text-blue-400 hover:underline">
            {isRegister ? 'Login here' : 'Register here'}
          </button>
        </p>
      </div>
    </div>
  );
}
