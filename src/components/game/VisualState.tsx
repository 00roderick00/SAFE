import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  Crosshair,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

export type VisualState =
  | 'secure'
  | 'warning'
  | 'exposed'
  | 'attacking'
  | 'cracked'
  | 'failed'
  | 'breached'
  | 'recovering';

const STATE_META = {
  secure: { label: 'Secure', Icon: ShieldCheck },
  warning: { label: 'Warning', Icon: AlertTriangle },
  exposed: { label: 'Exposed', Icon: ShieldAlert },
  attacking: { label: 'Under attack', Icon: Crosshair },
  cracked: { label: 'Cracked', Icon: CircleCheck },
  failed: { label: 'Failed', Icon: LockKeyhole },
  breached: { label: 'Breached', Icon: CircleDashed },
  recovering: { label: 'Recovering', Icon: Wrench },
} satisfies Record<VisualState, { label: string; Icon: typeof ShieldCheck }>;

export const StateBadge = ({
  state,
  label,
  compact = false,
}: {
  state: VisualState;
  label?: string;
  compact?: boolean;
}) => {
  const { Icon, label: defaultLabel } = STATE_META[state];
  return (
    <span className={`state-badge state-${state}${compact ? ' state-badge--compact' : ''}`} data-state={state}>
      <Icon size={compact ? 13 : 15} aria-hidden="true" />
      <span>{label ?? defaultLabel}</span>
    </span>
  );
};

export const StateFrame = ({
  state,
  children,
  className = '',
  label,
}: {
  state: VisualState;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) => (
  <section className={`state-frame state-${state} ${className}`} data-state={state} aria-label={label}>
    {children}
  </section>
);

