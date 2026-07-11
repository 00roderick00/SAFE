// Marketplace — browse live community custom games and equip them
// onto a security-loadout slot. Every game shown here has passed
// the calibration gate (status='live'), so equipping one can't
// produce an unwinnable safe.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, CheckCircle } from 'lucide-react';
import { api, type PublicCustomGame } from '../services/api';
import { usePlayerStore } from '../store/playerStore';

export const MarketplaceScreen = () => {
  const navigate = useNavigate();
  const { securityLoadout } = usePlayerStore();
  const [games, setGames] = useState<PublicCustomGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  const equip = async (g: PublicCustomGame, slotIndex: number) => {
    const newModules = [...securityLoadout.modules];
    const config = g.config as Record<string, unknown> | undefined;
    newModules[slotIndex] = {
      id: `${g.id}-slot-${slotIndex}`,
      type: g.base_engine as never,
      difficulty: g.calibrated_difficulty ?? 0.5,
      weight: 1,
      name: g.name,
      description: g.description,
      customGameId: g.id,
      customConfig: { baseEngine: g.base_engine as never, config: config ?? {} },
    };
    const { updateSecurityModule } = usePlayerStore.getState();
    updateSecurityModule(slotIndex, newModules[slotIndex]);
    // Server-side: also write to safes.security_loadout so the
    // module is durable and attackers see it. See api.updateLoadout.
    const session = (await import('../services/supabaseClient')).supabase.auth;
    const { data } = await session.getUser();
    if (data.user) {
      await api.updateLoadout(data.user.id, {
        modules: newModules,
        effectiveScore: securityLoadout.effectiveScore,
      });
    }
    navigate('/security');
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
                  <h3 className="font-semibold">{g.name}</h3>
                  <p className="text-xs text-text-dim">
                    by {g.creator_handle ?? 'anon'} · base: {g.base_engine}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                  <CheckCircle size={12} />
                  live
                </span>
              </div>
              {g.description && (
                <p className="text-sm text-text-dim mt-2 line-clamp-2">{g.description}</p>
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
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => equip(g, i)}
                    className="text-xs py-2 rounded-lg bg-surface-light border border-border hover:bg-primary/10 hover:border-primary inline-flex items-center justify-center gap-1"
                  >
                    <Sparkles size={12} />
                    Slot {i + 1}
                  </button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
