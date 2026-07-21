// Marketplace — browse live community-made locks and equip one onto a
// security-loadout slot. Every lock shown here has passed the calibration
// fairness gate (status='live'), so equipping it can't produce an
// unbeatable safe. Presented in the shared tactical visual system.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Clock3, Gamepad2, Loader2, Play, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { GameEmblem, StateBadge, StateFrame } from '../components/game';
import { api, type PublicCustomGame } from '../services/api';
import { usePlayerStore } from '../store/playerStore';
import { supabase } from '../services/supabaseClient';
import { buildCustomModule } from '../game/loadout';
import { getCatalogMeta } from '../game/catalog';
import { filterDisplayableListings } from '../game/listingSafety';
import { sanitizeUserText } from '../utils/sanitize';
import type { ModuleType } from '../types';

const difficultyLabel = (value: number | null) =>
  value === null ? 'Uncalibrated' : value < .33 ? 'Easy' : value < .66 ? 'Tactical' : 'Punishing';

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
        // Defense-in-depth: never surface injection/test/garbage listings
        // publicly, even if calibration passed (Section 9).
        if (!cancelled) setGames(filterDisplayableListings(rows));
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

  // Reliable, idempotent equip. Reads fresh state, resolves the session
  // from the cached getSession(), writes to the server FIRST, and only
  // then updates the local store — so a single click always persists.
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
    <div className="marketplace">
      <header className="picker-header">
        <button className="icon-button" onClick={() => navigate('/custom-games')} aria-label="Back to custom games">
          <ArrowLeft size={20} />
        </button>
        <div><p className="eyebrow">MARKETPLACE</p><h1>Community locks</h1></div>
        <StateBadge state="secure" label="Live" compact />
      </header>

      <main className="marketplace-body">
        <StateFrame state="secure" className="marketplace-intro" label="How the marketplace works">
          <Store size={20} aria-hidden="true" />
          <div>
            <strong>Player-made locks, fairness-checked.</strong>
            <span>
              Every lock here passed a solve-rate check, so equipping one can’t
              make your safe unbeatable. Its creator earns a small royalty each
              time an attacker takes it on.
            </span>
          </div>
        </StateFrame>

        {equipErr && <p className="marketplace-alert" role="alert">{equipErr}</p>}
        {err && <p className="marketplace-alert" role="alert">{err}</p>}

        {loading && (
          <div className="honest-empty"><Loader2 size={24} className="animate-spin" aria-hidden="true" /><div><strong>Loading community locks…</strong><span>Fetching the latest calibrated listings.</span></div></div>
        )}

        {!loading && !err && games.length === 0 && (
          <div className="honest-empty"><Gamepad2 size={24} aria-hidden="true" /><div><strong>No community locks yet</strong><span>Build one in the AI Workshop — once it passes calibration it appears here.</span></div></div>
        )}

        <section className="rich-game-grid marketplace-grid" aria-label="Community locks">
          {games.map((g) => {
            const meta = getCatalogMeta(g.base_engine as ModuleType);
            const name = sanitizeUserText(g.name, { maxLength: 60 });
            const equippedSlot = securityLoadout.modules.findIndex((m) => m?.customGameId === g.id);
            return (
              <motion.article
                key={g.id}
                className={`rich-game-card marketplace-card${equippedSlot >= 0 ? ' selected' : ''}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                layout
              >
                <div className="marketplace-card__head">
                  <GameEmblem type={g.base_engine} />
                  <div className="rich-game-card__copy">
                    <span className="eyebrow">COMMUNITY · {g.base_engine}</span>
                    <h3>{name}</h3>
                    <p>by {sanitizeUserText(g.creator_handle ?? 'anon', { maxLength: 40 })}</p>
                  </div>
                  <StateBadge state="secure" label="Live" compact />
                </div>

                {g.description && (
                  <p className="marketplace-card__desc">{sanitizeUserText(g.description, { maxLength: 160 })}</p>
                )}

                <div className="game-card-meta">
                  <span><ShieldCheck size={11} /> {difficultyLabel(g.calibrated_difficulty)}</span>
                  <span><Play size={11} /> {g.plays} plays</span>
                  <span><Clock3 size={11} /> ~{meta.duration}s</span>
                  <span>{meta.skills.join(' · ') || 'Mixed'}</span>
                </div>

                <div className="marketplace-equip">
                  <span className="marketplace-equip__label">Equip to a lock slot</span>
                  <div className="marketplace-equip__slots">
                    {[0, 1, 2].map((i) => {
                      const isSaving = savingKey === `${g.id}:${i}`;
                      const isEquipped = securityLoadout.modules[i]?.customGameId === g.id;
                      return (
                        <button
                          key={i}
                          onClick={() => equip(g, i)}
                          disabled={savingKey !== null}
                          aria-label={`Equip ${name} to lock slot ${i + 1}`}
                          className={`marketplace-slot${isEquipped ? ' marketplace-slot--equipped' : ''}`}
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : isEquipped ? <CheckCircle size={13} /> : <Sparkles size={13} />}
                          {isEquipped ? `Slot ${i + 1} ✓` : `Slot ${i + 1}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </section>
      </main>
    </div>
  );
};
