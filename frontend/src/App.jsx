import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import DiseasePage from './pages/DiseasePage'
import DiseaseResultPage from './pages/DiseaseResultPage'
import YieldPage from './pages/YieldPage'
import YieldResultPage from './pages/YieldResultPage'
import WeatherPage from './pages/WeatherPage'
import MarketPage from './pages/MarketPage'
import SchemePage from './pages/SchemePage'
import TreatmentPage from './pages/TreatmentPage'
import ProfilePage from './pages/ProfilePage'
import LocationBanner from './components/LocationBanner'

import './App.css'

import { useEffect } from 'react'

function App() {
  useEffect(() => {
    const BACKEND = import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000';
    const COOLDOWN_MS = 1800000; // 30 minutes

    // --- SYNC PATH A: Profile-City Sync (login / profile save) ---
    // One API call using the saved city. No GPS needed.
    const syncWithProfileCity = async (city) => {
      if (!city) return;
      const now = new Date().getTime();
      try {
        console.log(`[Sync] Profile city → ${city}`);
        const res = await fetch(`${BACKEND}/api/v1/weather-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ city })
        });
        const data = await res.json();
        if (data.status === 'success') {
          // Format it to only display the City part by stripping off State if present
          if (data.region_info.includes(',')) {
            data.region_info = data.region_info.split(',')[0].trim();
          }

          localStorage.setItem('agrisense_location_data_v2', JSON.stringify(data));
          localStorage.setItem('agrisense_last_sync_v2', now.toString());
          localStorage.setItem('agrisense_weather_city', data.region_info);
          window.dispatchEvent(new CustomEvent('agrisense_location_synced', { detail: data }));
        }
      } catch (e) { console.error('[Sync] Profile city error', e); }
    };

    // --- SYNC PATH B: GPS Sync (sign-out / first-ever guest load) ---
    // One API call using current GPS coords. No profile needed.
    const syncWithGPS = () => {
      if (!navigator.geolocation) return;
      const now = new Date().getTime();
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          console.log(`[Sync] GPS → ${latitude}, ${longitude}`);
          const res = await fetch(`${BACKEND}/api/v1/weather-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lon: longitude })
          });
          const data = await res.json();
          if (data.status === 'success') {
            // Format it to only display the City part by stripping off State if present
            if (data.region_info.includes(',')) {
              data.region_info = data.region_info.split(',')[0].trim();
            }

            localStorage.setItem('agrisense_location_data_v2', JSON.stringify(data));
            localStorage.setItem('agrisense_last_sync_v2', now.toString());
            localStorage.setItem('agrisense_last_coords', JSON.stringify({ lat: latitude, lon: longitude }));
            localStorage.setItem('agrisense_weather_city', data.region_info);
            window.dispatchEvent(new CustomEvent('agrisense_location_synced', { detail: data }));
          }
        } catch (e) { console.error('[Sync] GPS error', e); }
      }, null, { timeout: 6000 });
    };

    // --- INITIAL MOUNT: decide which path to take ---
    const initialSync = () => {
      const profile = JSON.parse(localStorage.getItem('agrisense_user_profile') || 'null');
      const lastSync = localStorage.getItem('agrisense_last_sync_v2');
      const now = new Date().getTime();
      const isCooldownActive = lastSync && (now - parseInt(lastSync)) < COOLDOWN_MS;

      if (profile && profile.location) {
        // Logged-in user: use profile city, respect cooldown
        if (isCooldownActive) {
          console.log('[Sync] On cooldown, skipping.');
          return;
        }
        syncWithProfileCity(profile.location);
      } else {
        // Guest user: use GPS, respect cooldown
        if (isCooldownActive) {
          console.log('[Sync] Guest cooldown active, skipping.');
          return;
        }
        syncWithGPS();
      }
    };

    initialSync();

    // LOGIN / PROFILE SAVE → show profile-city data (clears old GPS data first)
    const handleProfileSync = () => {
      const profile = JSON.parse(localStorage.getItem('agrisense_user_profile') || 'null');
      if (profile && profile.location) {
        console.log('[Sync] Force profile sync event received');
        syncWithProfileCity(profile.location);
      }
    };

    // SIGN-OUT → show current GPS data immediately
    const handleForceGPS = () => {
      console.log('[Sync] Force GPS sync event received (sign-out)');
      syncWithGPS();
    };

    window.addEventListener('agrisense_force_profile_sync', handleProfileSync);
    window.addEventListener('agrisense_force_sync', handleForceGPS);
    return () => {
      window.removeEventListener('agrisense_force_profile_sync', handleProfileSync);
      window.removeEventListener('agrisense_force_sync', handleForceGPS);
    };
  }, [])

  return (
    <Router>
      <div className="app-wrapper">
        <Navbar />
        <LocationBanner />

        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/detect" element={<DiseasePage />} />
            <Route path="/disease-result" element={<DiseaseResultPage />} />
            <Route path="/predict" element={<YieldPage />} />
            <Route path="/yield-result" element={<YieldResultPage />} />
            <Route path="/weather" element={<WeatherPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/schemes" element={<SchemePage />} />
            <Route path="/treatment" element={<TreatmentPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  )
}

export default App
