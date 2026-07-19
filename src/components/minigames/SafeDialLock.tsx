import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';
import type { MiniGameProps } from '../../types';
import { gameAudio } from '../../utils/gameFeedback';
import { haptics } from '../../utils/haptics';
import { MiniGameChrome } from './MiniGameChrome';
import { createDialCode, type DialDirection } from './verticalSliceConfig';

export const SafeDialLock = ({ difficulty, seed, onComplete }: MiniGameProps) => {
  const dialNumbers = 40;
  const numberOfSteps = Math.floor(3 + difficulty);
  const code = useMemo(() => createDialCode(seed || 'dial-preview', numberOfSteps, dialNumbers), [seed, numberOfSteps]);
  const [currentStep, setCurrentStep] = useState(0);
  const currentStepRef = useRef(0);
  const [dialPosition, setDialPosition] = useState(0);
  const [timeLeft, setTimeLeft] = useState(40);
  const [status, setStatus] = useState('Turn in the shown direction and stop on the target number.');
  const [statusTone, setStatusTone] = useState<'neutral' | 'warning' | 'success' | 'failure'>('neutral');
  const startTimeRef = useRef(0);
  const completedRef = useRef(false);
  const currentTarget = code[currentStep];

  useEffect(() => { startTimeRef.current = Date.now(); }, []);

  const finish = useCallback((passed: boolean) => {
    if (completedRef.current) return;
    completedRef.current = true;
    const score = passed ? 1 : currentStepRef.current / numberOfSteps;
    setStatus(passed ? 'Combination accepted. Dial bolt released.' : currentStepRef.current === numberOfSteps - 1 ? 'Near miss. The final number held.' : 'Combination timed out. Dial bolt held.');
    setStatusTone(passed ? 'success' : currentStepRef.current === numberOfSteps - 1 ? 'warning' : 'failure');
    haptics[passed ? 'success' : 'error']();
    gameAudio.play(passed ? 'crack' : 'fail');
    window.setTimeout(() => onComplete({ moduleId: 'safedial', moduleType: 'safedial', score, passed, timeSpent: Date.now() - startTimeRef.current }), 260);
  }, [numberOfSteps, onComplete]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((time) => {
        if (time <= 1) {
          window.setTimeout(() => finish(false), 0);
          return 0;
        }
        return time - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [finish]);

  const rotate = useCallback((direction: DialDirection) => {
    if (completedRef.current || !code[currentStepRef.current]) return;
    const target = code[currentStepRef.current];
    setDialPosition((position) => {
      const next = direction === 'cw' ? (position + 1) % dialNumbers : (position - 1 + dialNumbers) % dialNumbers;
      haptics.selection();
      gameAudio.play('tick');
      if (direction !== target.direction) {
        setStatus(`Wrong direction. Turn ${target.direction === 'cw' ? 'clockwise' : 'counterclockwise'} toward ${target.num}.`);
        setStatusTone('warning');
      } else if (next === target.num) {
        const nextStep = currentStepRef.current + 1;
        currentStepRef.current = nextStep;
        setCurrentStep(nextStep);
        if (nextStep >= code.length) window.setTimeout(() => finish(true), 0);
        else {
          const following = code[nextStep];
          setStatus(`Number ${target.num} accepted. Reverse ${following.direction === 'cw' ? 'clockwise' : 'counterclockwise'} to ${following.num}.`);
          setStatusTone('success');
          haptics.medium();
          gameAudio.play('crack');
        }
      } else {
        setStatus(`Turning ${direction === 'cw' ? 'clockwise' : 'counterclockwise'} · target ${target.num}.`);
        setStatusTone('neutral');
      }
      return next;
    });
  }, [code, finish]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); rotate('ccw'); }
      if (event.key === 'ArrowRight') { event.preventDefault(); rotate('cw'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rotate]);

  return (
    <MiniGameChrome
      name="Safe Dial"
      objective={currentTarget ? `${currentTarget.direction === 'cw' ? 'Clockwise' : 'Counterclockwise'} to ${currentTarget.num}` : 'Combination complete'}
      timeLeft={timeLeft}
      progress={{ current: currentStep, total: code.length, label: 'Numbers' }}
      status={status}
      statusTone={statusTone}
      controls={<>
        <button className={`game-control dial-control ${currentTarget?.direction === 'ccw' ? 'recommended' : ''}`} onClick={() => rotate('ccw')} aria-label="Turn dial counterclockwise"><RotateCcw /><span>Counterclockwise</span><kbd>←</kbd></button>
        <button className={`game-control dial-control ${currentTarget?.direction === 'cw' ? 'recommended' : ''}`} onClick={() => rotate('cw')} aria-label="Turn dial clockwise"><RotateCw /><span>Clockwise</span><kbd>→</kbd></button>
      </>}
    >
      <div className="safe-dial-game">
        <div className="safe-dial-game__indicator" aria-hidden="true" />
        <div className="safe-dial-game__wheel" style={{ transform: `rotate(${-dialPosition / dialNumbers * 360}deg)` }} role="img" aria-label={`Safe dial at ${dialPosition}; target ${currentTarget?.num ?? 'complete'}`}>
          {Array.from({ length: dialNumbers }, (_, number) => {
            const angle = number / dialNumbers * 360;
            return <i key={number} className={number % 5 === 0 ? 'major' : ''} style={{ transform: `rotate(${angle}deg)` }}>{number % 5 === 0 && <b style={{ transform: `rotate(${-angle + dialPosition / dialNumbers * 360}deg)` }}>{number}</b>}</i>;
          })}
          <span><small>POSITION</small><strong>{dialPosition}</strong></span>
        </div>
      </div>
      <ol className="dial-code-rail" aria-label="Combination sequence">{code.map((step, index) => <li key={`${step.num}-${index}`} className={index < currentStep ? 'accepted' : index === currentStep ? 'active' : ''}><span>{index < currentStep ? 'ACCEPTED' : index === currentStep ? 'ACTIVE' : 'PENDING'}</span><b>{step.direction === 'cw' ? 'CW' : 'CCW'} {step.num}</b></li>)}</ol>
    </MiniGameChrome>
  );
};
