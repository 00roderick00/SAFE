import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, LockKeyhole, Radio, Volume2, VolumeX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BreachHud, GameIcon, VaultOutcome, type BreachRailLock } from '../components/game';
import { MiniGameHost, preloadMiniGames } from '../components/minigames';
import { MODULE_CONFIG } from '../game/constants';
import { calculateLootDistribution } from '../game/economy';
import { buildServerAttackResult } from '../game/history';
import { getMiniGameBrief, getModuleDuration } from '../game/minigamePresentation';
import { getPayoutPresentation } from '../game/presentation';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { useGameStore } from '../store/gameStore';
import { useHeistStore } from '../store/heistStore';
import { usePlayerStore } from '../store/playerStore';
import type { MiniGameResult, ModuleType } from '../types';
import { gameAudio } from '../utils/gameFeedback';
import { haptics } from '../utils/haptics';

type Phase = 'briefing' | 'playing' | 'feedback' | 'settling' | 'outcome';

interface SettlementView {
  success: boolean;
  stake: number;
  grossLoot: number;
  platformFee: number;
  netLoot: number;
  /** Run was abandoned mid-attack rather than played to a loss. */
  abandoned?: boolean;
}

const seenBriefings = new Set<ModuleType>();

export const AttackScreen = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('briefing');
  const [now, setNow] = useState(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState(() => gameAudio.isEnabled());
  const [settlement, setSettlement] = useState<SettlementView | null>(null);
  const settlingRef = useRef(false);
  const {
    currentTarget,
    currentModuleIndex,
    moduleResults,
    attackStartedAt,
    stakePaid,
    serverAttack,
    recordModuleResult,
    nextModule,
    completeAttack,
    completeServerAttack,
    resetHeist,
    getCurrentModule,
    getProgress,
  } = useHeistStore();
  const { addEarnings, recordSuccessfulHeist, updateRiskRating } = usePlayerStore();
  const { addAttackResult, addNotification, updateBotCooldown } = useGameStore();
  const currentModule = getCurrentModule();
  const progress = getProgress();
  const targetName = serverAttack?.defenderHandle ?? currentTarget?.ownerName ?? 'Target';
  const isServerAttack = Boolean(serverAttack);

  useEffect(() => {
    if (!currentTarget && !serverAttack) navigate('/heist');
  }, [currentTarget, serverAttack, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Warm every lock's lazy chunk as soon as the attack mounts so the
  // breach clock never ticks against "Loading lock mechanism…".
  useEffect(() => {
    const types = serverAttack
      ? serverAttack.modules.map((m) => (m.baseEngine ?? m.moduleType))
      : currentTarget?.securityLoadout.modules.map((m) => m.type) ?? [];
    preloadMiniGames(types);
  }, [serverAttack, currentTarget]);

  const modules = useMemo(() => {
    if (serverAttack) {
      return serverAttack.modules.map((module) => {
        const type = (module.baseEngine ?? module.moduleType) as ModuleType;
        const config = MODULE_CONFIG[type as keyof typeof MODULE_CONFIG];
        return { id: `${serverAttack.attackId}-${module.index}`, type, name: config?.name ?? module.moduleType };
      });
    }
    return (currentTarget?.securityLoadout.modules ?? []).map((module) => ({ id: module.id, type: module.type, name: module.name }));
  }, [serverAttack, currentTarget]);

  const payout = useMemo(() => {
    if (serverAttack) {
      const split = calculateLootDistribution(serverAttack.potentialLoot);
      return { grossLoot: serverAttack.potentialLoot, platformCut: split.platformReceives, netPayout: split.attackerReceives };
    }
    return getPayoutPresentation(currentTarget?.safeBalance ?? 0);
  }, [serverAttack, currentTarget]);

  const totalDuration = modules.reduce((total, module) => total + getModuleDuration(module.type), 0);
  const elapsed = attackStartedAt ? Math.floor((now - attackStartedAt) / 1_000) : 0;
  const remainingTime = Math.max(0, totalDuration - elapsed);
  const passedCount = moduleResults.filter((result) => result.passed).length;
  const failedIndex = moduleResults.findIndex((result) => !result.passed);
  const overallProgress = settlement?.success
    ? 100
    : Math.round((passedCount / Math.max(1, progress.total)) * 100);

  const railLocks: BreachRailLock[] = modules.map((module, index) => {
    const result = moduleResults[index];
    const status = result
      ? result.passed ? 'cracked' : 'failed'
      : index === currentModuleIndex && phase !== 'outcome' ? 'active' : 'pending';
    return { ...module, status };
  });

  const rehydrateBalance = useCallback(async (newBalance: number | null | undefined) => {
    if (typeof newBalance === 'number') {
      usePlayerStore.setState({ safeBalance: newBalance });
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user?.id) return;
    const safe = await api.getSafe(data.user.id);
    if (safe) usePlayerStore.setState({ safeBalance: safe.balance });
  }, []);

  const settleAttack = useCallback(async (abandoned = false) => {
    if (settlingRef.current) return;
    settlingRef.current = true;
    setPhase('settling');
    if (isServerAttack) {
      try {
        const payload = await completeServerAttack();
        if (!payload) throw new Error('No settlement returned.');
        await rehydrateBalance(payload.newBalance);
        const success = payload.status === 'won';
        const netLoot = success ? payload.loot - payload.platformFee : 0;
        // Record the settled server attack in History (both sides log to
        // the same activity list). UX-FINDINGS P1.1.
        addAttackResult(
          buildServerAttackResult(payload, { attackId: serverAttack!.attackId, targetName }, Date.now())
        );
        if (success) {
          recordSuccessfulHeist();
          updateRiskRating(15);
          addNotification({ type: 'attack_success', title: 'Full breach', message: `${netLoot} net tokens received from ${targetName}.` });
          haptics.success();
          gameAudio.play('breach');
        } else {
          updateRiskRating(-10);
          addNotification({ type: 'attack_fail', title: 'Heist failed', message: `${payload.stake} token stake lost against ${targetName}.` });
          haptics.error();
          gameAudio.play('fail');
        }
        setSettlement({ success, stake: payload.stake, grossLoot: payload.loot, platformFee: payload.platformFee, netLoot, abandoned: abandoned && !success });
      } catch (error) {
        addNotification({ type: 'attack_fail', title: 'Settlement rejected', message: error instanceof Error ? error.message : 'Server refused this result.' });
        setSettlement({ success: false, stake: stakePaid, grossLoot: 0, platformFee: 0, netLoot: 0, abandoned });
      }
      setPhase('outcome');
      return;
    }

    const result = completeAttack();
    if (!result) {
      setSettlement({ success: false, stake: stakePaid, grossLoot: 0, platformFee: 0, netLoot: 0, abandoned });
      setPhase('outcome');
      return;
    }
    addAttackResult(result);
    updateBotCooldown(result.targetId);
    if (result.success) {
      addEarnings(result.lootGained);
      recordSuccessfulHeist();
      updateRiskRating(15);
      addNotification({ type: 'attack_success', title: 'Full breach', message: `${result.lootGained} net tokens received from ${result.targetName}.` });
      haptics.success();
      gameAudio.play('breach');
    } else {
      updateRiskRating(-10);
      addNotification({ type: 'attack_fail', title: 'Heist failed', message: `${stakePaid} token stake lost against ${result.targetName}.` });
      haptics.error();
      gameAudio.play('fail');
    }
    setSettlement({ success: result.success, stake: result.stakePaid, grossLoot: result.success ? result.lootGained + result.platformFee : 0, platformFee: result.platformFee, netLoot: result.lootGained, abandoned: abandoned && !result.success });
    setPhase('outcome');
  }, [isServerAttack, serverAttack, completeServerAttack, rehydrateBalance, recordSuccessfulHeist, updateRiskRating, addNotification, targetName, stakePaid, completeAttack, addAttackResult, updateBotCooldown, addEarnings]);

  const handleModuleComplete = useCallback((result: MiniGameResult) => {
    recordModuleResult(result);
    setPhase('feedback');
    if (result.passed) {
      haptics.success();
      gameAudio.play('crack');
    } else {
      haptics.error();
      gameAudio.play('fail');
    }
    window.setTimeout(() => {
      if (!result.passed) {
        void settleAttack();
        return;
      }
      const hasMore = nextModule();
      if (hasMore) {
        setPhase('briefing');
        gameAudio.play('ready');
      } else {
        void settleAttack();
      }
    }, 1_050);
  }, [recordModuleResult, nextModule, settleAttack]);

  // Enforce the breach clock: when the shared timer runs out mid-attack,
  // the current lock counts as held and the attack settles as a loss.
  // Without this the HUD hit 0s while the minigame stayed playable forever.
  useEffect(() => {
    if (remainingTime > 0 || !attackStartedAt) return;
    if (phase !== 'playing' && phase !== 'briefing') return;
    if (!currentModule) return;
    handleModuleComplete({
      moduleId: currentModule.id,
      moduleType: currentModule.type,
      score: 0,
      passed: false,
      timeSpent: totalDuration * 1_000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingTime, phase, attackStartedAt]);

  const handleCancel = useCallback(() => {
    // Recap already on screen → leave to the heist list.
    if (phase === 'outcome') {
      resetHeist();
      navigate('/heist');
      return;
    }
    // A settlement is already in flight (notably the async server
    // round-trip, which sits in the 'settling' phase). Do NOT bail to
    // /heist and skip the recap — let it resolve into the outcome screen.
    // This is the server-path gap in UX-FINDINGS P1.2: the old guard
    // navigated away during 'settling', so signed-in abandons never
    // showed "Attack abandoned".
    if (settlingRef.current) return;
    // Active attack → abandoning forfeits the committed stake. Route it
    // through the SAME outcome recap as a played loss instead of silently
    // dropping the balance.
    void settleAttack(true);
  }, [phase, settleAttack, resetHeist, navigate]);

  const seed = useMemo(() => {
    if (currentModule?.seed) return currentModule.seed;
    if (currentTarget && currentModule) return `${currentTarget.id}:${currentModule.id}:${currentModuleIndex}`;
    return '';
  }, [currentTarget, currentModule, currentModuleIndex]);

  if ((!currentTarget && !serverAttack) || !currentModule) return null;
  const moduleType = currentModule.type as ModuleType;
  const brief = getMiniGameBrief(moduleType);
  const seen = seenBriefings.has(moduleType);
  const lastResult = moduleResults[moduleResults.length - 1];

  const startLock = () => {
    seenBriefings.add(moduleType);
    gameAudio.play('tick');
    setPhase('playing');
  };
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    gameAudio.setEnabled(next);
  };
  const leaveOutcome = () => {
    resetHeist();
    navigate('/heist');
  };

  return (
    <div className="breach-screen">
      <header className="breach-topbar">
        <button className="icon-button" onClick={handleCancel} aria-label="Abandon attack and lose the committed stake"><ArrowLeft size={20} /></button>
        <div><span className="eyebrow">LIVE BREACH</span><strong>{targetName}</strong></div>
        <button className="icon-button" onClick={toggleSound} aria-label={soundEnabled ? 'Mute game sound' : 'Enable game sound'} aria-pressed={soundEnabled}>{soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
      </header>

      <BreachHud
        target={targetName}
        stake={stakePaid}
        netLoot={payout.netPayout}
        current={progress.current}
        total={progress.total}
        timeLeft={remainingTime}
        progress={overallProgress}
        locks={railLocks}
      />

      <main className="breach-stage">
        <AnimatePresence mode="wait">
          {phase === 'briefing' && (
            <motion.section key={`brief-${currentModuleIndex}`} className="lock-brief" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="lock-brief__emblem"><GameIcon type={moduleType} size={42} /><span>{progress.current}</span></div>
              <p className="eyebrow">LOCK {progress.current} / {progress.total}</p>
              <h1>{brief.name}</h1>
              <dl><div><dt>Objective</dt><dd>{brief.objective}</dd></div><div><dt>Pass requirement</dt><dd>{brief.passRequirement}</dd></div><div><dt>Controls</dt><dd>{brief.controls}</dd></div></dl>
              <button className="btn-danger lock-brief__start" onClick={startLock}><Radio size={18} /> {seen ? 'Skip briefing & start' : 'Begin lock'}</button>
            </motion.section>
          )}

          {phase === 'playing' && (
            <motion.section key={`game-${seed}`} className="minigame-bay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label={`${brief.name} playfield`}>
              <div className="minigame-bay__label"><span>{brief.name}</span><span>Goal: {brief.passRequirement}</span></div>
              <div className="minigame-bay__playfield">
                <MiniGameHost
                  key={seed}
                  moduleType={moduleType}
                  moduleId={currentModule.id}
                  difficulty={currentModule.difficulty}
                  seed={seed}
                  config={currentModule.customConfig?.config}
                  mode={currentModule.customConfig?.mode}
                  onComplete={handleModuleComplete}
                  onFail={handleModuleComplete}
                />
              </div>
            </motion.section>
          )}

          {phase === 'feedback' && lastResult && (
            <motion.section key="feedback" className={`lock-feedback lock-feedback--${lastResult.passed ? 'cracked' : 'failed'}`} initial={{ opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="feedback-bolt" aria-hidden="true"><i /><i /><span /></div>
              <GameIcon type={moduleType} size={38} />
              <p className="eyebrow">LOCK {progress.current}</p>
              <h2>{lastResult.passed ? 'Bolt retracted' : 'Bolt slammed shut'}</h2>
              <p>{lastResult.passed ? `${brief.name} cracked · ${Math.round(lastResult.score * 100)}%` : `Breach stopped · ${Math.round(lastResult.score * 100)}% · stake will be lost`}</p>
            </motion.section>
          )}

          {phase === 'settling' && (
            <motion.section key="settling" className="settling-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ScanSettlement />
              <p className="eyebrow">CHECKING YOUR RUN</p><h2>Locking in the result</h2><p>Confirming your locks before any tokens move.</p>
            </motion.section>
          )}

          {phase === 'outcome' && settlement && (
            <motion.section key="outcome" className="outcome-panel" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}>
              <VaultOutcome success={settlement.success} target={targetName} stake={settlement.stake} grossLoot={settlement.grossLoot} platformFee={settlement.platformFee} netLoot={settlement.netLoot} abandoned={settlement.abandoned} />
              <button className={settlement.success ? 'btn-neon outcome-continue' : 'btn-danger outcome-continue'} onClick={leaveOutcome}>{settlement.success ? 'Find another target' : settlement.abandoned ? 'Leave heist' : 'Find another target'}</button>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {failedIndex >= 0 && phase !== 'outcome' && <div className="breach-consequence"><AlertTriangle size={15} /> Lock {failedIndex + 1} held. You'll lose the stake.</div>}
    </div>
  );
};

const ScanSettlement = () => (
  <div className="settlement-scanner" aria-hidden="true"><LockKeyhole size={36} /><i /><i /><i /></div>
);
