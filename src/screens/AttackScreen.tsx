import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, ChevronRight, Coins, ArrowLeft } from 'lucide-react';
import { Card, Button, ProgressBar } from '../components/ui';
import { MiniGameHost } from '../components/minigames';

import { usePlayerStore } from '../store/playerStore';
import { useHeistStore } from '../store/heistStore';
import { useGameStore } from '../store/gameStore';
import { MiniGameResult } from '../types';
import { ECONOMY } from '../game/constants';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';

type Phase = 'ready' | 'playing' | 'result' | 'complete';

export const AttackScreen = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('ready');
  const [countdown, setCountdown] = useState(3);

  const {
    currentTarget,
    currentModuleIndex,
    moduleResults,
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
  const isServerAttack = Boolean(serverAttack);
  const targetName = serverAttack?.defenderHandle ?? currentTarget?.ownerName ?? 'target';

  // Redirect if no attack in progress
  useEffect(() => {
    if (!currentTarget && !serverAttack) {
      navigate('/heist');
    }
  }, [currentTarget, serverAttack, navigate]);

  // Countdown before starting
  useEffect(() => {
    if (phase !== 'ready') return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setPhase('playing');
    }
  }, [phase, countdown]);

  const handleModuleComplete = useCallback(
    (result: MiniGameResult) => {
      recordModuleResult(result);
      setPhase('result');

      // After showing result, check if passed
      setTimeout(() => {
        if (!result.passed) {
          // Failed this lock - heist ends immediately
          setPhase('complete');
        } else {
          // Passed - move to next module or complete if all done
          const hasMore = nextModule();
          if (hasMore) {
            setPhase('ready');
            setCountdown(2); // Shorter countdown between modules
          } else {
            setPhase('complete');
          }
        }
      }, 1500);
    },
    [recordModuleResult, nextModule]
  );

  /**
   * Ensure the client's cached balance matches the server truth
   * after any state-mutating call. Payload's newBalance is trusted
   * first; we fall back to a fresh safe row read in case the server
   * couldn't include it.
   */
  const rehydrateBalance = useCallback(async (newBalance: number | null | undefined) => {
    if (typeof newBalance === 'number') {
      usePlayerStore.setState({ safeBalance: newBalance });
      return;
    }
    const { data: sess } = await supabase.auth.getUser();
    const userId = sess.user?.id;
    if (!userId) return;
    const safe = await api.getSafe(userId);
    if (safe) usePlayerStore.setState({ safeBalance: safe.balance });
  }, []);

  const handleComplete = useCallback(async () => {
    if (isServerAttack) {
      try {
        const payload = await completeServerAttack();
        if (!payload) {
          navigate('/heist');
          return;
        }
        await rehydrateBalance(payload.newBalance);
        if (payload.status === 'won') {
          recordSuccessfulHeist();
          updateRiskRating(15);
          addNotification({
            type: 'attack_success',
            title: 'Heist Successful!',
            message: `You stole ${payload.loot - payload.platformFee} tokens from ${targetName}!`,
          });
        } else {
          updateRiskRating(-10);
          addNotification({
            type: 'attack_fail',
            title: 'Heist Failed',
            message: `You lost ${payload.stake} tokens attacking ${targetName}.`,
          });
        }
      } catch (err) {
        addNotification({
          type: 'attack_fail',
          title: 'Attack rejected',
          message: err instanceof Error ? err.message : 'Server refused this attack.',
        });
      }
      resetHeist();
      navigate('/heist');
      return;
    }

    // Legacy client-computed path (used when Supabase isn't configured
    // or for local dev / smoke tests).
    const result = completeAttack();
    if (!result) {
      navigate('/heist');
      return;
    }

    addAttackResult(result);
    updateBotCooldown(result.targetId);

    if (result.success) {
      addEarnings(result.lootGained);
      recordSuccessfulHeist();
      updateRiskRating(15);
      addNotification({
        type: 'attack_success',
        title: 'Heist Successful!',
        message: `You stole ${result.lootGained} tokens from ${result.targetName}!`,
      });
    } else {
      updateRiskRating(-10);
      addNotification({
        type: 'attack_fail',
        title: 'Heist Failed',
        message: `You lost ${stakePaid} tokens attacking ${result.targetName}.`,
      });
    }

    resetHeist();
    navigate('/heist');
  }, [
    isServerAttack,
    completeServerAttack,
    completeAttack,
    addAttackResult,
    updateBotCooldown,
    addEarnings,
    recordSuccessfulHeist,
    updateRiskRating,
    addNotification,
    stakePaid,
    resetHeist,
    navigate,
    targetName,
    rehydrateBalance,
  ]);

  const handleCancel = useCallback(async () => {
    // Abandoning still costs the stake, so we resolve the attack
    // server-side (submits whatever module results we have so far;
    // the server pads the rest as failed and marks it 'lost'). Then
    // refresh the balance from the server so the UI is truthful.
    if (isServerAttack) {
      try {
        const payload = await completeServerAttack();
        if (payload) await rehydrateBalance(payload.newBalance);
      } catch (err) {
        // Non-fatal — leave the pending attack in place; the hydrate
        // cleanup on next login will resolve it. Don't spam the user
        // with a modal here.
        // eslint-disable-next-line no-console
        console.warn('[cancel] submit_result failed', err);
      }
    }
    resetHeist();
    navigate('/heist');
  }, [isServerAttack, completeServerAttack, rehydrateBalance, resetHeist, navigate]);

  const seed = useMemo(() => {
    // Prefer the server-provided seed (deterministic + verifiable).
    if (currentModule && 'seed' in currentModule && currentModule.seed) {
      return currentModule.seed;
    }
    if (currentTarget && currentModule) {
      return `${currentTarget.id}:${currentModule.id}:${currentModuleIndex}`;
    }
    return '';
  }, [currentTarget, currentModule, currentModuleIndex]);

  if ((!currentTarget && !serverAttack) || !currentModule) {
    return null;
  }

  const lastResult = moduleResults[moduleResults.length - 1];
  const passedCount = moduleResults.filter((r) => r.passed).length;

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between border-b border-primary/10">
        <button
          onClick={handleCancel}
          className="p-2 text-text-dim hover:text-text"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="text-center">
          <p className="text-sm text-text-dim">Attacking</p>
          <p className="font-display font-semibold text-text">
            {targetName}
          </p>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </header>

      {/* Progress */}
      <div className="px-4 py-3 bg-surface/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-text-dim">
            Lock {progress.current} of {progress.total}
          </span>
          <span className="text-sm font-display text-primary">
            {passedCount}/{moduleResults.length} passed
          </span>
        </div>
        <ProgressBar
          value={(progress.current - 1) / progress.total * 100 + (phase === 'result' ? 100 / progress.total : 0)}
          variant="primary"
          size="sm"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          {/* Countdown */}
          {phase === 'ready' && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="text-center"
            >
              <p className="text-lg text-text-dim mb-4">
                {currentModule.name}
              </p>
              <motion.span
                key={countdown}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="font-display text-8xl font-bold text-primary neon-text-primary"
              >
                {countdown}
              </motion.span>
            </motion.div>
          )}

          {/* Mini-game */}
          {phase === 'playing' && (
            <motion.div
              key="game"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm"
            >
              <MiniGameHost
                key={seed}
                moduleType={currentModule.type as import('../types').ModuleType}
                moduleId={currentModule.id}
                difficulty={currentModule.difficulty}
                seed={seed}
                onComplete={handleModuleComplete}
                onFail={handleModuleComplete}
              />
            </motion.div>
          )}

          {/* Result */}
          {phase === 'result' && lastResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              {lastResult.passed ? (
                <>
                  <CheckCircle size={80} className="text-primary mx-auto mb-4" />
                  <p className="font-display text-2xl font-bold text-primary neon-text-primary">
                    Lock Cracked!
                  </p>
                  <p className="text-text-dim mt-2">
                    Score: {Math.round(lastResult.score * 100)}%
                  </p>
                </>
              ) : (
                <>
                  <XCircle size={80} className="text-danger mx-auto mb-4" />
                  <p className="font-display text-2xl font-bold text-danger">
                    Failed!
                  </p>
                  <p className="text-text-dim mt-2">
                    Score: {Math.round(lastResult.score * 100)}%
                  </p>
                </>
              )}
            </motion.div>
          )}

          {/* Complete */}
          {phase === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm text-center"
            >
              <Card variant="elevated" padding="lg">
                {passedCount === progress.total ? (
                  <>
                    <CheckCircle
                      size={64}
                      className="text-primary mx-auto mb-4"
                    />
                    <h2 className="font-display text-2xl font-bold text-primary neon-text-primary mb-2">
                      SAFE BREACHED!
                    </h2>
                    <p className="text-text-dim mb-4">
                      You cracked all {progress.total} locks!
                    </p>

                    <div className="flex items-center justify-center gap-2 text-2xl font-display font-bold text-primary mb-6">
                      <Coins size={28} />
                      <span>
                        +
                        {serverAttack
                          ? Math.round(serverAttack.potentialLoot * (1 - ECONOMY.platformCut))
                          : currentTarget
                            ? Math.round(
                                currentTarget.safeBalance *
                                  ECONOMY.lootFraction *
                                  (1 - ECONOMY.platformCut)
                              )
                            : 0}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle size={64} className="text-danger mx-auto mb-4" />
                    <h2 className="font-display text-2xl font-bold text-danger mb-2">
                      HEIST FAILED
                    </h2>
                    <p className="text-text-dim mb-4">
                      Failed on lock {passedCount + 1} of {progress.total}
                    </p>

                    <div className="text-lg text-text-dim mb-6">
                      <p className="mb-1">You must crack all locks to breach the safe!</p>
                      <p className="text-danger">Lost: {stakePaid} tokens</p>
                    </div>
                  </>
                )}

                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  onClick={handleComplete}
                >
                  Continue
                  <ChevronRight size={20} className="ml-2" />
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Module results strip */}
      {moduleResults.length > 0 && phase !== 'complete' && (
        <div className="px-4 py-3 bg-surface/50 border-t border-primary/10">
          <div className="flex gap-2 justify-center">
            {moduleResults.map((result, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  result.passed ? 'bg-primary/20' : 'bg-danger/20'
                }`}
              >
                {result.passed ? (
                  <CheckCircle size={18} className="text-primary" />
                ) : (
                  <XCircle size={18} className="text-danger" />
                )}
              </div>
            ))}
            {Array.from({
              length: progress.total - moduleResults.length,
            }).map((_, i) => (
              <div
                key={`pending-${i}`}
                className="w-8 h-8 rounded-full bg-surface-light border border-primary/20"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
