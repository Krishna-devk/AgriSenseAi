import { useState, useEffect } from 'react'
import './LocationBanner.css'

const LocationBanner = () => {
    const [isVisible, setIsVisible] = useState(false)
    const [location, setLocation] = useState('')

    useEffect(() => {
        const checkSync = () => {
            const lastSync = localStorage.getItem('agrisense_last_sync_v2')
            const locationData = localStorage.getItem('agrisense_location_data_v2')
            
            if (lastSync && locationData) {
                const now = new Date().getTime()
                const data = JSON.parse(locationData)
                
                // If synced in the last 60 seconds, show the banner
                if (now - parseInt(lastSync) < 60000) {
                    setLocation(data.region_info)
                    setIsVisible(true)
                    
                    // Auto-hide after 8 seconds
                    const timer = setTimeout(() => setIsVisible(false), 8000)
                    return () => clearTimeout(timer)
                }
            }
        }

        const handleSyncEvent = (e) => {
            setLocation(e.detail.region_info)
            setIsVisible(true)
        }

        checkSync()
        window.addEventListener('agrisense_location_synced', handleSyncEvent)
        window.addEventListener('storage', checkSync)
        return () => {
            window.removeEventListener('agrisense_location_synced', handleSyncEvent)
            window.removeEventListener('storage', checkSync)
        }
    }, [])

    if (!isVisible) return null

    return (
        <div className="location-banner animate-slideIn">
            <div className="location-banner__content">
                <span className="location-banner__icon">📍</span>
                <span className="location-banner__text">
                    Field details for <strong>{location}</strong> detected correctly. Environmental parameters fetched!
                </span>
                <button className="location-banner__close" onClick={() => setIsVisible(false)}>✕</button>
            </div>
            <div className="location-banner__progress" />
        </div>
    )
}

export default LocationBanner
