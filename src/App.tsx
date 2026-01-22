import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomeScreen } from './screens/HomeScreen';
import { SecurityScreen } from './screens/SecurityScreen';
import { GamePickerScreen } from './screens/GamePickerScreen';
import { InsuranceScreen } from './screens/InsuranceScreen';
import { HeistScreen } from './screens/HeistScreen';
import { AttackScreen } from './screens/AttackScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { CustomGameScreen } from './screens/CustomGameScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { usePlayerStore } from './store/playerStore';

function App() {
  const { onboardingCompleted } = usePlayerStore();
  const [showOnboarding, setShowOnboarding] = useState(!onboardingCompleted);

  // Sync with store changes
  useEffect(() => {
    if (onboardingCompleted) {
      setShowOnboarding(false);
    }
  }, [onboardingCompleted]);

  if (showOnboarding) {
    return <OnboardingScreen onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        {/* Full screen routes without bottom navigation */}
        <Route path="/attack" element={<AttackScreen />} />
        <Route path="/security/pick/:slotIndex" element={<GamePickerScreen />} />
        <Route path="/custom-games" element={<CustomGameScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />

        {/* Main app with bottom navigation */}
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<HomeScreen />} />
                <Route path="/security" element={<SecurityScreen />} />
                <Route path="/insurance" element={<InsuranceScreen />} />
                <Route path="/heist" element={<HeistScreen />} />
                <Route path="/history" element={<HistoryScreen />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
