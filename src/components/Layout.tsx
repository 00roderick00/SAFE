import { ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Vault,
  Crosshair,
  Shield,
  Gamepad2,
  History,
  Lock,
} from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useSession } from '../services/useSession';
import { useDefenseWatch } from '../services/useDefenseWatch';
import { UnderAttackAlert } from './UnderAttackAlert';
import { LockedSurfaceSheet } from './LockedSurface';
import {
  getUnlockTier,
  isSurfaceUnlocked,
  requirementFor,
  TIER_UNLOCKS,
  type GatedSurface,
  type UnlockTier,
} from '../game/progression';
interface LayoutProps {
  children: ReactNode;
}

// Progressive disclosure (§3): Safe + Heist are always visible; the
// rest unlock by tier. Locked items stay VISIBLE with their unlock
// condition — the depth is staged, not hidden.
const navItems: { path: string; icon: typeof Vault; label: string; surface?: GatedSurface }[] = [
  { path: '/', icon: Vault, label: 'Safe' },
  { path: '/security', icon: Shield, label: 'Security', surface: 'security' },
  { path: '/heist', icon: Crosshair, label: 'Heist' },
  // Entry point to the AI game builder + community marketplace, which
  // were previously unreachable from the main app navigation.
  { path: '/custom-games', icon: Gamepad2, label: 'Create', surface: 'create' },
  { path: '/history', icon: History, label: 'History', surface: 'history' },
];

/** Brief, skippable unlock moment. Renders when the live tier is ahead
 *  of the last announced one (never on hydration catch-up — that path
 *  pre-marks its tier as announced). */
const UnlockAnnouncement = ({ fromTier, toTier, onDismiss }: { fromTier: number; toTier: UnlockTier; onDismiss: () => void }) => {
  const crossed = ([1, 2, 3] as const).filter((t) => t > fromTier && t <= toTier);
  if (crossed.length === 0) return null;
  return (
    // Plain CSS animation, not framer-motion: a stuck animation frame
    // leaves this modal half-transparent over the whole app while still
    // swallowing taps. Same reasoning as LockedSurfaceSheet.
    <div
      className="unlock-announce-backdrop"
      role="dialog"
      aria-label="New features unlocked"
      onClick={onDismiss}
    >
      <div className="unlock-announce max-w-sm w-full p-6 text-center rounded-xl border border-primary/40 bg-background shadow-2xl">
        {crossed.map((t) => (
          <div key={t} className="mb-4 last:mb-0">
            <p className="font-display text-lg font-bold text-primary neon-text-primary">{TIER_UNLOCKS[t].title}</p>
            <p className="text-text-dim text-sm mt-1">{TIER_UNLOCKS[t].details}</p>
          </div>
        ))}
        <button className="btn-neon mt-4 w-full" onClick={onDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const completedHeists = usePlayerStore((s) => s.completedHeists);
  const successfulHeists = usePlayerStore((s) => s.successfulHeists);
  const lastAnnouncedTier = usePlayerStore((s) => s.lastAnnouncedTier);
  const markTierAnnounced = usePlayerStore((s) => s.markTierAnnounced);
  const tier = getUnlockTier({ completedHeists, successfulHeists });
  const [lockedSheet, setLockedSheet] = useState<GatedSurface | null>(null);

  // Watches for REAL raids against this safe. Polls only while exposed
  // and stops the instant the window closes.
  const session = useSession();
  const { inFlight } = useDefenseWatch(session ?? null);

  // Hide nav on attack screen
  const hideNav = location.pathname.startsWith('/attack');

  return (
    <div className="app-shell bg-background grid-bg">
      {/* Main content */}
      <main className="app-main" id="main-content">
        <div className="app-canvas">{children}</div>
      </main>

      {/* Bottom Navigation */}
      <AnimatePresence>
        {lockedSheet && (
          <LockedSurfaceSheet surface={lockedSheet} onClose={() => setLockedSheet(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tier > lastAnnouncedTier && (
          <UnlockAnnouncement
            fromTier={lastAnnouncedTier}
            toTier={tier}
            onDismiss={() => markTierAnnounced(tier)}
          />
        )}
      </AnimatePresence>

      {!hideNav && <UnderAttackAlert attacks={inFlight} />}

      {!hideNav && (
        <nav className="app-nav" aria-label="Primary navigation">
          <div className="app-nav__inner">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

              if (item.surface && !isSurfaceUnlocked(item.surface, tier)) {
                const surface = item.surface;
                // A locked item must be TAPPABLE, not just dimmed: on a
                // touch device there is no hover, so a `title` tooltip is
                // invisible and the player has no way to discover why the
                // item is dark or how to open it. Tapping reveals a small
                // sheet with the unlock condition and their progress.
                return (
                  <button
                    key={item.path}
                    type="button"
                    className="app-nav__item app-nav__item--locked"
                    aria-haspopup="dialog"
                    aria-label={`${item.label} — locked. ${requirementFor(surface)}. Tap to see how to unlock.`}
                    onClick={() => setLockedSheet(surface)}
                  >
                    <div className="flex flex-col items-center justify-center text-text-dim">
                      <span className="relative">
                        <Icon size={24} aria-hidden="true" />
                        <Lock size={11} aria-hidden="true" className="absolute -right-1.5 -bottom-0.5" />
                      </span>
                      <span className="text-xs mt-1 font-medium">{item.label}</span>
                    </div>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  aria-label={item.label}
                  className="app-nav__item"
                >
                  <motion.div
                    className={`
                      flex flex-col items-center justify-center
                      ${isActive ? 'text-primary' : 'text-text-dim'}
                    `}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Icon
                      size={24}
                      aria-hidden="true"
                      className={isActive ? 'neon-text-primary' : ''}
                    />
                    <span className="text-xs mt-1 font-medium">
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        className="app-nav__indicator"
                        layoutId="nav-indicator"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                  </motion.div>
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};

// Page header component
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export const PageHeader = ({ title, subtitle, action }: PageHeaderProps) => {
  return (
    <header className="px-4 pt-6 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text neon-text-primary">
            {title}
          </h1>
          {subtitle && (
            <p className="text-text-dim text-sm mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </header>
  );
};
