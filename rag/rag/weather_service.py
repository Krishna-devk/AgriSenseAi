import requests
from typing import Dict, Any

def get_precise_location(lat: float, lon: float) -> str:
    """Uses Nominatim for free reverse geocoding to get City/State name."""
    try:
        # zoom=10 targets City level rather than Suburb/Street level
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=10"
        headers = {"User-Agent": "AgriSenseAI/1.0"}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            addr = response.json().get('address', {})
            # Prefer city/town to avoid super-granular neighborhoods like "Shaniwar Peth"
            place = addr.get('city') or addr.get('town') or addr.get('district') or addr.get('state_district', 'Unknown')
            state = addr.get('state', '')
            if place and state:
                return f"{place}, {state}"
            return state or place or "Unknown Location"
    except Exception:
        pass
    return "Region Details Unavailable"


def get_coords_from_city(city_name: str) -> Dict[str, float]:
    """Geocodes a city name into lat/lon using Nominatim."""
    try:
        url = f"https://nominatim.openstreetmap.org/search?q={requests.utils.quote(city_name)}&format=json&limit=1"
        headers = {"User-Agent": "AgriSenseAI/1.0"}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200 and len(response.json()) > 0:
            data = response.json()[0]
            return {"lat": float(data['lat']), "lon": float(data['lon'])}
    except Exception as e:
        print(f"[Geocode] Error: {e}")
    return {"lat": 28.6139, "lon": 77.2090} # Default to Delhi


def get_weather_data(lat: float, lon: float, city_override: str = None) -> Dict[str, Any]:
    """
    Fetches real-time weather and climatic data for a specific location.
    Uses wttr.in for key-less, reliable JSON weather data.
    """
    try:
        # Fetching current weather + 3 day forecast for location
        # format=j1 gives detailed JSON
        url = f"https://wttr.in/{lat},{lon}?format=j1"
        response = requests.get(url, timeout=10)
        
        if response.status_code != 200:
            return {"status": "error", "message": "Weather service unavailable"}
            
        data = response.json()
        current = data['current_condition'][0]
        
        # Estimate annual rainfall (this is a simplified proxy based on current moisture/historical data if available)
        # Note: True annual rainfall requires long-term historical APIs (Open-Meteo is good for this)
        
        # Using Open-Meteo for better historical/climatological data (Free, No Key)
        hist_url = f"https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date=2023-01-01&end_date=2023-12-31&daily=precipitation_sum,apparent_temperature_mean&timezone=auto"
        hist_resp = requests.get(hist_url, timeout=10)
        
        annual_rainfall = 850.0  # Default fallback
        avg_temp = float(current['temp_C'])
        humidity = float(current['humidity'])
        
        if hist_resp.status_code == 200:
            hist_data = hist_resp.json()
            if 'daily' in hist_data and 'precipitation_sum' in hist_data['daily']:
                annual_rainfall = sum(filter(None, hist_data['daily']['precipitation_sum']))
                avg_temp_hist = sum(filter(None, hist_data['daily']['apparent_temperature_mean'])) / len(hist_data['daily']['apparent_temperature_mean'])
                # Blending current temp with historical for a "seasonal average"
                avg_temp = (avg_temp + avg_temp_hist) / 2
        
        if city_override:
            # If the UI specifically asked for "Pune", don't override it with coordinates reverse geology
            region_info = city_override
        else:
            region_info = get_precise_location(lat, lon)
            if region_info == "Region Details Unavailable":
                 region_info = data['nearest_area'][0]['region'][0]['value'] if 'nearest_area' in data else region_info
        
        return {
            "status": "success",
            "temperature": round(avg_temp, 1),
            "humidity": humidity,
            "rainfall": round(annual_rainfall, 1),
            "region_info": region_info
        }
        
    except Exception as e:
        # Heavy fallback for Demo purposes if APIs fail
        return {
            "status": "success",
            "temperature": 28.5,
            "humidity": 65,
            "rainfall": 920.0,
            "message": f"Demo Data (API failure: {str(e)})"
        }
