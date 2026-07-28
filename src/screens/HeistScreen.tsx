import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  Clock3,
  Crosshair,
  Filter,
  LockKeyhole,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GameIcon, StateBadge, StateFrame } from '../components/game';
import { TargetSafeGraphic } from '../components/SafeGraphic';
import { ECONOMY } from '../game/constants';
import { calculateLoot } from '../game/economy';
import { getExpectedDuration, getFamiliarity, getPayoutPresentation, getTargetAvailability } from '../game/presentation';
import { useSession } from '../services/useSession';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { usePlayerStore } from '../store/playerStore';
import { useUnlockTier } from '../store/useUnlockTier';
import { InfoTip } from '../components/InfoTip';
import { api } from '../services/api';
import { STAT_HELP } from '../game/statHelp';
import type { BotSafe } from '../types';
import { haptics } from '../utils/haptics';

type SortMode = 'net-desc' | 'stake-asc' | 'stake-desc' | 'difficulty-asc';
type FamiliarityFilter = 'all' | 'familiar' | 'unfamiliar';

const difficultyRank = { soft: 1, tricky: 2, brutal: 3 } as const;
/** "42m" / "3m" / "40s" — remaining cooldown in the shortest useful unit. */
const formatCooldown = (ms: number): string => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${seconds}s`;
};

const difficultyCopy = { soft: 'Soft perimeter', tricky: 'Tricky system', brutal: 'Brutal defense' } as const;
const formatTokens = (value: number) => `${Math.round(value).toLocaleString()} TK`;
const formatDuration = (seconds: number) => seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)} min`;

export const HeistScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [selectedTarget, setSelectedTarget] = useState<BotSafe | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('net-desc');
  const unlockTier = useUnlockTier();
  // Direct challenge: find a specific player by handle. Results replace
  // the browse list so the existing confirm-and-attack flow is reused
  // verbatim — the searched id is the same opaque safe id list_targets
  // returns, so it round-trips into start_attack unchanged.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BotSafe[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const firstHeist = unlockTier === 0;
  const [familiarityFilter, setFamiliarityFilter] = useState<FamiliarityFilter>('all');
  const [maxDifficulty, setMaxDifficulty] = useState<'all' | 'soft' | 'tricky' | 'brutal'>('all');
  const {
    heistModeActive,
    heistModeExpiresAt,
    safeBalance,
    riskRating,
    securityLoadout,
    insurancePolicy,
    enterHeistMode,
    exitHeistMode,
  } = usePlayerStore();
  const {
    botSafes,
    refreshBotSafes,
    refreshTargetsFromServer,
    recentlyAttacked,
    recordBotAttacked,
    targetsSource,
  } = useGameStore();
  const { startAttack, startServerAttack } = useHeistStore();

  const familiarTypes = useMemo(
    () => new Set(securityLoadout.modules.map((module) => module.type)),
    [securityLoadout.modules],
  );
  const insured = Boolean(insurancePolicy && now < insurancePolicy.expiresAt);
  const exposureRemaining = heistModeExpiresAt ? Math.max(0, heistModeExpiresAt - now) : 0;
  const exposureLabel = `${Math.floor(exposureRemaining / 60_000)}:${Math.floor((exposureRemaining % 60_000) / 1_000).toString().padStart(2, '0')}`;
  const potentialOwnLoss = calculateLoot(safeBalance);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (heistModeActive && heistModeExpiresAt && now >= heistModeExpiresAt) {
      exitHeistMode();
      navigate('/');
    }
  }, [heistModeActive, heistModeExpiresAt, now, exitHeistMode, navigate]);

  const sessionKey = session === undefined ? 'loading' : session?.user?.id ?? 'anon';
  useEffect(() => {
    if (!heistModeActive || sessionKey === 'loading') return;
    if (session?.user?.id) refreshTargetsFromServer(session.user.id, riskRating);
    else refreshBotSafes(riskRating);
  }, [heistModeActive, sessionKey, session?.user?.id, riskRating, refreshTargetsFromServer, refreshBotSafes]);

  const handleRefresh = async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (session?.user?.id) await refreshTargetsFromServer(session.user.id, riskRating);
      else refreshBotSafes(riskRating);
    } finally {
      window.setTimeout(() => setRefreshing(false), 420);
    }
  };

  const runSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchError('Enter at least 2 characters.');
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await api.searchTargets(q);
      setSearchResults(found.map((t) => ({
        id: t.id,
        ownerName: t.handle,
        safeBalance: t.balance,
        securityScore: t.securityScore,
        securityLoadout: t.securityLoadout,
        difficultyBand: t.difficultyBand,
        lootRange: t.lootRange,
        attackFee: t.attackFee,
        lastAttackedAt: t.lastAttackedAt ? new Date(t.lastAttackedAt).getTime() : null,
        // A cooling-down player is SHOWN with time remaining rather than
        // hidden — "recovering, free in 42m" beats "not found".
        attackCooldownUntil: t.cooldownRemainingMs ? Date.now() + t.cooldownRemainingMs : null,
        tagline: 'Live target',
        isBotTarget: false,
        unattackableReason: t.unattackableReason,
      })));
      if (found.length === 0) setSearchError(`No vault found for “${q}”.`);
    } catch (err) {
      setSearchError(err instanceof Error && /rate_limited/.test(err.message)
        ? 'Too many searches — try again in a minute.'
        : 'Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchResults(null);
    setSearchError(null);
    setSearchQuery('');
  };

  const targets = useMemo(() => {
    const filtered = botSafes.filter((target) => {
      const familiarity = getFamiliarity(target.securityLoadout.modules, familiarTypes);
      if (familiarityFilter === 'familiar' && familiarity.unfamiliar > 0) return false;
      if (familiarityFilter === 'unfamiliar' && familiarity.unfamiliar === 0) return false;
      if (maxDifficulty !== 'all' && difficultyRank[target.difficultyBand] > difficultyRank[maxDifficulty]) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      // First-heist onboarding (§3 tier 0): soft practice bots surface
      // first so a brand-new player's opening raid is a gentle one.
      if (firstHeist) {
        const band = difficultyRank[a.difficultyBand] - difficultyRank[b.difficultyBand];
        if (band !== 0) return band;
      }
      if (sortMode === 'stake-asc') return a.attackFee - b.attackFee;
      if (sortMode === 'stake-desc') return b.attackFee - a.attackFee;
      if (sortMode === 'difficulty-asc') return difficultyRank[a.difficultyBand] - difficultyRank[b.difficultyBand];
      return getPayoutPresentation(b.safeBalance).netPayout - getPayoutPresentation(a.safeBalance).netPayout;
    });
  }, [botSafes, familiarTypes, familiarityFilter, maxDifficulty, sortMode, firstHeist]);

  const visibleTargets = searchResults ?? targets;

  const handleStartExposure = () => {
    haptics.heavy();
    enterHeistMode();
  };

  const handleSelectTarget = (target: BotSafe) => {
    if (target.attackFee > safeBalance || (target.attackCooldownUntil ?? 0) > now) return;
    // A safe with no server-verifiable lock is force-lost by the
    // composition rule, so it must never be offered as attackable.
    if (target.unattackableReason) return;
    haptics.medium();
    setSelectedTarget(target);
  };

  const handleConfirmAttack = async () => {
    if (!selectedTarget) return;
    haptics.heavy();
    if (session) {
      try {
        await startServerAttack({ defenderSafeId: selectedTarget.id });
        recordBotAttacked(selectedTarget.id);
        setSelectedTarget(null);
        navigate('/attack');
      } catch (error) {
        useGameStore.getState().addNotification({
          type: 'attack_fail',
          title: 'Attack unavailable',
          message: error instanceof Error ? error.message : 'The target could not be engaged.',
        });
      }
      return;
    }
    usePlayerStore.getState().withdrawTokens(selectedTarget.attackFee);
    startAttack(selectedTarget, selectedTarget.attackFee);
    recordBotAttacked(selectedTarget.id);
    navigate('/attack');
  };

  if (!heistModeActive) {
    return (
      <div className="heist-briefing">
        <header className="tactical-header">
          <button className="icon-button" onClick={() => navigate('/')} aria-label="Back to vault"><ArrowLeft size={21} /></button>
          <div className="text-right"><p className="eyebrow">OPERATION BRIEF</p><h1>Expose your vault</h1></div>
        </header>
        <main>
          <div className="briefing-visual" aria-hidden="true">
            <TargetSafeGraphic size={170} difficulty="brutal" />
            <span className="briefing-visual__scan" />
          </div>
          <StateBadge state="warning" label="Exposure required" />
          <h2>Your vault becomes a target.</h2>
          <p className="briefing-lede">For the next {ECONOMY.heistDuration / 60} minutes, you can raid other safes—and other players can attack yours.</p>
          <div className="briefing-grid">
            <StateFrame state="warning" label="Exposure duration"><Clock3 /><span>Exposure window</span><strong>{ECONOMY.heistDuration / 60} minutes</strong></StateFrame>
            <StateFrame state="exposed" label="Amount potentially at risk"><ShieldAlert /><span>Your potential loss</span><strong>{formatTokens(potentialOwnLoss)}</strong></StateFrame>
            <StateFrame state={insured ? 'secure' : 'warning'} label="Insurance state">{insured ? <ShieldCheck /> : <AlertTriangle />}<span>Insurance</span><strong>{insured ? 'Active' : 'Not active'}</strong></StateFrame>
            <StateFrame state="attacking" label="Attack rule"><Crosshair /><span>Attack condition</span><strong>Your safe can be attacked</strong></StateFrame>
          </div>
          <div className="risk-equation"><span>FAIL A RAID</span><b>STAKE LOST</b><i aria-hidden="true" /> <span>CRACK ALL LOCKS</span><b>NET LOOT PAID</b></div>
          <button className="briefing-start btn-danger" onClick={handleStartExposure}><Crosshair size={19} /> Expose for {ECONOMY.heistDuration / 60} minutes</button>
          <button className="text-button briefing-cancel" onClick={() => navigate('/')}>Not now — stay secure</button>
        </main>
      </div>
    );
  }

  return (
    <div className="heist-dossiers danger-mode">
      <header className="tactical-header sticky-heist-header">
        <button className="icon-button" onClick={() => navigate('/')} aria-label="Back to vault"><ArrowLeft size={21} /></button>
        <div><p className="eyebrow">TARGET ACQUISITION</p><h1>Choose a target</h1></div>
        <button className={`icon-button ${refreshing ? 'is-scanning' : ''}`} onClick={handleRefresh} disabled={refreshing} aria-label="Refresh targets"><RefreshCw size={20} /></button>
      </header>

      <div className="exposure-strip"><StateBadge state="exposed" /><span><Clock3 size={14} /> {exposureLabel}</span><span><WalletCards size={14} /> {formatTokens(safeBalance)}</span></div>

      {targetsSource === 'local' && (
        <StateFrame state="warning" className="practice-notice" label="Practice target source">
          <ScanLine size={20} /><div><strong>Practice bots</strong><span>Offline target simulation. No live player or community-game targets are shown.</span></div>
        </StateFrame>
      )}

      <form className="target-search" onSubmit={runSearch} role="search">
        <label htmlFor="target-search-input">Find a player</label>
        <div>
          <input
            id="target-search-input"
            type="search"
            value={searchQuery}
            placeholder="Vault handle…"
            autoComplete="off"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button type="submit" className="btn-secondary" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
          {searchResults && (
            <button type="button" className="text-button" onClick={clearSearch}>Clear</button>
          )}
        </div>
        {searchError && <p className="target-search__error" role="status">{searchError}</p>}
        {searchResults && !searchError && (
          <p className="target-search__count" role="status">
            {searchResults.length} vault{searchResults.length === 1 ? '' : 's'} found
          </p>
        )}
      </form>

      <section className="target-controls" aria-label="Sort and filter targets">
        <label><ArrowDownUp size={15} /><span>Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="net-desc">Net payout</option><option value="stake-asc">Stake: low first</option><option value="stake-desc">Stake: high first</option><option value="difficulty-asc">Difficulty</option></select></label>
        <label><Filter size={15} /><span>Games</span><select value={familiarityFilter} onChange={(event) => setFamiliarityFilter(event.target.value as FamiliarityFilter)}><option value="all">All games</option><option value="familiar">All familiar</option><option value="unfamiliar">Has unfamiliar</option></select></label>
        <label><ShieldAlert size={15} /><span>Max risk</span><select value={maxDifficulty} onChange={(event) => setMaxDifficulty(event.target.value as typeof maxDifficulty)}><option value="all">Any difficulty</option><option value="soft">Soft only</option><option value="tricky">Up to tricky</option><option value="brutal">Up to brutal</option></select></label>
      </section>

      {/* Legend for the two figures on every dossier card. The card is
          itself a button, so the tips live here rather than nested
          inside it (a button inside a button is invalid). */}
      <p className="dossier-legend">
        Each card shows <b>Risk</b><InfoTip label={STAT_HELP.stake.title} body={STAT_HELP.stake.body} align="start" />
        and <b>Potential win</b><InfoTip label={STAT_HELP.netWin.title} body={STAT_HELP.netWin.body} align="start" />
      </p>

      <section className={`dossier-list ${refreshing ? 'dossier-list--scanning' : ''}`} aria-label="Available targets" aria-busy={refreshing}>
        {visibleTargets.length === 0 ? (
          <div className="honest-empty target-empty"><ScanLine size={28} /><div><strong>No matching dossiers</strong><span>Adjust filters or scan for a new target set.</span></div><button className="btn-secondary" onClick={handleRefresh}>Scan again</button></div>
        ) : visibleTargets.map((target, index) => {
          const payout = getPayoutPresentation(target.safeBalance);
          const familiarity = getFamiliarity(target.securityLoadout.modules, familiarTypes);
          const availability = getTargetAvailability(target.attackFee, safeBalance, target.attackCooldownUntil, now);
          const { affordable, cooldown } = availability;
          const recent = recentlyAttacked.includes(target.id) || Boolean(target.lastAttackedAt && now - target.lastAttackedAt < 60 * 60_000);
          const practice = targetsSource === 'local' || target.isBotTarget;
          return (
            <motion.button
              key={target.id}
              type="button"
              className={`dossier-card difficulty-${target.difficultyBand} ${selectedTarget?.id === target.id ? 'dossier-card--selected' : ''}`}
              onClick={() => handleSelectTarget(target)}
              disabled={!availability.selectable || Boolean(target.unattackableReason)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * .025, .2) }}
              aria-label={`${target.ownerName}, ${difficultyCopy[target.difficultyBand]}, stake ${target.attackFee}, net payout ${Math.round(payout.netPayout)} tokens${!affordable ? ', unaffordable' : ''}`}
            >
              <div className="dossier-card__head">
                <TargetSafeGraphic size={62} difficulty={target.difficultyBand} />
                <div className="dossier-card__identity">
                  <span className="eyebrow">{firstHeist && index === 0 && target.difficultyBand === 'soft' ? 'GOOD FIRST TARGET' : practice ? 'PRACTICE BOT' : 'LIVE VAULT'}</span>
                  <strong>{target.ownerName}</strong>
                  {target.tagline && (
                    <em className="dossier-card__flavor" title="Callsign — flavor text, not a game state">“{target.tagline}”</em>
                  )}
                </div>
                <span className={`difficulty-mark difficulty-mark--${target.difficultyBand}`}><i aria-hidden="true" />{difficultyCopy[target.difficultyBand]}</span>
              </div>
              <div className="dossier-locks" aria-label={`${target.securityLoadout.modules.length} equipped locks`}>
                {target.securityLoadout.modules.map((module, lockIndex) => <span key={module.id}><GameIcon type={module.type} size={18} /><b>{lockIndex + 1}</b><small>{module.name}</small></span>)}
              </div>
              <div className="dossier-economy dossier-economy--simple">
                <span><small>Risk</small><b className={affordable ? '' : 'text-loss'}>{formatTokens(target.attackFee)}</b></span>
                <span className="dossier-economy__net"><small>Potential win</small><b>{formatTokens(payout.netPayout)}</b></span>
              </div>
              <div className="dossier-card__foot">
                <span><Clock3 size={14} /> {formatDuration(getExpectedDuration(target.securityLoadout.modules))}</span>
                <span><LockKeyhole size={14} /> {target.securityLoadout.modules.length} locks</span>
                <span>{familiarity.unfamiliar === 0 ? 'Familiar set' : `${familiarity.unfamiliar} unfamiliar`}</span>
                {!affordable && <StateBadge state="failed" label="Cannot afford" compact />}
                {cooldown && (
                  <StateBadge
                    state="warning"
                    label={`Recovering — free in ${formatCooldown((target.attackCooldownUntil ?? 0) - now)}`}
                    compact
                  />
                )}
                {target.unattackableReason === 'no_verifiable_lock' && (
                  <StateBadge state="failed" label="No defence to beat — can't be raided" compact />
                )}
                {!cooldown && recent && <StateBadge state="warning" label="Recently attacked" compact />}
              </div>
            </motion.button>
          );
        })}
      </section>

      <button className="exit-exposure-button" onClick={() => { exitHeistMode(); navigate('/'); }}>Exit exposure</button>

      {/* Portaled to <body> so the fixed-position sheet is always anchored
          to the viewport — a transformed/animating ancestor would otherwise
          become its containing block and push the dialog below the fold. */}
      {createPortal(<AnimatePresence>
        {selectedTarget && (() => {
          const payout = getPayoutPresentation(selectedTarget.safeBalance);
          return (
            <motion.div className="confirmation-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTarget(null)}>
              <motion.section className="attack-sheet" role="dialog" aria-modal="true" aria-labelledby="attack-confirmation-title" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28 }} onClick={(event) => event.stopPropagation()}>
                <button className="attack-sheet__close icon-button" onClick={() => setSelectedTarget(null)} aria-label="Close attack confirmation"><X size={20} /></button>
                <p className="eyebrow">FINAL ATTACK CHECK</p>
                <h2 id="attack-confirmation-title">Attack {selectedTarget.ownerName}?</h2>
                <div className="settlement-choice">
                  <StateFrame state="failed" label="Loss outcome"><AlertTriangle /><span>If any lock holds<InfoTip label={STAT_HELP.stake.title} body={STAT_HELP.stake.body} align="start" /></span><strong>-{formatTokens(selectedTarget.attackFee)} stake</strong></StateFrame>
                  <span className="settlement-choice__or">OR</span>
                  <StateFrame state="cracked" label="Win outcome"><Crosshair /><span>If every lock cracks<InfoTip label={STAT_HELP.netWin.title} body={STAT_HELP.netWin.body} align="end" /></span><strong>+{formatTokens(payout.netPayout)} net loot</strong></StateFrame>
                </div>
                <dl className="settlement-breakdown"><div><dt>Gross loot<InfoTip label={STAT_HELP.grossLoot.title} body={STAT_HELP.grossLoot.body} align="start" /></dt><dd>{formatTokens(payout.grossLoot)}</dd></div><div><dt>Platform cut<InfoTip label={STAT_HELP.platformCut.title} body={STAT_HELP.platformCut.body} align="start" /></dt><dd>-{formatTokens(payout.platformCut)}</dd></div><div><dt>Final net payout<InfoTip label={STAT_HELP.netWin.title} body={STAT_HELP.netWin.body} align="start" /></dt><dd>{formatTokens(payout.netPayout)}</dd></div></dl>
                <p className="attack-sheet__rule"><AlertTriangle size={16} /> The stake is already committed when the attack starts. Abandoning counts as a loss.</p>
                <div className="attack-sheet__actions"><button className="btn-secondary" onClick={() => setSelectedTarget(null)}>Cancel</button><button className="btn-danger" onClick={handleConfirmAttack}><Crosshair size={18} /> Risk {formatTokens(selectedTarget.attackFee)}</button></div>
              </motion.section>
            </motion.div>
          );
        })()}
      </AnimatePresence>, document.body)}
    </div>
  );
};
