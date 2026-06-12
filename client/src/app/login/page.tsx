"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ShieldCheck, ArrowRight, Server, TerminalSquare, AlertCircle } from 'lucide-react';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState(''); // for register
  const [username, setUsername] = useState(''); // for register
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false); // Email verification stub
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    
    // Email verification stub check
    if (isRegister && !isVerifying) {
      setIsVerifying(true);
      setMsg('Check your email to verify your account.');
      return;
    }

    try {
      const payload = isRegister 
        ? { email, username, password } 
        : { identifier, password, rememberMe };
        
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setIsVerifying(false); // Reset stub
        return;
      }

      if (isRegister) {
        setMsg('Registration successful. Waiting for admin approval.');
        setIsRegister(false);
        setIsVerifying(false);
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
    <div className="flex min-h-screen bg-neutral-bg1 font-sans relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-brand-subtle blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-dataviz-blue/10 blur-[120px] rounded-full pointer-events-none" />
      
      {/* Left pane: Branding / Graphic */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-dataviz-blue flex items-center justify-center shadow-glow">
            <Server className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-text-primary tracking-tight">VPS Manager</span>
        </div>
        
        <div className="mb-20">
          <h1 className="text-5xl font-bold text-text-primary leading-tight mb-6">
            Command your infrastructure <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-dataviz-blue">with precision.</span>
          </h1>
          <p className="text-text-secondary text-lg max-w-md leading-relaxed">
            A high-performance management console built for speed, security, and effortless control of your virtual private servers.
          </p>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-text-muted">
          <TerminalSquare className="w-4 h-4" />
          <span>System v2.0.4 — Secure connection established</span>
        </div>
      </div>

      {/* Right pane: Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[440px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-dataviz-blue flex items-center justify-center shadow-glow">
              <Server className="text-white w-5 h-5" />
            </div>
            <span className="text-2xl font-bold text-text-primary tracking-tight">VPS Manager</span>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-neutral-bg2/80 backdrop-blur-xl border border-border-subtle rounded-3xl p-8 shadow-2xl"
          >
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {isRegister ? 'Create an account' : 'Welcome back'}
              </h2>
              <p className="text-text-secondary text-sm">
                {isRegister 
                  ? 'Enter your details to request access to the platform.' 
                  : 'Enter your credentials to access your dashboard.'}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-status-error/10 border border-status-error/20 rounded-xl flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 text-status-error shrink-0 mt-0.5" />
                  <span className="text-sm text-status-error">{error}</span>
                </motion.div>
              )}
              {msg && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-6 p-4 bg-status-success/10 border border-status-success/20 rounded-xl flex items-start gap-3"
                >
                  <ShieldCheck className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
                  <span className="text-sm text-status-success">{msg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5">
              {!isRegister ? (
                // Login Fields
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Email or Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <User className="w-4 h-4 text-text-muted" />
                      </div>
                      <input 
                        type="text" 
                        value={identifier} 
                        onChange={(e) => setIdentifier(e.target.value)} 
                        required
                        className="w-full pl-10 p-3 bg-neutral-bg1 border border-border-DEFAULT rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
                        placeholder="admin or name@company.com"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Password</label>
                      <button type="button" className="text-xs text-brand hover:text-brand-light transition-colors">
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-text-muted" />
                      </div>
                      <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required
                        className="w-full pl-10 p-3 bg-neutral-bg1 border border-border-DEFAULT rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input 
                      type="checkbox" 
                      id="remember" 
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-border-DEFAULT bg-neutral-bg1 text-brand focus:ring-brand focus:ring-offset-neutral-bg2 transition-colors cursor-pointer"
                    />
                    <label htmlFor="remember" className="text-sm text-text-secondary cursor-pointer select-none">
                      Remember me for 30 days
                    </label>
                  </div>
                </>
              ) : (
                // Register Fields
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <User className="w-4 h-4 text-text-muted" />
                      </div>
                      <input 
                        type="text" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required
                        disabled={isVerifying}
                        className="w-full pl-10 p-3 bg-neutral-bg1 border border-border-DEFAULT rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                        placeholder="johndoe"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Email Address</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Mail className="w-4 h-4 text-text-muted" />
                      </div>
                      <input 
                        type="email" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required
                        disabled={isVerifying}
                        className="w-full pl-10 p-3 bg-neutral-bg1 border border-border-DEFAULT rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                        placeholder="name@company.com"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="w-4 h-4 text-text-muted" />
                      </div>
                      <input 
                        type="password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required
                        disabled={isVerifying}
                        className="w-full pl-10 p-3 bg-neutral-bg1 border border-border-DEFAULT rounded-xl text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all disabled:opacity-50"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </>
              )}

              <button 
                type="submit"
                className="w-full group flex items-center justify-center gap-2 p-3 mt-4 bg-brand hover:bg-brand-hover text-white font-medium rounded-xl transition-all active:scale-[0.98] shadow-glow"
              >
                {isRegister ? (isVerifying ? 'Verify & Continue' : 'Create Account') : 'Sign In'}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border-subtle text-center">
              <p className="text-sm text-text-secondary">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button 
                  type="button"
                  onClick={() => { 
                    setIsRegister(!isRegister); 
                    setError(''); 
                    setMsg(''); 
                    setIsVerifying(false);
                  }} 
                  className="text-brand hover:text-brand-light font-medium transition-colors"
                >
                  {isRegister ? 'Sign In' : 'Sign up'}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
