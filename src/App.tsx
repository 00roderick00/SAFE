import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomeScreen } from './screens/HomeScreen';
import { SecurityScreen } from './screens/SecurityScreen';
import { InsuranceScreen } from './screens/InsuranceScreen';
import { HeistScreen } from './screens/HeistScreen';
import { AttackScreen } from './screens/AttackScreen';
import { HistoryScreen } from './screens/HistoryScreen';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Attack screen without layout (full screen) */}
        <Route path="/attack" element={<AttackScreen />} />

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
