import { Clock3, Crosshair, Gauge } from 'lucide-react';

export const MiniGameChrome = ({
  name,
  objective,
  timeLeft,
  progress,
  status,
  statusTone = 'neutral',
  children,
  controls,
}: {
  name: string;
  objective: string;
  timeLeft: number;
  progress: { current: number; total: number; label: string };
  status: string;
  statusTone?: 'neutral' | 'warning' | 'success' | 'failure';
  children: React.ReactNode;
  controls: React.ReactNode;
}) => {
  const percent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  return (
    <section className={`minigame-chrome minigame-chrome--${statusTone}`} aria-label={`${name} minigame`}>
      <header className="minigame-chrome__hud">
        <div><span className="eyebrow">{name}</span><strong><Crosshair size={13} />{objective}</strong></div>
        <span className={timeLeft <= 10 ? 'urgent' : ''}><Clock3 size={14} /><b>{Math.max(0, Math.ceil(timeLeft))}s</b></span>
      </header>
      <div className="minigame-chrome__progress">
        <span><Gauge size={13} /> {progress.label}<b>{progress.current} / {progress.total}</b></span>
        <i
          role="progressbar"
          aria-label={`${progress.label} progress`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={Math.min(progress.current, progress.total)}
        ><b style={{ width: `${Math.min(100, percent)}%` }} /></i>
      </div>
      <div className="minigame-chrome__stage">{children}</div>
      <div className="minigame-chrome__status" role="status" aria-live="polite">{status}</div>
      <div className="minigame-chrome__controls" aria-label={`${name} controls`}>{controls}</div>
    </section>
  );
};
