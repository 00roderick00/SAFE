import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Vault,
  Crosshair,
  Shield,
  ShieldCheck,
  History,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { path: '/', icon: Vault, label: 'Safe' },
  { path: '/security', icon: Shield, label: 'Security' },
  { path: '/insurance', icon: ShieldCheck, label: 'Insure' },
  { path: '/heist', icon: Crosshair, label: 'Heist' },
  { path: '/history', icon: History, label: 'History' },
];

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const unreadCount = useGameStore((state) => state.getUnreadCount());

  // Hide nav on attack screen
  const hideNav = location.pathname.startsWith('/attack');

  return (
    <div className="min-h-screen bg-background grid-bg flex flex-col">
      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom Navigation */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-lg border-t border-primary/20 safe-area-pb">
          <div className="max-w-lg mx-auto flex justify-around items-center h-16">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="relative flex flex-col items-center justify-center w-16 h-full"
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
                      className={isActive ? 'neon-text-primary' : ''}
                    />
                    <span className="text-xs mt-1 font-medium">
                      {item.label}
                    </span>
                    {isActive && (
                      <motion.div
                        className="absolute -bottom-0 w-8 h-0.5 bg-primary rounded-full"
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
