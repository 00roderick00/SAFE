// Marketplace — browse live community custom games and equip them
// onto a security-loadout slot. Every game shown here has passed
// the calibration gate (status='live'), so equipping one can't
// produce an unwinnable safe.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, CheckCircle, Loader2 } from 'lucide-react';
import { api, type PublicCustomGame } from '../services/api';
import { usePlayerStore } from '../store/playerStore';
import { supabase } from '../services/supabaseClient';
import { buildCustomModule } from '../game/loadout';
import { sanitizeUserText } from '../utils/sanitize';

export const MarketplaceScreen = () => {
  const navigate = useNavigate();
  // Subscribe to the loadout so equipped-slot badges reflect the
  // *persisted* store, not transient button clicks.
  const securityLoadout = usePlayerStore((s) => s.securityLoadout);
  const [games, setGames] = useState<PublicCustomGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Which "<gameId>:<slot>" button is mid-write, and any equip error.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [equipErr, setEquipErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.listMarketplaceGames(30);
        if (!cancelled) setGames(rows);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reliable, idempotent equip. The old version had three first-click
  // failure modes: (1) it read a possibly-stale `securityLoadout`
  // captured at render, (2) it used `getUser()` — a network call that
  // can transiently return no user right after load, silently skipping
  // the server write, and (3) it updated the client store BEFORE the
  // server write, so a late server-hydrate could clobber it. This
  // version reads fresh state, resolves the session from the cached
  // `getSession()`, writes to the server FIRST, and only then updates
  // the local store — so a single click always persists.
  const equip = async (g: PublicCustomGame, slotIndex: number) => {
    const key = `${g.id}:${slotIndex}`;
    if (savingKey) return; // ignore double-clicks while a write is in flight
    setEquipErr(null);
    setSavingKey(key);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setEquipErr('Your session expired — sign in again to equip.');
        return;
      }

      // Read the latest loadout from the store (not the render-time
      // closure) so concurrent hydration/equips don't drop modules.
      const current = usePlayerStore.getState().securityLoadout;
      const newModules = [...current.modules];
      newModules[slotIndex] = buildCustomModule(g, slotIndex);
      const newLoadout = {
        modules: newModules,
        effectiveScore: current.effectiveScore,
      };

      // Server write is authoritative — await it before touching local
      // state so we reflect what actually persisted.
      await api.updateLoadout(session.user.id, newLoadout);
      usePlayerStore.getState().updateSecurityModule(slotIndex, newModules[slotIndex]);
      navigate('/security');
    } catch (e) {
      setEquipErr(e instanceof Error ? e.message : 'Failed to equip — try again.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center">
          <button onClick={() => navigate('/custom-games')} className="p-2 -ml-2 text-text-dim hover:text-text">
            <ArrowLeft size={24} />
          </button>
          <h1 className="ml-2 text-lg font-semibold">Marketplace</h1>
        </div>
      </header>

      <div className="px-4 py-6">
        <div className="card-clean p-4 mb-6">
          <p className="text-sm text-text-dim">
            Every listing has passed the calibration gate — its solve rate
            landed in the target band. Equipping one on a safe slot pays
            the creator a royalty on every attack that hits it.
          </p>
        </div>

        {loading && <p className="text-text-dim">Loading…</p>}
        {err && <p className="text-danger">{err}</p>}
        {equipErr && (
          <p className="text-danger text-sm mb-4" role="alert">
            {equipErr}
          </p>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">🕹️</span>
            <p className="text-text-dim">No live community games yet.</p>
          </div>
        )}

        <div className="space-y-4">
          {games.map((g) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-clean p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{sanitizeUserText(g.name, { maxLength: 60 })}</h3>
                  <p className="text-xs text-text-dim">
                    by {sanitizeUserText(g.creator_handle ?? 'anon', { maxLength: 40 })} · base: {g.base_engine}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                  <CheckCircle size={12} />
                  live
                </span>
              </div>
              {g.description && (
                <p className="text-sm text-text-dim mt-2 line-clamp-2">
                  {sanitizeUserText(g.description, { maxLength: 200 })}
                </p>
              )}
              <div className="bg-surface-light rounded-lg p-3 mt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-dim">Difficulty</span>
                  <span>
                    {g.calibrated_difficulty !== null
                      ? `${(g.calibrated_difficulty * 100).toFixed(0)}%`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-dim">Plays</span>
                  <span>{g.plays}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {[0, 1, 2].map((i) => {
                  const key = `${g.id}:${i}`;
                  const isSaving = savingKey === key;
                  // Reflect the *persisted* store: is this game already
                  // in this slot?
                  const isEquipped = securityLoadout.modules[i]?.customGameId === g.id;
                  return (
                    <button
                      key={i}
                      onClick={() => equip(g, i)}
                      disabled={savingKey !== null}
                      aria-label={`Equip ${sanitizeUserText(g.name, { maxLength: 60 })} to slot ${i + 1}`}
                      className={`text-xs py-2 rounded-lg border inline-flex items-center justify-center gap-1 disabled:opacity-60 ${
                        isEquipped
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-surface-light border-border hover:bg-primary/10 hover:border-primary'
                      }`}
                    >
                      {isSaving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isEquipped ? (
                        <CheckCircle size={12} />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      {isEquipped ? `Slot ${i + 1} ✓` : `Slot ${i + 1}`}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
