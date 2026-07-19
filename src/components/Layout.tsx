import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Vault,
  Crosshair,
  Shield,
  Gamepad2,
  History,
} from 'lucide-react';
interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', icon: Vault, label: 'Safe' },
  { path: '/security', icon: Shield, label: 'Security' },
  { path: '/heist', icon: Crosshair, label: 'Heist' },
  // Entry point to the AI game builder + community marketplace, which
  // were previously unreachable from the main app navigation.
  { path: '/custom-games', icon: Gamepad2, label: 'Create' },
  { path: '/history', icon: History, label: 'History' },
];

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  // Hide nav on attack screen
  const hideNav = location.pathname.startsWith('/attack');

  return (
    <div className="app-shell bg-background grid-bg">
      {/* Main content */}
      <main className="app-main" id="main-content">
        <div className="app-canvas">{children}</div>
      </main>

      {/* Bottom Navigation */}
      {!hideNav && (
        <nav className="app-nav" aria-label="Primary navigation">
          <div className="app-nav__inner">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

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
