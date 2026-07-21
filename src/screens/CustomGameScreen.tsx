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
import { ArrowLeft, Plus, Sparkles, Loader2, Store, Gauge, Gamepad2, Lightbulb } from 'lucide-react';
import { api, type CustomGame, type GenerateGameResponse } from '../services/api';
import { GameEmblem, StateBadge, StateFrame, type VisualState } from '../components/game';
import { useSession } from '../services/useSession';
import { getCustomGameDisplay } from '../game/customGameDisplay';
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

// Quick-start recipes: one tap fills the form with a coherent, in-band
// starting point the creator can then tweak (Section 10 — templates).
type Template = {
  id: string; name: string; prompt: string;
  engine: string; mode: 'engine_config' | 'dsl_program'; difficulty: number;
};
const TEMPLATES: Template[] = [
  { id: 'speedrun', name: 'Speedrun Maze', engine: 'maze', mode: 'engine_config', difficulty: 0.6, prompt: 'A tight 10x10 maze with a 20-second timer and a single winding path to the exit.' },
  { id: 'memory', name: 'Memory Vault', engine: 'memorymatch', mode: 'engine_config', difficulty: 0.45, prompt: 'Match six hidden pairs before a 30-second timer runs out.' },
  { id: 'reflex', name: 'Reflex Dial', engine: 'timing', mode: 'engine_config', difficulty: 0.55, prompt: 'Stop a fast-moving needle inside a narrow target zone across three rounds.' },
  { id: 'crunch', name: 'Number Crunch', engine: 'quickmath', mode: 'engine_config', difficulty: 0.5, prompt: 'Solve eight arithmetic problems under a tightening per-question timer.' },
  { id: 'chase', name: 'Chase Grid', engine: 'maze', mode: 'dsl_program', difficulty: 0.6, prompt: 'A 9x9 grid where I reach the exit while two enemies patrol the corridors.' },
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

  const applyTemplate = (t: Template) => {
    setErr(null);
    setPreview(null);
    setName(t.name);
    setPrompt(t.prompt);
    setEngine(t.engine);
    setMode(t.mode);
    setStatedDifficulty(t.difficulty);
    setShowForm(true);
  };

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
    <div className="workshop-screen">
      <header className="tactical-header workshop-header">
        <button
          className="icon-button"
          onClick={() => navigate('/security')}
          aria-label="Back to defense configuration"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="eyebrow">AI WORKSHOP</p>
          <h1>Custom Games</h1>
        </div>
        <div className="workshop-header__actions">
          <button className="text-button" onClick={() => navigate('/marketplace')}>
            <Store size={16} />
            Browse
          </button>
          <button className="btn-neon workshop-build" onClick={() => setShowForm(true)}>
            <Plus size={16} />
            Build
          </button>
        </div>
      </header>

      <main className="workshop-main">
        <StateFrame state="secure" className="workshop-intro" label="How the workshop works">
          <Sparkles size={20} aria-hidden="true" />
          <div>
            <strong>Describe a lock — we build and fairness-check it.</strong>
            <span>
              Pick a base mechanism and describe the defense you want. A game
              only goes live if it’s beatable but not too easy, so it’s fair for
              you and for attackers.
            </span>
          </div>
        </StateFrame>

        {!showForm && (
          <section className="workshop-templates" aria-label="Quick-start templates">
            <p className="eyebrow">START FROM A TEMPLATE</p>
            <div className="workshop-templates__row">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="template-card" onClick={() => applyTemplate(t)}>
                  <GameEmblem type={t.engine} />
                  <span className="template-card__name">{t.name}</span>
                  <span className="template-card__mode">{t.mode === 'dsl_program' ? 'Designed' : t.engine}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="workshop-form-wrap"
            >
              <form onSubmit={handleSubmit} className="workshop-form">
                <label className="workshop-field">
                  <span className="workshop-field__label">Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Speedrun Maze"
                    maxLength={60}
                    required
                    disabled={busy}
                  />
                </label>

                <fieldset className="workshop-field" disabled={busy}>
                  <span className="workshop-field__label">Mode</span>
                  <div className="select-grid">
                    <button
                      type="button"
                      onClick={() => setMode('engine_config')}
                      className={`select-card${mode === 'engine_config' ? ' select-card--active' : ''}`}
                      aria-pressed={mode === 'engine_config'}
                    >
                      <strong>Tune an engine</strong>
                      <span>Pick one of our 6 engines and let AI configure it.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('dsl_program')}
                      className={`select-card${mode === 'dsl_program' ? ' select-card--active' : ''}`}
                      aria-pressed={mode === 'dsl_program'}
                    >
                      <strong>Design a game</strong>
                      <span>AI composes a grid game (walls, tokens, enemies).</span>
                    </button>
                  </div>
                </fieldset>

                {mode === 'engine_config' && (
                  <fieldset className="workshop-field" disabled={busy}>
                    <span className="workshop-field__label">Base engine</span>
                    <div className="select-grid">
                      {SUPPORTED_ENGINES.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setEngine(e.id)}
                          className={`select-card select-card--compact${engine === e.id ? ' select-card--active' : ''}`}
                          aria-pressed={engine === e.id}
                        >
                          <GameEmblem type={e.id} />
                          <strong>{e.label}</strong>
                          <span>{e.blurb}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <label className="workshop-field">
                  <span className="workshop-field__label">Prompt</span>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="A punishing 12x12 maze with a 20-second timer, neon theme."
                    maxLength={1000}
                    required
                    disabled={busy}
                  />
                </label>

                <label className="difficulty-control workshop-field">
                  <span><b>Target difficulty</b><output>{(statedDifficulty * 100).toFixed(0)}%</output></span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={statedDifficulty}
                    onChange={(e) => setStatedDifficulty(parseFloat(e.target.value))}
                    disabled={busy}
                  />
                </label>

                {err && <p className="workshop-alert" role="alert">{err}</p>}

                {preview && <PreviewBox preview={preview} band={BAND} />}

                <div className="workshop-actions">
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="btn-secondary"
                    disabled={busy || previewing}
                    title="Estimate the solve rate without publishing"
                  >
                    {previewing ? <><Loader2 size={16} className="animate-spin" /> Checking…</> : <><Gauge size={16} /> Preview difficulty</>}
                  </button>
                  <button type="submit" className="btn-neon" disabled={busy || previewing}>
                    {busy ? <><Loader2 size={16} className="animate-spin" /> Building…</> : <><Sparkles size={16} /> Build with AI</>}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {games.length === 0 ? (
          <div className="honest-empty workshop-empty">
            <Gamepad2 size={24} aria-hidden="true" />
            <div>
              <strong>No games yet</strong>
              <span>Pick a template above, or tap Build to design one from scratch.</span>
            </div>
          </div>
        ) : (
          <section className="workshop-list" aria-label="Your custom games">
            <p className="eyebrow">YOUR GAMES</p>
            {games.map((g) => (
              <CustomGameRow key={g.id} game={g} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
};

const CustomGameRow = ({ game }: { game: CustomGame }) => {
  const rate = game.calibration_stats?.solveRate;
  const display = getCustomGameDisplay(game);
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rich-game-card workshop-game"
      layout
    >
      <div className="marketplace-card__head">
        <GameEmblem type={game.base_engine} />
        <div className="rich-game-card__copy">
          <span className="eyebrow">YOUR GAME · {game.base_engine}</span>
          <h3>{sanitizeUserText(game.name, { maxLength: 60 })}</h3>
        </div>
        <StatusPill status={game.status} />
      </div>
      {display.contentRejected ? (
        // Moderation/quality reject: never surface the raw prompt.
        <p className="workshop-game__desc workshop-game__desc--muted">
          Original prompt hidden — this submission was blocked in review.
        </p>
      ) : (
        game.description && (
          <p className="workshop-game__desc">{sanitizeUserText(game.description, { maxLength: 160 })}</p>
        )
      )}
      {game.calibration_stats && (
        <>
          <div className="game-card-meta">
            <span>Solve {rate !== undefined ? `${(rate * 100).toFixed(0)}%` : '—'}</span>
            <span>Diff {game.calibrated_difficulty !== null ? `${(game.calibrated_difficulty * 100).toFixed(0)}%` : '—'}</span>
            <span>{game.plays} plays</span>
          </div>
          {display.rejectionNote && <p className="workshop-note workshop-note--warn">{display.rejectionNote}</p>}
          {game.calibration_stats.suggestion && (
            <p className="workshop-note"><Lightbulb size={14} aria-hidden="true" /> {game.calibration_stats.suggestion}</p>
          )}
        </>
      )}
    </motion.article>
  );
};

// Inline dry-run / rejection feedback: shows the estimated solve rate
// against the live band and a concrete tweak when out of range.
const PreviewBox = ({ preview, band }: { preview: PreviewState; band: { min: number; max: number } }) => {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const inBand = preview.passes;
  const state: VisualState = preview.blocked ? 'failed' : inBand ? 'secure' : 'warning';
  return (
    <StateFrame state={state} className="workshop-preview" label="Difficulty preview">
      {preview.blocked ? (
        <p className="workshop-preview__verdict">
          Blocked before calibration — {preview.reason ?? 'rejected'}. Edit the title/prompt and try again.
        </p>
      ) : (
        <>
          <div className="workshop-preview__row">
            <span>Estimated solve rate</span>
            <strong>{preview.solveRate !== undefined ? pct(preview.solveRate) : '—'}</strong>
          </div>
          <div className="workshop-preview__row workshop-preview__row--dim">
            <span>Live band</span>
            <span>{pct(band.min)}–{pct(band.max)}</span>
          </div>
          <p className="workshop-preview__verdict">
            {inBand
              ? '✓ In the band — this will publish as live.'
              : preview.reason === 'too_hard'
                ? 'Too hard for the live band.'
                : 'Too easy for the live band.'}
          </p>
          {!inBand && preview.suggestion && (
            <p className="workshop-note"><Lightbulb size={14} aria-hidden="true" /> {preview.suggestion}</p>
          )}
        </>
      )}
    </StateFrame>
  );
};

const StatusPill = ({ status }: { status: CustomGame['status'] }) => {
  const map: Record<CustomGame['status'], { state: VisualState; label: string }> = {
    draft: { state: 'recovering', label: 'Draft' },
    calibrating: { state: 'warning', label: 'Calibrating' },
    live: { state: 'secure', label: 'Live' },
    rejected: { state: 'failed', label: 'Rejected' },
  };
  const m = map[status];
  return <StateBadge state={m.state} label={m.label} compact />;
};
