import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowRight, Lock } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export const AuthScreen = () => {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) {
      setPhase('error');
      setErrorMsg('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
      return;
    }
    if (!email.trim()) return;
    setPhase('sending');
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setPhase('error');
      setErrorMsg(error.message);
      return;
    }
    setPhase('sent');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
            <Lock size={28} className="text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold text-text">SAFE</h1>
          <p className="text-sm text-text-dim mt-1">Sign in to keep your safe real</p>
        </div>

        {phase === 'sent' ? (
          <div className="card-clean p-6 text-center">
            <Mail size={40} className="text-primary mx-auto mb-3" />
            <p className="font-display text-lg font-semibold text-text mb-1">Check your email</p>
            <p className="text-sm text-text-dim">
              We sent a magic link to <span className="text-text">{email}</span>. Click it and
              you&apos;ll be signed in on this device.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card-clean p-4 space-y-3">
            <label className="block text-xs uppercase tracking-wide text-text-dim">
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={phase === 'sending'}
              className="w-full rounded-xl bg-surface-light px-4 py-3 text-text placeholder-text-dim focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="submit"
              disabled={phase === 'sending' || !email.trim() || !configured}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-background disabled:opacity-50"
            >
              {phase === 'sending' ? 'Sending…' : 'Send magic link'}
              <ArrowRight size={18} />
            </button>
            {phase === 'error' && errorMsg && (
              <p className="text-sm text-danger">{errorMsg}</p>
            )}
            {!configured && (
              <p className="text-xs text-warning">
                Supabase env vars missing — populate <code>.env.local</code> and restart dev.
              </p>
            )}
          </form>
        )}
      </motion.div>
    </div>
  );
};
