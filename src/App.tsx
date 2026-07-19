import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useHydrateFromServer } from './services/useHydrateFromServer';
import { useSession } from './services/useSession';
import { usePlayerStore } from './store/playerStore';
import { AuthScreen } from './screens/AuthScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';

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
          <Route path="/security/pick/:slotIndex" element={<GamePickerScreen />} />
          <Route path="/custom-games" element={<CustomGameScreen />} />
          <Route path="/marketplace" element={<MarketplaceScreen />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="*" element={<Layout><Routes><Route path="/" element={<HomeScreen />} /><Route path="/security" element={<SecurityScreen />} /><Route path="/insurance" element={<InsuranceScreen />} /><Route path="/heist" element={<HeistScreen />} /><Route path="/history" element={<HistoryScreen />} /></Routes></Layout>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
