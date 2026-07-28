import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  FlaskConical,
  Layers3,
  Play,
  Shield,
  Sparkles,
  Store,
  LockKeyhole,
  TestTube2,
  X,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GameEmblem, GameIcon, StateBadge, StateFrame } from '../components/game';
import { MiniGameHost } from '../components/minigames';
import { getCatalogMeta, getDefenseMix } from '../game/catalog';
import { requirementFor } from '../game/progression';
import { InfoTip } from '../components/InfoTip';
import { STAT_HELP } from '../game/statHelp';
import { useSurfaceUnlocked } from '../store/useUnlockTier';
import { calculateEconomyStats } from '../game/economy';
import { isVerifiableModule } from '../game/lockSolutions';
import { api } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { usePlayerStore } from '../store/playerStore';
import type { MiniGameResult } from '../types';
import { haptics } from '../utils/haptics';

const LOCK_ROLES = [
  { label: 'Perimeter', description: 'First contact: set the pace and punish rushed attackers.' },
  { label: 'Pressure gate', description: 'Mid-sequence: switch skill type to break attacker rhythm.' },
  { label: 'Deadbolt', description: 'Final barrier: demand precision after fatigue has built.' },
];

export const SecurityScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { securityLoadout, safeBalance, insurancePolicy, reorderSecurityModules } = usePlayerStore();
  const [now] = useState(() => Date.now());
  const [testIndex, setTestIndex] = useState<number | null>(() => searchParams.get('test') === 'sequence' ? 0 : null);
  const [sequenceTest, setSequenceTest] = useState(() => searchParams.get('test') === 'sequence');
  const [testResults, setTestResults] = useState<MiniGameResult[]>([]);
  const stats = calculateEconomyStats(safeBalance, securityLoadout);
  const insured = Boolean(insurancePolicy && now < insurancePolicy.expiresAt);
  const marketUnlocked = useSurfaceUnlocked('marketplace');
  const createUnlocked = useSurfaceUnlocked('create');
  const insuranceUnlocked = useSurfaceUnlocked('insurance');
  const mix = getDefenseMix(securityLoadout.modules.map((module) => module.type));
  // Composition guarantee: a safe with no server-verifiable lock cannot
  // defend real stakes — the server can't prove any lock was actually
  // beaten, so an attacker could only be stopped by forgeable checks. We
  // surface this and force such attacks to a loss server-side.
  const verifiableCount = securityLoadout.modules.filter((module) => isVerifiableModule(module)).length;
  const currentTestModule = testIndex === null ? null : securityLoadout.modules[testIndex];

  const persistLoadout = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) await api.updateLoadout(data.session.user.id, usePlayerStore.getState().securityLoadout);
    } catch {
      // Reorder remains available for offline practice.
    }
  };

  const moveLock = (from: number, to: number) => {
    haptics.selection();
    reorderSecurityModules(from, to);
    void persistLoadout();
  };

  const startSingleTest = (index: number) => {
    setSequenceTest(false);
    setTestResults([]);
    setTestIndex(index);
  };

  const startSequenceTest = () => {
    setSequenceTest(true);
    setTestResults([]);
    setTestIndex(0);
  };

  const handleTestComplete = (result: MiniGameResult) => {
    setTestResults((items) => [...items, result]);
    haptics[result.passed ? 'success' : 'error']();
    if (sequenceTest && testIndex !== null && testIndex < securityLoadout.modules.length - 1) {
      setTestIndex(testIndex + 1);
    } else {
      window.setTimeout(() => setTestIndex(null), 650);
    }
  };

  return (
    <div className="defense-screen">
      <header className="tactical-header defense-header">
        <button className="icon-button" onClick={() => navigate('/')} aria-label="Back to vault"><ArrowLeft size={20} /></button>
        <div><p className="eyebrow">VAULT ENGINEERING</p><h1>Defense array</h1></div>
        <StateBadge state={stats.securityScore >= 35 ? 'secure' : 'warning'} label={`${Math.round(stats.securityScore)} strength`} compact />
      </header>

      <main>
        <section className="defense-summary">
          <div className="defense-summary__score"><Shield size={30} /><span>SECURITY STRENGTH<InfoTip label={STAT_HELP.securityStrength.title} body={STAT_HELP.securityStrength.body} align="start" /></span><strong>{Math.round(stats.securityScore)}</strong><small>{stats.securityScore >= 65 ? 'Hardened' : stats.securityScore >= 35 ? 'Operational' : 'Vulnerable'}</small></div>
          <div className="defense-summary__intel"><span>Potential breach loss <b>{Math.round(stats.potentialLoot).toLocaleString()} TK</b><InfoTip label={STAT_HELP.potentialBreachLoss.title} body={STAT_HELP.potentialBreachLoss.body} align="end" /></span><span>Insurance <b>{insured ? 'Active' : 'Not active'}</b><InfoTip label={STAT_HELP.insurance.title} body={STAT_HELP.insurance.body} align="end" /></span><span>Skill coverage <b>{mix.covered.length} / 5</b><InfoTip label={STAT_HELP.skillCoverage.title} body={STAT_HELP.skillCoverage.body} align="end" /></span></div>
        </section>

        {verifiableCount === 0 && (
          <StateFrame state="failed" className="verify-warning" label="Safe not defendable" aria-live="polite">
            <Shield size={22} />
            <div>
              <p className="eyebrow">UNVERIFIED DEFENSE</p>
              <strong>This safe can't defend real stakes</strong>
              <span>None of its locks can be verified by the server, so raids on it are auto-forfeited by the attacker (no tokens are ever won or lost). Equip at least one verifiable lock — Keypad, Color Code, or Combo Dial — or a custom game.</span>
            </div>
            <button className="text-button" onClick={() => navigate('/security/pick/2')}>Fix it <ChevronRight size={15} /></button>
          </StateFrame>
        )}

        <section className="defense-mix" aria-label="Defensive mix analysis">
          <div className="section-title-row"><div><p className="eyebrow">DEFENSIVE MIX</p><h2>Coverage analysis</h2></div><Layers3 size={20} /></div>
          <div className="mix-tags">{mix.covered.map((skill) => <StateBadge key={skill} state="secure" label={`${skill} covered`} compact />)}{mix.gaps.map((skill) => <StateBadge key={skill} state="warning" label={`${skill} gap`} compact />)}</div>
          <p>{mix.gaps.length ? `Add ${mix.gaps.slice(0, 2).join(' or ')} to force attackers to switch skills.` : 'Balanced mix: every attacker skill is challenged.'}</p>
        </section>

        <section className="defense-lock-list" aria-label="Equipped lock sequence">
          <div className="section-title-row"><div><p className="eyebrow">3-LOCK SEQUENCE</p><h2>Equipped defenses</h2></div><button className="text-button" onClick={startSequenceTest}><TestTube2 size={16} /> Test full sequence</button></div>
          {securityLoadout.modules.map((module, index) => {
            const meta = getCatalogMeta(module.type);
            const role = LOCK_ROLES[index];
            return (
              <motion.article key={module.id} className="equipped-lock" layout>
                <div className="equipped-lock__index"><span>0{index + 1}</span><i /></div>
                <GameEmblem type={module.type} />
                <div className="equipped-lock__copy"><p className="eyebrow">{role.label}</p><h3>{module.name}</h3><span>{role.description}</span><div>{meta.skills.map((skill) => <b key={skill}>{skill}</b>)}<b>{Math.round(module.difficulty * 100)}% difficulty</b></div></div>
                <div className="equipped-lock__actions">
                  <button onClick={() => startSingleTest(index)} aria-label={`Test ${module.name}`}><Play size={17} /><span>Test</span></button>
                  <button onClick={() => navigate(`/security/pick/${index}`)} aria-label={`Replace ${module.name}`}><GameIcon type={module.type} size={17} /><span>Replace</span></button>
                  <button onClick={() => moveLock(index, index - 1)} disabled={index === 0} aria-label={`Move ${module.name} earlier`}><ArrowUp size={17} /></button>
                  <button onClick={() => moveLock(index, index + 1)} disabled={index === securityLoadout.modules.length - 1} aria-label={`Move ${module.name} later`}><ArrowDown size={17} /></button>
                </div>
              </motion.article>
            );
          })}
        </section>

        <section className="defense-tools">
          {createUnlocked ? (
            <button onClick={() => navigate('/custom-games')}><span><Sparkles size={19} /><b>Build a game</b><small>Create a custom defense with the existing verified runtime.</small></span><ChevronRight /></button>
          ) : (
            <button className="opacity-45 cursor-not-allowed" aria-disabled="true" aria-label={`Build a game — locked. ${requirementFor('create')}.`}><span><Sparkles size={19} /><b>Build a game</b><small>{requirementFor('create')} to unlock.</small></span><LockKeyhole size={16} /></button>
          )}
          {marketUnlocked ? (
            <button onClick={() => navigate('/marketplace')}><span><Store size={19} /><b>Browse community games</b><small>Equip a calibrated creator game and preserve royalties.</small></span><ChevronRight /></button>
          ) : (
            <button className="opacity-45 cursor-not-allowed" aria-disabled="true" aria-label={`Community games — locked. ${requirementFor('marketplace')}.`}><span><Store size={19} /><b>Browse community games</b><small>{requirementFor('marketplace')} to unlock.</small></span><LockKeyhole size={16} /></button>
          )}
        </section>

        {insuranceUnlocked ? (
          <StateFrame state={insured ? 'secure' : 'warning'} className="insurance-link" label="Insurance state"><Shield size={22} /><div><p className="eyebrow">INSURANCE</p><strong>{insured ? `${Math.round((insurancePolicy?.coverage ?? 0) * 100)}% coverage active` : 'No active loss coverage'}</strong></div><button className="text-button" onClick={() => navigate('/insurance')}>{insured ? 'Manage' : 'Review plans'} <ChevronRight size={15} /></button></StateFrame>
        ) : (
          <StateFrame state="warning" className="insurance-link opacity-60" label="Insurance state"><Shield size={22} /><div><p className="eyebrow">INSURANCE</p><strong>Locked — {requirementFor('insurance').toLowerCase()}</strong></div><LockKeyhole size={16} aria-hidden="true" /></StateFrame>
        )}
      </main>

      <AnimatePresence>
        {currentTestModule && (
          <motion.div className="defense-test-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="defense-test-modal" role="dialog" aria-modal="true" aria-labelledby="defense-test-title">
              <header><div><p className="eyebrow">{sequenceTest ? `SEQUENCE ${testIndex! + 1} / ${securityLoadout.modules.length}` : 'INDIVIDUAL LOCK TEST'}</p><h2 id="defense-test-title">{currentTestModule.name}</h2></div><button className="icon-button" onClick={() => setTestIndex(null)} aria-label="Close defense test"><X size={20} /></button></header>
              {sequenceTest && <div className="test-sequence-rail">{securityLoadout.modules.map((module, index) => <span key={module.id} className={index < testResults.length ? testResults[index]?.passed ? 'passed' : 'failed' : index === testIndex ? 'active' : ''}><GameIcon type={module.type} size={16} /> Lock {index + 1}</span>)}</div>}
              <div className="defense-test-playfield"><MiniGameHost key={`${currentTestModule.id}-${testIndex}`} moduleType={currentTestModule.type} moduleId={`defense-test-${currentTestModule.id}`} difficulty={currentTestModule.difficulty} seed={`defense-test-${currentTestModule.id}`} config={currentTestModule.customConfig?.config} mode={currentTestModule.customConfig?.mode} onComplete={handleTestComplete} onFail={handleTestComplete} /></div>
              <p className="test-note"><FlaskConical size={15} /> Practice only. No stake, loot, or balance changes.</p>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
