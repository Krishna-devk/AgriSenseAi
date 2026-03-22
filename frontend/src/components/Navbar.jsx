import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { loginWithGoogle, logout } from '../auth/firebase'
import './Navbar.css'

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userPhoto, setUserPhoto] = useState(localStorage.getItem('agrisense_user_photo') || null)
  const [userEmail, setUserEmail] = useState(localStorage.getItem('agrisense_user_email') || null)
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const syncUser = () => {
      setUserPhoto(localStorage.getItem('agrisense_user_photo') || null)
      setUserEmail(localStorage.getItem('agrisense_user_email') || null)
    }
    window.addEventListener('agrisense_profile_updated', syncUser)
    window.addEventListener('storage', syncUser)
    return () => {
      window.removeEventListener('agrisense_profile_updated', syncUser)
      window.removeEventListener('storage', syncUser)
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location])

  const isActive = (path) => location.pathname === path

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand">
          <img src="/cropped_circle_image.png" alt="AgriSense Logo" className="brand-logo-img" />
          <div className="brand-text">
            <span className="brand-name">AgriSense</span>
            <span className="brand-ai">AI</span>
          </div>
        </Link>

        <ul className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <li><Link to="/" className={`nav-link ${isActive('/') ? 'nav-link--active' : ''}`}>Home</Link></li>
          <li><Link to="/detect" className={`nav-link ${isActive('/detect') ? 'nav-link--active' : ''}`}><span className="nav-icon">🔍</span> Disease</Link></li>
          <li><Link to="/predict" className={`nav-link ${isActive('/predict') ? 'nav-link--active' : ''}`}><span className="nav-icon">📊</span> Yield</Link></li>
          <li><Link to="/treatment" className={`nav-link ${isActive('/treatment') ? 'nav-link--active' : ''}`}><span className="nav-icon">🩺</span> Rx Doctor</Link></li>
          <li><Link to="/schemes" className={`nav-link ${isActive('/schemes') ? 'nav-link--active' : ''}`}><span className="nav-icon">🏛️</span> Schemes</Link></li>
          <li><Link to="/weather" className={`nav-link ${isActive('/weather') ? 'nav-link--active' : ''}`}><span className="nav-icon">🌍</span> Weather</Link></li>
          <li><Link to="/market" className={`nav-link ${isActive('/market') ? 'nav-link--active' : ''}`}><span className="nav-icon">📈</span> Market</Link></li>
          
          <li>
            <Link to="/profile" className={`nav-link nav-link--profile ${isActive('/profile') ? 'nav-link--active' : ''}`}>
              {userEmail ? (
                <>
                  {userPhoto ? (
                    <img src={userPhoto} alt="User" className="nav-profile-img" />
                  ) : (
                    <span className="nav-icon">👤</span>
                  )}
                  <span>Profile</span>
                </>
              ) : (
                <>
                  <span className="nav-icon">🔑</span>
                  <span>Sign In</span>
                </>
              )}
            </Link>
          </li>
        </ul>

        <div className="navbar__actions">

          
          <button
            className={`hamburger ${menuOpen ? 'hamburger--open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
        </div>

      </div>
    </nav>
  )
}

export default Navbar
