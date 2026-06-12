"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      if (isRegister) {
        setMsg('Registration successful. Waiting for admin approval.');
        setIsRegister(false);
        setPassword('');
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>
      
      <div className="w-full max-w-md p-8 bg-zinc-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl z-10">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-2xl shadow-lg shadow-indigo-500/20">V</div>
        </div>
        <h1 className="text-2xl font-bold mb-2 text-center text-white tracking-tight">Welcome Back</h1>
        <h2 className="text-sm text-zinc-400 mb-8 text-center">{isRegister ? 'Register (Requires Admin Approval)' : 'Enter your credentials to access your dashboard.'}</h2>
        
        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">{error}</div>}
        {msg && <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl">{msg}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white" 
              value={email} onChange={(e) => setEmail(e.target.value)} required
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Password</label>
            <input 
              type="password" 
              className="w-full p-3 rounded-xl bg-black/40 border border-white/10 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-white" 
              value={password} onChange={(e) => setPassword(e.target.value)} required
              placeholder="••••••••"
            />
          </div>
          <button className="w-full p-3 bg-white text-black hover:bg-zinc-200 transition-colors font-medium rounded-xl mt-2">
            {isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>
        <p className="mt-8 text-sm text-center text-zinc-500">
          {isRegister ? 'Already have an account? ' : 'Need an account? '}
          <button onClick={() => { setIsRegister(!isRegister); setError(''); setMsg(''); }} className="text-white hover:text-indigo-400 font-medium transition-colors">
            {isRegister ? 'Sign In' : 'Request Access'}
          </button>
        </p>
      </div>
    </div>
  );
}
