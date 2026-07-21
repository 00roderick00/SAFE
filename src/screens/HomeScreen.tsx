import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Crosshair,
  History,
  Settings,
  Shield,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ActivityFeed } from '../components/ActivityFeed';
import { EarningsGraph, TimeRangePills } from '../components/EarningsGraph';
import type { TimeRange } from '../components/earningsData';
import { filterDataByRange } from '../components/earningsData';
import { SafeGraphic, type VaultState } from '../components/SafeGraphic';
import { StateBadge, StateFrame } from '../components/game';
import { calculateEconomyStats } from '../game/economy';
import { buildServerDefenseEvent } from '../game/history';
import { buildBalanceHistory } from '../game/presentation';
import { api } from '../services/api';
import { useSession } from '../services/useSession';
import { useGameStore } from '../store/gameStore';
import { usePlayerStore } from '../store/playerStore';
import { haptics } from '../utils/haptics';

const formatTokens = (value: number) => `${Math.round(value).toLocaleString()} TK`;

export const HomeScreen = () => {
  const navigate = useNavigate();
  const session = useSession();
  const [now, setNow] = useState(() => Date.now());
  const [timeRange, setTimeRange] = useState<TimeRange>('1W');
  const {
    safeBalance,
    securityLoadout,
    insurancePolicy,
    heistModeActive,
    heistModeExpiresAt,
    exitHeistMode,
    addEarnings,
    consumeInsuranceClaim,
  } = usePlayerStore();
  const {
    simulateDefense,
    addDefenseEvent,
    addNotification,
    refreshBotSafes,
    botSafes,
    attackHistory,
    defenseHistory,
  } = useGameStore();

  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const insured = Boolean(insurancePolicy && now < insurancePolicy.expiresAt);
  const latestDefense = defenseHistory[0];
  const latestDefenseAge = latestDefense ? now - latestDefense.timestamp : Infinity;
  const vaultState: VaultState = heistModeActive
    ? 'exposed'
    : latestDefense && !latestDefense.success && latestDefenseAge < 8_000
      ? 'breached'
      : latestDefense && !latestDefense.success && latestDefenseAge < 5 * 60_000
        ? 'recovering'
        : 'secure';
  const timeRemaining = heistModeActive && heistModeExpiresAt
    ? Math.max(0, heistModeExpiresAt - now)
    : 0;
  const timeLabel = `${Math.floor(timeRemaining / 60_000)}:${Math.floor((timeRemaining % 60_000) / 1_000).toString().padStart(2, '0')}`;

  const balanceHistory = useMemo(
    () => buildBalanceHistory(safeBalance, attackHistory, defenseHistory),
    [safeBalance, attackHistory, defenseHistory],
  );
  const filteredHistory = useMemo(
    () => filterDataByRange(balanceHistory, timeRange),
    [balanceHistory, timeRange],
  );
  const periodDelta = filteredHistory.length > 1
    ? filteredHistory[filteredHistory.length - 1].value - filteredHistory[0].value
    : 0;

  const securityLabel = stats.securityScore >= 65 ? 'Hardened' : stats.securityScore >= 35 ? 'Operational' : 'Vulnerable';
  const recommendation = securityLoadout.modules.length < 3
    ? 'Fill every lock slot before exposing your vault.'
    : stats.securityScore < 35
      ? 'Raise one lock difficulty or add a logic game to strengthen your mix.'
      : insured
        ? 'Defense ready. Test the sequence, then choose a target.'
        : 'Defense ready. Insurance is optional before exposure.';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (heistModeActive && heistModeExpiresAt && now >= heistModeExpiresAt) {
      exitHeistMode();
      addNotification({
        type: 'heist_ended',
        title: 'Exposure ended',
        message: 'Your vault is secure again.',
      });
    }
  }, [heistModeActive, heistModeExpiresAt, now, exitHeistMode, addNotification]);

  useEffect(() => {
    if (!heistModeActive) return;
    const interval = window.setInterval(async () => {
      if (session) {
        try {
          const result = await api.resolveDefense();
          if (!result.attacked) return;
          if (typeof result.newBalance === 'number') usePlayerStore.setState({ safeBalance: result.newBalance });
          // Log the server-resolved defense to History (not just a
          // transient notification). UX-FINDINGS P1.1.
          addDefenseEvent(buildServerDefenseEvent(result, Date.now()));
          addNotification({
            type: result.success ? 'defense_success' : 'defense_fail',
            title: result.success ? 'Attack repelled' : 'Vault breached',
            message: result.success
              ? `${result.attackerName} failed. You earned ${result.feeEarned} tokens.`
              : `${result.attackerName} took ${result.lootLost} tokens${(result.insurancePayout ?? 0) > 0 ? `; insurance returned ${result.insurancePayout}` : ''}.`,
          });
        } catch (error) {
          console.warn('[defense] server tick failed', error);
        }
        return;
      }
      const state = usePlayerStore.getState();
      const result = simulateDefense(state.safeBalance, state.securityLoadout, state.insurancePolicy);
      if (!result) return;
      addDefenseEvent(result);
      if (result.success) {
        addEarnings(result.feeEarned);
      } else {
        state.recordLoss(result.lootLost);
        if (result.insurancePayout > 0) {
          addEarnings(result.insurancePayout);
          consumeInsuranceClaim();
        }
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [heistModeActive, session, simulateDefense, addDefenseEvent, addNotification, addEarnings, consumeInsuranceClaim]);

  useEffect(() => {
    if (botSafes.length === 0) refreshBotSafes(usePlayerStore.getState().riskRating);
  }, [botSafes.length, refreshBotSafes]);

  const setRange = useCallback((range: TimeRange) => {
    haptics.selection();
    setTimeRange(range);
  }, []);

  const handlePrimaryAction = () => {
    haptics.medium();
    if (heistModeActive) {
      navigate('/heist');
    } else if (securityLoadout.modules.length < 3 || stats.securityScore < 35) {
      navigate('/security');
    } else {
      navigate('/heist');
    }
  };

  const primaryLabel = heistModeActive
    ? 'Continue heist'
    : securityLoadout.modules.length < 3 || stats.securityScore < 35
      ? 'Strengthen defenses'
      : 'Enter heist mode';

  return (
    <div className={`home-vault ${heistModeActive ? 'danger-mode' : ''}`}>
      <header className="tactical-header">
        <div>
          <p className="eyebrow">SAFE // VAULT 01</p>
          <h1>Command vault</h1>
        </div>
        <button className="icon-button" onClick={() => navigate('/security')} aria-label="Open vault settings">
          <Settings size={21} aria-hidden="true" />
        </button>
      </header>

      <main>
        <div className="vault-status-row">
          <StateBadge state={vaultState} />
          {heistModeActive && <span className="exposure-clock"><AlertTriangle size={15} /> Exposure {timeLabel}</span>}
        </div>

        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}>
          <SafeGraphic
            size={330}
            state={vaultState}
            balance={safeBalance}
            locks={securityLoadout.modules}
            insured={insured}
            onLockSelect={(index) => navigate(`/security/pick/${index}`)}
          />
        </motion.div>

        <section className="vault-metrics" aria-label="Vault status details">
          <div><span>Balance</span><strong>{formatTokens(safeBalance)}</strong></div>
          <div><span>Potential loss</span><strong className="text-warning">{formatTokens(stats.potentialLoot)}</strong></div>
          <div><span>Security</span><strong>{securityLabel} · {Math.round(stats.securityScore)}</strong></div>
          <div><span>Insurance</span><strong>{insured ? 'Active' : 'Not active'}</strong></div>
        </section>

        <StateFrame state={stats.securityScore < 35 ? 'warning' : 'secure'} className="next-action-panel" label="Recommended next action">
          <div>
            <p className="eyebrow">NEXT ACTION</p>
            <strong>{recommendation}</strong>
          </div>
          <ArrowRight size={20} aria-hidden="true" />
        </StateFrame>

        <div className="vault-quick-actions">
          <button className="btn-secondary" onClick={() => navigate('/security?test=sequence')}>
            <TestTube2 size={18} aria-hidden="true" /> Test my vault
          </button>
          <button className="btn-secondary" onClick={() => navigate('/insurance')}>
            <ShieldCheck size={18} aria-hidden="true" /> Insurance
          </button>
        </div>

        <section className="home-section">
          <div className="section-title-row">
            <div><p className="eyebrow">DEFENSE LOG</p><h2>Latest contact</h2></div>
            <button onClick={() => navigate('/history')} className="text-button"><History size={16} /> Full log</button>
          </div>
          {latestDefense ? (
            <StateFrame state={latestDefense.success ? 'secure' : 'breached'} className="recent-defense" label="Recent defensive result">
              <Shield size={22} aria-hidden="true" />
              <div>
                <strong>{latestDefense.success ? 'Attack repelled' : 'Vault breached'}</strong>
                <span>{latestDefense.attackerName} · {latestDefense.success ? `+${latestDefense.feeEarned} TK earned` : `-${latestDefense.lootLost - latestDefense.insurancePayout} TK net loss`}</span>
              </div>
            </StateFrame>
          ) : (
            <div className="honest-empty"><Activity size={24} /><div><strong>No defensive contacts</strong><span>Expose your vault to begin recording real results.</span></div></div>
          )}
        </section>

        <details className="stats-disclosure home-section">
          <summary><span><Activity size={18} /> Vault statistics</span><span>Secondary</span></summary>
          {balanceHistory.length > 1 ? (
            <div className="stats-content">
              <div className="section-title-row"><span className="eyebrow">SETTLED BALANCE HISTORY</span><strong className={periodDelta >= 0 ? 'text-profit' : 'text-loss'}>{periodDelta >= 0 ? '+' : ''}{Math.round(periodDelta)} TK</strong></div>
              <EarningsGraph data={filteredHistory} height={128} />
              <TimeRangePills selected={timeRange} onChange={setRange} />
            </div>
          ) : (
            <div className="honest-empty"><Activity size={24} /><div><strong>No performance history yet</strong><span>The chart appears after real settled attacks or defenses.</span></div></div>
          )}
        </details>

        <section className="home-section activity-section">
          <div className="section-title-row"><div><p className="eyebrow">ACTIVITY</p><h2>Operations log</h2></div></div>
          <ActivityFeed />
        </section>
      </main>

      <div className="action-bar" aria-label="Vault actions">
        {heistModeActive && (
          <button className="btn-secondary" onClick={() => { haptics.light(); exitHeistMode(); }}>
            Exit exposure
          </button>
        )}
        <button className={heistModeActive ? 'btn-danger' : 'btn-neon'} onClick={handlePrimaryAction}>
          <Crosshair size={18} aria-hidden="true" /> {primaryLabel}
        </button>
      </div>
    </div>
  );
};
