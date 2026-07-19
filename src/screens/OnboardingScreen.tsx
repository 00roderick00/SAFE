import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, Crosshair, LockKeyhole, Shield, Sparkles } from 'lucide-react';
import { SafeGraphic } from '../components/SafeGraphic';
import { GameIcon, StateBadge, StateFrame } from '../components/game';
import { ECONOMY } from '../game/constants';
import { getPayoutPresentation } from '../game/presentation';
import { usePlayerStore } from '../store/playerStore';
import { haptics } from '../utils/haptics';

interface OnboardingScreenProps { onComplete: () => void; }
type TutorialStep = 'inspect' | 'practice' | 'breach' | 'exposure';
const STEPS: TutorialStep[] = ['inspect', 'practice', 'breach', 'exposure'];

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [inspected, setInspected] = useState(false);
  const [practiceProgress, setPracticeProgress] = useState(0);
  const [username, setUsernameInput] = useState('');
  const { securityLoadout, safeBalance, setUsername: saveUsername, completeOnboarding } = usePlayerStore();
  const step = STEPS[stepIndex];
  const practiceComplete = practiceProgress === 3;
  const examplePayout = getPayoutPresentation(5_000);

  const finish = () => {
    if (username.trim()) saveUsername(username.trim());
    completeOnboarding();
    onComplete();
  };
  const next = () => {
    haptics.medium();
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };
  const hitNode = (node: number) => {
    if (practiceComplete) return;
    if (node === practiceProgress + 1) {
      const nextProgress = practiceProgress + 1;
      setPracticeProgress(nextProgress);
      haptics[nextProgress === 3 ? 'success' : 'selection']();
    } else {
      setPracticeProgress(0);
      haptics.warning();
    }
  };

  return (
    <div className={`interactive-onboarding onboarding-${step}`}>
      <header className="onboarding-header">
        <div><p className="eyebrow">SAFE // FIELD TRAINING</p><strong>60–90 SECOND TUTORIAL</strong></div>
        <button onClick={finish}>Skip tutorial</button>
      </header>
      <div className="onboarding-progress" aria-label={`Tutorial step ${stepIndex + 1} of ${STEPS.length}`}>
        {STEPS.map((item, index) => <span key={item} className={index < stepIndex ? 'complete' : index === stepIndex ? 'active' : ''}><b>{index + 1}</b><small>{item}</small></span>)}
      </div>

      <main>
        <AnimatePresence mode="wait">
          <motion.section key={step} className="tutorial-panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            {step === 'inspect' && (
              <>
                <div className="tutorial-vault-wrap"><SafeGraphic size={300} state="secure" balance={safeBalance} locks={securityLoadout.modules} onLockSelect={() => { setInspected(true); haptics.selection(); }} /></div>
                <StateBadge state="secure" label="Your vault" />
                <h1>Build the defense.</h1>
                <p>Your balance sits behind three playable locks. Attackers must crack every one.</p>
                <button className={`inspect-lock ${inspected ? 'inspected' : ''}`} onClick={() => { setInspected(true); haptics.selection(); }}>
                  <GameIcon type={securityLoadout.modules[0].type} size={24} /><span><small>LOCK 1 · PERIMETER</small><strong>{securityLoadout.modules[0].name}</strong></span>{inspected ? <Check /> : <ArrowRight />}
                </button>
                {inspected && <StateFrame state="secure" className="tutorial-note" label="Lock inspected"><Shield size={18} /><span>Difficulty changes how demanding this lock feels to an attacker.</span></StateFrame>}
                <button className="tutorial-primary btn-neon" onClick={next} disabled={!inspected}>Inspect a lock to continue <ArrowRight size={18} /></button>
              </>
            )}

            {step === 'practice' && (
              <>
                <div className="practice-lock-demo">
                  <div className={`practice-route practice-route--${practiceProgress}`} aria-hidden="true"><i /><i /></div>
                  {[1, 2, 3].map((node) => <button key={node} className={practiceProgress >= node ? 'hit' : ''} onClick={() => hitNode(node)} aria-label={`Pattern node ${node}${practiceProgress >= node ? ', connected' : ''}`}><span>{practiceProgress >= node ? <Check size={24} /> : node}</span></button>)}
                </div>
                <StateBadge state={practiceComplete ? 'cracked' : 'attacking'} label={practiceComplete ? 'Practice lock cracked' : 'Practice lock active'} />
                <h1>{practiceComplete ? 'Bolt retracted.' : 'Crack a short lock.'}</h1>
                <p>{practiceComplete ? 'That same result advances the breach rail during a real attack.' : 'Tap the three nodes in order: 1 → 2 → 3. A wrong node resets the route.'}</p>
                <div className="practice-mini-hud"><span>OBJECTIVE <b>Connect 3 nodes</b></span><span>PROGRESS <b>{practiceProgress} / 3</b></span></div>
                <button className="tutorial-primary btn-neon" onClick={next} disabled={!practiceComplete}>See the breach <ArrowRight size={18} /></button>
              </>
            )}

            {step === 'breach' && (
              <>
                <div className="tutorial-impact-flash" aria-hidden="true" />
                <div className="tutorial-vault-wrap"><SafeGraphic size={300} state="breached" balance={safeBalance} locks={securityLoadout.modules} /></div>
                <StateBadge state="breached" label="All locks cracked" />
                <h1>The vault opens.</h1>
                <p>One cracked lock advances the rail. Crack all three and the door opens through a verified mechanical sequence.</p>
                <div className="tutorial-rail">{securityLoadout.modules.map((module, index) => <span key={module.id}><GameIcon type={module.type} /><b>LOCK {index + 1}</b><small>Cracked</small></span>)}</div>
                <StateFrame state="cracked" className="tutorial-note" label="Successful breach effect"><Sparkles size={18} /><span>Success reveals a settlement—not an invented reward.</span></StateFrame>
                <button className="tutorial-primary btn-neon" onClick={next}>Learn the risk <ArrowRight size={18} /></button>
              </>
            )}

            {step === 'exposure' && (
              <>
                <div className="tutorial-vault-wrap tutorial-vault-wrap--small"><SafeGraphic size={240} state="exposed" balance={safeBalance} locks={securityLoadout.modules} /></div>
                <StateBadge state="exposed" label="Exposure explained" />
                <h1>Choose when to risk it.</h1>
                <p>Heist mode lasts {ECONOMY.heistDuration / 60} minutes. While you choose and attack a target, your own safe can also be attacked.</p>
                <div className="tutorial-settlement">
                  <StateFrame state="failed" label="Failed raid"><AlertTriangle /><small>FAIL ANY LOCK</small><strong>Lose the stake</strong></StateFrame>
                  <StateFrame state="cracked" label="Successful raid"><Crosshair /><small>CRACK EVERY LOCK</small><strong>Win {Math.round(examplePayout.netPayout).toLocaleString()} TK net</strong><span>{Math.round(examplePayout.grossLoot)} gross − {Math.round(examplePayout.platformCut)} platform cut</span></StateFrame>
                </div>
                <label className="tutorial-name"><span>Optional callsign</span><input value={username} onChange={(event) => setUsernameInput(event.target.value)} maxLength={20} placeholder="Enter a name" /></label>
                <button className="tutorial-primary btn-neon" onClick={finish}><LockKeyhole size={18} /> Enter SAFE</button>
                <p className="tutorial-auth-note">You can understand and practice the loop before sign-in. Authentication is required next for persistent multiplayer state.</p>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
};
