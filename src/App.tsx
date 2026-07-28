import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useHydrateFromServer } from './services/useHydrateFromServer';
import { useSession } from './services/useSession';
import { usePlayerStore } from './store/playerStore';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { LockedSurfaceScreen } from './components/LockedSurface';
import { useSurfaceUnlocked } from './store/useUnlockTier';
import type { GatedSurface } from './game/progression';

const HomeScreen = lazy(() => import('./screens/HomeScreen').then((module) => ({ default: module.HomeScreen })));
const SecurityScreen = lazy(() => import('./screens/SecurityScreen').then((module) => ({ default: module.SecurityScreen })));
const GamePickerScreen = lazy(() => import('./screens/GamePickerScreen').then((module) => ({ default: module.GamePickerScreen })));
const InsuranceScreen = lazy(() => import('./screens/InsuranceScreen').then((module) => ({ default: module.InsuranceScreen })));
const HeistScreen = lazy(() => import('./screens/HeistScreen').then((module) => ({ default: module.HeistScreen })));
const AttackScreen = lazy(() => import('./screens/AttackScreen').then((module) => ({ default: module.AttackScreen })));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen').then((module) => ({ default: module.HistoryScreen })));
const CustomGameScreen = lazy(() => import('./screens/CustomGameScreen').then((module) => ({ default: module.CustomGameScreen })));
const MarketplaceScreen = lazy(() => import('./screens/MarketplaceScreen').then((module) => ({ default: module.MarketplaceScreen })));
const LeaderboardScreen = lazy(() => import('./screens/LeaderboardScreen').then((module) => ({ default: module.LeaderboardScreen })));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen').then((module) => ({ default: module.ProfileScreen })));

const RouteFallback = () => <div className="route-loading" role="status"><span />Initializing secure channel…</div>;

/**
 * Route-level progressive disclosure (§3). Hiding a nav item is not
 * gating: a tier-0 player who deep-links /security (bookmark, shared
 * link, back button) would otherwise land on the full screen. Renders
 * the locked explainer instead, so the route stays reachable and
 * self-explanatory rather than 404-ing or silently bouncing.
 *
 * PRESENTATION ONLY — no server capability consults the tier, and a
 * determined API caller can still hit every endpoint. The security
 * model never depends on the UI hiding things.
 */
const RequireTier = ({ surface, children }: { surface: GatedSurface; children: React.ReactNode }) => {
  const unlocked = useSurfaceUnlocked(surface);
  if (!unlocked) return <LockedSurfaceScreen surface={surface} />;
  return <>{children}</>;
};

function App() {
  const { onboardingCompleted, completeOnboarding } = usePlayerStore();
  const session = useSession();
  useHydrateFromServer(session ?? null);
  // Development-only route access supports responsive visual QA without weakening
  // the production authentication boundary or requiring test credentials.
  const visualQa = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('visualQa') === '1';
  if (!visualQa && !onboardingCompleted) return <OnboardingScreen onComplete={completeOnboarding} />;
  if (!visualQa && session === undefined) return <RouteFallback />;
  if (!visualQa && session === null) return <AuthScreen />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/attack" element={<AttackScreen />} />
          <Route path="/security/pick/:slotIndex" element={<RequireTier surface="security"><GamePickerScreen /></RequireTier>} />
          <Route path="/custom-games" element={<RequireTier surface="create"><CustomGameScreen /></RequireTier>} />
          <Route path="/marketplace" element={<RequireTier surface="marketplace"><MarketplaceScreen /></RequireTier>} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="*" element={<Layout><Routes><Route path="/" element={<HomeScreen />} /><Route path="/security" element={<RequireTier surface="security"><SecurityScreen /></RequireTier>} /><Route path="/insurance" element={<RequireTier surface="insurance"><InsuranceScreen /></RequireTier>} /><Route path="/heist" element={<HeistScreen />} /><Route path="/history" element={<RequireTier surface="history"><HistoryScreen /></RequireTier>} /></Routes></Layout>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
