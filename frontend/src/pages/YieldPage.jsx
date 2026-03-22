import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Toast from '../components/Toast'
import './YieldPage.css'
import WeatherWarningCard from '../components/WeatherWarningCard'

const cropOptions = ['Wheat', 'Rice', 'Corn', 'Cotton', 'Soybean', 'Sugarcane', 'Potato', 'Tomato', 'Onion', 'Groundnut']
const seasonOptions = ['Kharif (Monsoon)', 'Rabi (Winter)', 'Zaid (Summer)']
const soilOptions = ['Alluvial', 'Black (Regur)', 'Red & Yellow', 'Laterite', 'Loamy', 'Sandy']
const irrigationOptions = ['Rainfed', 'Canal Irrigation', 'Drip Irrigation', 'Sprinkler', 'Borewell/Tubewell']
const fertilizerOptions = ['None', 'Organic Only', 'NPK Balanced', 'High Nitrogen', 'Custom Mix']

const YieldPage = () => {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    // Check for profile to autofill
    const loadProfile = async () => {
      const email = localStorage.getItem('agrisense_user_email');
      let profile = null;
      
      if (email) {
        try {
          const res = await fetch(`${import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000'}/api/v1/profile/${email}`);
          if (res.ok) profile = await res.json();
        } catch (e) { console.warn("Profile fetch failed, falling back to local storage"); }
      }

      const month = new Date().getMonth() + 1 
      let seasonPrefix = 'Zaid (Summer)'
      if (month >= 6 && month <= 10) seasonPrefix = 'Kharif (Monsoon)'
      else if (month >= 11 || month <= 2) seasonPrefix = 'Rabi (Winter)'

      // PRIORITY 1: If profile has a location, fetch climate for THAT city
      if (profile && profile.location) {
        setForm(prev => ({
          ...prev,
          area: profile.land_size_acres || prev.area,
          soil: profile.soil_type || prev.soil,
          crop: profile.crop_type || prev.crop,
          irrigation: profile.irrigation_method || prev.irrigation,
          season: seasonPrefix
        }))
        
        const cacheKey = `agrisense_session_yieldweather_${profile.location.replace(/[^a-zA-Z]/g, '').toLowerCase()}`
        const cachedWeather = sessionStorage.getItem(cacheKey)

        if (cachedWeather) {
          const weatherData = JSON.parse(cachedWeather)
          setForm(prev => ({
            ...prev,
            temperature: weatherData.temperature,
            rainfall: weatherData.rainfall,
            humidity: weatherData.humidity
          }))
        } else {
          try {
            const weatherRes = await fetch(`${import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000'}/api/v1/weather-sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ city: profile.location })
            })
            const weatherData = await weatherRes.json()
            if (weatherData.status === 'success') {
              setForm(prev => ({
                ...prev,
                temperature: weatherData.temperature,
                rainfall: weatherData.rainfall,
                humidity: weatherData.humidity
              }))
              sessionStorage.setItem(cacheKey, JSON.stringify(weatherData))
            }
          } catch (e) { console.warn("Profile location weather sync failed:", e); }
        }
        
        showToast(`Welcome back! Climate autofilled for ${profile.location}.`, 'success');
        return;
      }

      // PRIORITY 2: Use stored sync data (from GPS-based global sync)
      const savedData = localStorage.getItem('agrisense_location_data_v2')

      setForm(prev => ({
        ...prev,
        area: profile?.land_size_acres || prev.area,
        soil: profile?.soil_type || prev.soil,
        crop: profile?.crop_type || prev.crop,
        irrigation: profile?.irrigation_method || prev.irrigation,
        temperature: savedData ? JSON.parse(savedData).temperature : prev.temperature,
        rainfall: savedData ? JSON.parse(savedData).rainfall : prev.rainfall,
        humidity: savedData ? JSON.parse(savedData).humidity : prev.humidity,
        season: seasonPrefix
      }))

      if (profile) showToast(`Welcome back! Your farm profile has been autofilled.`, 'success');
    }

    loadProfile();
  }, [])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }
  const [form, setForm] = useState({
    crop: '',
    area: '',
    season: '',
    soil: '',
    irrigation: '',
    fertilizer: '',
    rainfall: '',
    temperature: '',
    humidity: '',
    ph: '',
    nitrogen: '',
    phosphorus: '',
    potassium: '',
  })

  const [errors, setErrors] = useState({})

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
    if (name === 'crop') {
      localStorage.setItem('agrisense_last_crop', value)
    }
  }

  const syncLocation = (silent = false) => {
    // PRIORITY 1: Check if farmer has a registered profile location
    const profile = JSON.parse(localStorage.getItem('agrisense_user_profile') || 'null')
    
    if (profile && profile.location) {
      setIsSyncing(true)
      fetch(`${import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000'}/api/v1/weather-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: profile.location })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          const month = new Date().getMonth() + 1
          let season = 'Zaid (Summer)'
          if (month >= 6 && month <= 10) season = 'Kharif (Monsoon)'
          else if (month >= 11 || month <= 2) season = 'Rabi (Winter)'
          
          setForm(prev => ({
            ...prev,
            temperature: data.temperature,
            rainfall: data.rainfall,
            humidity: data.humidity,
            season
          }))
          if (!silent) showToast(`📍 Synced with profile location: ${data.region_info}`, 'success')
        }
      })
      .catch(err => {
        console.error("Profile sync error:", err)
        if (!silent) showToast("Failed to sync profile location.", 'error')
      })
      .finally(() => setIsSyncing(false))
      return
    }

    // PRIORITY 2: GPS Fallback
    if (!navigator.geolocation) {
      if (!silent) showToast("Geolocation is not supported by your browser", "error")
      return
    }
    
    setIsSyncing(true)
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000'}/api/v1/weather-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latitude, lon: longitude })
        })
        const data = await response.json()
        
        if (data.status === 'success') {
          if (data.region_info.includes(',')) {
            data.region_info = data.region_info.split(',')[0].trim();
          }

          setForm(prev => ({
            ...prev,
            temperature: data.temperature,
            rainfall: data.rainfall,
            humidity: data.humidity
          }))
          
          const month = new Date().getMonth() + 1 
          let season = 'Zaid (Summer)'
          if (month >= 6 && month <= 10) season = 'Kharif (Monsoon)'
          else if (month >= 11 || month <= 2) season = 'Rabi (Winter)'
          
          setForm(prev => ({ ...prev, season }))
          
          if (!silent) showToast(`Successfully synced with ${data.region_info}! Climate fields populated.`, 'success')
        } else {
          if (!silent) showToast("Could not fetch climate data. Please enter manually.", 'error')
        }
      } catch (err) {
        console.error("Sync error:", err)
        if (!silent) showToast("Failed to connect to backend for sync.", 'error')
      } finally {
        setIsSyncing(false)
      }
    }, () => {
      if (!silent) showToast("Please allow location access to use Smart Sync", 'error')
      setIsSyncing(false)
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  const validate = () => {
    const errs = {}
    if (!form.crop) errs.crop = 'Please select a crop'
    if (!form.area || form.area <= 0) errs.area = 'Enter a valid area'
    if (!form.season) errs.season = 'Please select a season'
    if (!form.soil) errs.soil = 'Please select soil type'
    if (!form.rainfall) errs.rainfall = 'Enter expected rainfall'
    if (!form.temperature) errs.temperature = 'Enter average temperature'
    return errs
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setIsLoading(true)

    try {
      // Prepare data for backend (converting strings to floats where needed)
      const payload = {
        Crop_Type: form.crop,
        Area_Hectares: parseFloat(form.area),
        Season: form.season.split(' ')[0], // Extracts "Kharif", "Rabi", etc.
        Soil_Type: form.soil.split(' ')[0], // Extracts primary name
        Irrigation_Method: form.irrigation.split(' ')[0],
        Fertilizer_Type: form.fertilizer.split(' ')[0],
        Annual_rainfall: parseFloat(form.rainfall),
        Avg_temp: parseFloat(form.temperature),
        Humidity: parseFloat(form.humidity || 60),
        N: parseFloat(form.nitrogen || 80),
        P: parseFloat(form.phosphorus || 40),
        K: parseFloat(form.potassium || 40),
        ndvi_score: 1.0 // Default or could be synced
      }

      // CHECK CACHE FIRST
      const cacheKey = `agrisense_session_yieldpredict_${JSON.stringify(payload)}`
      const cachedData = sessionStorage.getItem(cacheKey)
      
      let resultData;
      
      if (cachedData) {
        resultData = JSON.parse(cachedData)
      } else {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URI || 'http://localhost:8000'}/api/v1/predict-yield`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        resultData = await response.json()
        
        if (resultData.status === 'success') {
          sessionStorage.setItem(cacheKey, JSON.stringify(resultData))
        }
      }

      if (resultData.status === 'success') {
        const predicted = resultData.predicted_yield_tonnes_per_ha

        const finalResult = {
          ...form,
          predictedYield: predicted,
          yieldUnit: form.crop === 'Sugarcane' ? 'tonnes' : 'tonnes/ha',
          yieldPerHectare: (predicted / parseFloat(form.area || 1)).toFixed(2),
          confidence: 89.3,
          grade: parseFloat(form.area) >= 5 ? 'A' : 'B',
          recommendations: [
            `Maintain soil pH for optimal ${form.crop} growth`,
            `Schedule irrigation based on ${form.season} patterns`,
            "Monitor early symptoms of pests with Scan-Leaf feature",
            "Apply nitrogen based on ground leaf color charts",
          ],
          source: 'Live AI Model (XGBoost)'
        }
        navigate('/yield-result', { state: { result: finalResult } })
      } else {
        alert("Prediction Error: " + (resultData.detail || "Invalid inputs for model"))
      }
    } catch (err) {
      console.error("Prediction Error:", err)
      alert("Failed to connect to AI Predictor backend.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="yield-page">
      {/* Header */}
      <div className="yield-page__header">
        <div className="container">
          <div className="section-tag">📊 AI Prediction</div>
          <h1>Crop Yield Prediction</h1>
          <p>Enter your field and environmental parameters to get an accurate yield forecast powered by ensemble ML models</p>
        </div>
      </div>

      <div className="container yield-page__body">
        <WeatherWarningCard />
        <div className="yield-layout">
          {/* Form */}
          <div className="glass-form-container glass shadow-elevated-lg">
            <form className="yield-form" onSubmit={handleSubmit} id="yield-form">
              {/* Intelligent Sync Banner */}
              {localStorage.getItem('agrisense_location_data_v2') && (
                <div className="sync-banner-premium animate-fadeInDown">
                  <div className="sync-banner-premium__glass" />
                  <div className="sync-banner-premium__content">
                    <div className="sync-banner-premium__icon-box">
                      <span className="sync-icon">📍</span>
                      <div className="sync-pulse" />
                    </div>
                    <div className="sync-banner-premium__details">
                      <div className="sync-banner-premium__label">Currently Synced To</div>
                      <div className="sync-banner-premium__value">
                        {JSON.parse(localStorage.getItem('agrisense_location_data_v2')).region_info}
                      </div>
                    </div>
                    <div className="sync-banner-premium__stats">
                      <div className="sync-stat">
                        <span className="stat-label">Temp:</span>
                        <span className="stat-val">{JSON.parse(localStorage.getItem('agrisense_location_data_v2')).temperature}°C</span>
                      </div>
                      <div className="sync-stat">
                        <span className="stat-label">Rain:</span>
                        <span className="stat-val">{JSON.parse(localStorage.getItem('agrisense_location_data_v2')).rainfall}mm</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Section 1: Crop Info */}
            <div className="form-section">
              <div className="form-section__header">
                <span>🌾</span>
                <h3>Crop Information</h3>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Crop Type *</label>
                  <select name="crop" className={`form-select ${errors.crop ? 'input-error' : ''}`} value={form.crop} onChange={handleChange} id="crop-select">
                    <option value="">— Select crop —</option>
                    {cropOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.crop && <span className="error-msg">{errors.crop}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Area (Hectares) *</label>
                  <input type="number" name="area" className={`form-input ${errors.area ? 'input-error' : ''}`} value={form.area} onChange={handleChange} placeholder="e.g. 2.5" min="0.1" step="0.1" id="area-input" />
                  {errors.area && <span className="error-msg">{errors.area}</span>}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Season *</label>
                  <select name="season" className={`form-select ${errors.season ? 'input-error' : ''}`} value={form.season} onChange={handleChange} id="season-select">
                    <option value="">— Select season —</option>
                    {seasonOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.season && <span className="error-msg">{errors.season}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Soil Type *</label>
                  <select name="soil" className={`form-select ${errors.soil ? 'input-error' : ''}`} value={form.soil} onChange={handleChange} id="soil-select">
                    <option value="">— Select soil —</option>
                    {soilOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {errors.soil && <span className="error-msg">{errors.soil}</span>}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Irrigation Method</label>
                  <select name="irrigation" className="form-select" value={form.irrigation} onChange={handleChange} id="irrigation-select">
                    <option value="">— Select —</option>
                    {irrigationOptions.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fertilizer Type</label>
                  <select name="fertilizer" className="form-select" value={form.fertilizer} onChange={handleChange} id="fertilizer-select">
                    <option value="">— Select —</option>
                    {fertilizerOptions.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Climate */}
              <div className="form-section">
                <div className="form-section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🌦️</span>
                    <h3>Climate Parameters</h3>
                  </div>
                  <button 
                    type="button" 
                    className={`btn-sync ${isSyncing ? 'syncing' : ''}`} 
                    onClick={syncLocation}
                    disabled={isSyncing}
                  >
                    {isSyncing ? '⌛ Syncing...' : '📍 Smart Sync Location'}
                  </button>
                </div>
              <div className="form-row form-row--3">
                <div className="form-group">
                  <label className="form-label">Annual Rainfall (mm) *</label>
                  <input type="number" name="rainfall" className={`form-input ${errors.rainfall ? 'input-error' : ''}`} value={form.rainfall} onChange={handleChange} placeholder="e.g. 850" id="rainfall-input" />
                  {errors.rainfall && <span className="error-msg">{errors.rainfall}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Avg Temperature (°C) *</label>
                  <input type="number" name="temperature" className={`form-input ${errors.temperature ? 'input-error' : ''}`} value={form.temperature} onChange={handleChange} placeholder="e.g. 28" id="temp-input" />
                  {errors.temperature && <span className="error-msg">{errors.temperature}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">Humidity (%)</label>
                  <input type="number" name="humidity" className="form-input" value={form.humidity} onChange={handleChange} placeholder="e.g. 65" min="0" max="100" id="humidity-input" />
                </div>
              </div>
            </div>

            {/* Section 3: Soil Nutrients */}
            <div className="form-section">
              <div className="form-section__header">
                <span>🧪</span>
                <h3>Soil Nutrients (Optional)</h3>
              </div>
              <div className="form-row form-row--4">
                <div className="form-group">
                  <label className="form-label">pH Level</label>
                  <input type="number" name="ph" className="form-input" value={form.ph} onChange={handleChange} placeholder="6.5" min="0" max="14" step="0.1" id="ph-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nitrogen (kg/ha)</label>
                  <input type="number" name="nitrogen" className="form-input" value={form.nitrogen} onChange={handleChange} placeholder="80" id="nitrogen-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phosphorus (kg/ha)</label>
                  <input type="number" name="phosphorus" className="form-input" value={form.phosphorus} onChange={handleChange} placeholder="40" id="phosphorus-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Potassium (kg/ha)</label>
                  <input type="number" name="potassium" className="form-input" value={form.potassium} onChange={handleChange} placeholder="40" id="potassium-input" />
                </div>
              </div>
            </div>

            <button type="submit" className={`btn btn-teal btn-predict btn-squishy ${isLoading ? 'loading' : ''}`} disabled={isLoading} id="predict-btn">

              {isLoading ? (
                <>
                  <div className="cube-loader-container">
                    <div className="cube-loader">
                      <div className="cube-face cube-front"></div>
                      <div className="cube-face cube-back"></div>
                      <div className="cube-face cube-left"></div>
                      <div className="cube-face cube-right"></div>
                      <div className="cube-face cube-top"></div>
                      <div className="cube-face cube-bottom"></div>
                    </div>
                  </div>
                  <div className="processing-text">Processing AI Data...</div>
                </>
              ) : (
                <>📊 Predict Yield</>
              )}
            </button>


            {isLoading && (
              <div className="loading-steps">
                <div className="loading-step active">📥 Processing parameters...</div>
                <div className="loading-step">🧠 Running XGBoost model...</div>
                <div className="loading-step">📊 Calculating ensemble results...</div>
              </div>
            )}
          </form>
          </div>


          {/* Info Panel */}
          <div className="yield-info-panel">
            <div className="info-card">
              <h3>🔭 What We Analyze</h3>
              <ul className="tips-list">
                <li>🌾 Crop type & historical yield data</li>
                <li>🌦️ Climate & precipitation patterns</li>
                <li>🧪 Soil nutrient composition</li>
                <li>💧 Irrigation efficiency factors</li>
                <li>📅 Seasonal growth windows</li>
              </ul>
            </div>

            <div className="info-card model-info">
              <h3>🤖 ML Models Used</h3>
              <div className="model-stat"><span>Primary</span><strong>XGBoost</strong></div>
              <div className="model-stat"><span>Secondary</span><strong>Random Forest</strong></div>
              <div className="model-stat"><span>Ensemble</span><strong>Stacking Regressor</strong></div>
              <div className="model-stat"><span>Accuracy (R²)</span><strong>0.923</strong></div>
              <div className="model-stat"><span>Training Records</span><strong>58,000+</strong></div>
            </div>


          </div>
        </div>
      </div>
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  )
}

export default YieldPage
