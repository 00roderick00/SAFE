// Custom-game builder screen (Phase 3A).
//
// User prompts the server, server calls Anthropic, validates the
// config against a JSON Schema, runs the calibration gate, and
// persists a custom_games row. The client never sees the API key
// and never executes AI-emitted code — this screen just displays
// the row the server returns and lets the user list/manage their
// creations.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Sparkles, CheckCircle, XCircle, Loader2, Store, Gauge } from 'lucide-react';
import { api, type CustomGame, type GenerateGameResponse } from '../services/api';
import { useSession } from '../services/useSession';
import { sanitizeUserText } from '../utils/sanitize';

// The calibration band creators must land in for a game to go live.
const BAND = { min: 0.3, max: 0.7 };

type PreviewState = {
  solveRate?: number;
  reason?: string;
  suggestion?: string;
  passes: boolean;
  blocked?: boolean; // moderation/quality block (not a difficulty miss)
};

function toPreview(res: GenerateGameResponse): PreviewState {
  const c = res.calibration;
  const blocked = res.moderation ? res.moderation.safe === false : false;
  return {
    solveRate: c?.solveRate,
    reason: c?.reason,
    suggestion: c?.suggestion,
    passes: Boolean(c?.passes),
    blocked,
  };
}

const SUPPORTED_ENGINES: { id: string; label: string; blurb: string }[] = [
  { id: 'maze', label: 'Maze', blurb: 'Traverse a grid maze under a timer' },
  { id: 'snake', label: 'Snake', blurb: 'Grow to a target length before time runs out' },
  { id: 'timing', label: 'Timing dial', blurb: 'Stop the needle in the target zone' },
  { id: 'pattern', label: 'Pattern lock', blurb: 'Memorise then reproduce a pattern' },
  { id: 'memorymatch', label: 'Memory match', blurb: 'Find matching pairs' },
  { id: 'quickmath', label: 'Quick math', blurb: 'Solve arithmetic under pressure' },
];

export const CustomGameScreen = () => {
  const navigate = useNavigate();
  const session = useSession();

  const [games, setGames] = useState<CustomGame[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<string>('maze');
  const [statedDifficulty, setStatedDifficulty] = useState(0.5);
  const [mode, setMode] = useState<'engine_config' | 'dsl_program'>('engine_config');

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await api.listOwnCustomGames(session.user.id);
        if (!cancelled) setGames(rows);
      } catch {
        // ignore — UI shows empty state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const baseArgs = () => ({
    prompt: prompt.trim(),
    name: name.trim(),
    statedDifficulty,
    mode,
    ...(mode === 'engine_config' ? { baseEngine: engine } : {}),
  });

  // Dry-run: calibrate + return the solve-rate estimate and a concrete
  // tweak WITHOUT publishing, so creators can iterate toward the band
  // (TESTING-FINDINGS P2.3). Nothing is added to the games list.
  const handlePreview = async () => {
    setErr(null);
    if (!name.trim() || !prompt.trim()) return;
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await api.generateGame({ ...baseArgs(), dryRun: true });
      setPreview(toPreview(res));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !prompt.trim()) return;
    setBusy(true);
    try {
      const res = await api.generateGame(baseArgs());
      if (res.customGame) setGames((prev) => [res.customGame as CustomGame, ...prev]);
      // If the game was rejected on publish, keep the form open and show
      // the estimate + suggestion so the creator can adjust and retry.
      const p = toPreview(res);
      if (p.passes && res.customGame) {
        setName('');
        setPrompt('');
        setPreview(null);
        setShowForm(false);
      } else {
        setPreview(p);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/security')}
              className="p-2 -ml-2 text-text-dim hover:text-text"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="ml-2 text-lg font-semibold">Custom Games</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/marketplace')}
              className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm"
            >
              <Store size={16} />
              Browse
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-background font-medium rounded-xl"
            >
              <Plus size={18} />
              Build
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 py-6">
        <div className="card-clean p-4 mb-6">
          <p className="text-sm text-text-dim">
            Describe a variant of one of our engines and the AI will propose a config.
            Every game is calibrated before it can guard a safe — solve rate must land
            in the 30-70% band. AI output is validated as data, never executed.
          </p>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <form onSubmit={handleSubmit} className="card-clean p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Speedrun Maze"
                    className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-primary"
                    maxLength={60}
                    required
                    disabled={busy}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('engine_config')}
                      disabled={busy}
                      className={`text-left p-2 rounded-lg border ${
                        mode === 'engine_config' ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'
                      }`}
                    >
                      <div className="text-sm font-medium">Tune an engine</div>
                      <div className="text-xs text-text-dim">Pick one of our 6 engines and let AI configure it.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('dsl_program')}
                      disabled={busy}
                      className={`text-left p-2 rounded-lg border ${
                        mode === 'dsl_program' ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'
                      }`}
                    >
                      <div className="text-sm font-medium">Design a game</div>
                      <div className="text-xs text-text-dim">AI composes a grid game (walls, tokens, enemies).</div>
                    </button>
                  </div>
                </div>

                {mode === 'engine_config' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Base engine</label>
                    <div className="grid grid-cols-2 gap-2">
                      {SUPPORTED_ENGINES.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setEngine(e.id)}
                          disabled={busy}
                          className={`text-left p-2 rounded-lg border ${
                            engine === e.id ? 'bg-primary/20 border-primary' : 'bg-surface-light border-border'
                          }`}
                        >
                          <div className="text-sm font-medium">{e.label}</div>
                          <div className="text-xs text-text-dim">{e.blurb}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A punishing 12x12 maze with a 20-second timer, neon theme."
                    className="w-full px-3 py-2 bg-surface-light border border-border rounded-lg text-text placeholder:text-text-dim focus:outline-none focus:border-primary min-h-[100px] resize-none"
                    maxLength={1000}
                    required
                    disabled={busy}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Target difficulty: {(statedDifficulty * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={statedDifficulty}
                    onChange={(e) => setStatedDifficulty(parseFloat(e.target.value))}
                    className="w-full"
                    disabled={busy}
                  />
                </div>

                {err && <p className="text-sm text-danger">{err}</p>}

                {preview && <PreviewBox preview={preview} band={BAND} />}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="flex-1 py-2 bg-surface border border-border rounded-lg hover:bg-surface-light disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    disabled={busy || previewing}
                    title="Estimate the solve rate without publishing"
                  >
                    {previewing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Checking…
                      </>
                    ) : (
                      <>
                        <Gauge size={16} />
                        Preview difficulty
                      </>
                    )}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-primary text-background font-medium rounded-lg hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    disabled={busy || previewing}
                  >
                    {busy ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Building…
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Build with AI
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {games.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl block mb-4">🎮</span>
            <p className="text-text-dim">Nothing yet.</p>
            <p className="text-text-dim text-sm mt-1">Tap Build to make your first AI-designed game.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((g) => (
              <CustomGameRow key={g.id} game={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const CustomGameRow = ({ game }: { game: CustomGame }) => {
  const rate = game.calibration_stats?.solveRate;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-clean p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold">{sanitizeUserText(game.name, { maxLength: 60 })}</h3>
          <p className="text-xs text-text-dim">
            Base engine: {game.base_engine}
          </p>
        </div>
        <StatusPill status={game.status} />
      </div>
      {game.description && (
        <p className="text-sm text-text-dim mt-2 line-clamp-2">
          {sanitizeUserText(game.description, { maxLength: 200 })}
        </p>
      )}
      {game.calibration_stats && (
        <div className="bg-surface-light rounded-lg p-3 mt-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-text-dim">Solve rate</span>
            <span>{rate !== undefined ? `${(rate * 100).toFixed(0)}%` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-dim">Calibrated difficulty</span>
            <span>
              {game.calibrated_difficulty !== null
                ? `${(game.calibrated_difficulty * 100).toFixed(0)}%`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-dim">Plays</span>
            <span>{game.plays}</span>
          </div>
          {game.calibration_stats.reason && (
            <p className="text-xs text-warning pt-2 border-t border-border">
              Rejected: {game.calibration_stats.reason}
            </p>
          )}
          {game.calibration_stats.suggestion && (
            <p className="text-xs text-text pt-2">
              💡 {game.calibration_stats.suggestion}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
};

// Inline dry-run / rejection feedback: shows the estimated solve rate
// against the live band and a concrete tweak when out of range.
const PreviewBox = ({ preview, band }: { preview: PreviewState; band: { min: number; max: number } }) => {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const inBand = preview.passes;
  return (
    <div
      className={`rounded-lg p-3 text-sm border ${
        inBand ? 'bg-primary/10 border-primary/40' : 'bg-surface-light border-warning/40'
      }`}
    >
      {preview.blocked ? (
        <p className="text-warning">
          Blocked before calibration — {preview.reason ?? 'rejected'}. Edit the title/prompt and try again.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-text-dim">Estimated solve rate</span>
            <span className={inBand ? 'text-primary font-medium' : 'text-warning font-medium'}>
              {preview.solveRate !== undefined ? pct(preview.solveRate) : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-dim mt-1">
            <span>Live band</span>
            <span>{pct(band.min)}–{pct(band.max)}</span>
          </div>
          <p className={`text-xs mt-2 ${inBand ? 'text-primary' : 'text-warning'}`}>
            {inBand
              ? '✓ In the band — this will publish as live.'
              : preview.reason === 'too_hard'
                ? 'Too hard for the live band.'
                : 'Too easy for the live band.'}
          </p>
          {!inBand && preview.suggestion && (
            <p className="text-xs text-text mt-1">💡 {preview.suggestion}</p>
          )}
        </>
      )}
    </div>
  );
};

const StatusPill = ({ status }: { status: CustomGame['status'] }) => {
  const map = {
    draft: { text: 'Draft', cls: 'bg-surface-light text-text-dim', icon: null as React.ReactNode },
    calibrating: { text: 'Calibrating', cls: 'bg-surface-light text-warning', icon: <Loader2 size={12} className="animate-spin" /> },
    live: { text: 'Live', cls: 'bg-primary/20 text-primary', icon: <CheckCircle size={12} /> },
    rejected: { text: 'Rejected', cls: 'bg-danger/20 text-danger', icon: <XCircle size={12} /> },
  } as const;
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${m.cls}`}>
      {m.icon}
      {m.text}
    </span>
  );
};
