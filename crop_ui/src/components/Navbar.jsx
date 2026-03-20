import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Navbar.css'

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [location])

  const isActive = (path) => location.pathname === path

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="container navbar__inner">
        <Link to="/" className="navbar__brand">
          <div className="brand-icon">🌿</div>
          <div className="brand-text">
            <span className="brand-name">AgriSense</span>
            <span className="brand-ai">AI</span>
          </div>
        </Link>

        <ul className={`navbar__links ${menuOpen ? 'navbar__links--open' : ''}`}>
          <li><Link to="/" className={`nav-link ${isActive('/') ? 'nav-link--active' : ''}`}>Home</Link></li>
          <li><Link to="/detect" className={`nav-link ${isActive('/detect') ? 'nav-link--active' : ''}`}>🔍 Disease</Link></li>
          <li><Link to="/predict" className={`nav-link ${isActive('/predict') ? 'nav-link--active' : ''}`}>📊 Yield</Link></li>
          <li><Link to="/treatment" className={`nav-link ${isActive('/treatment') ? 'nav-link--active' : ''}`}>🩺 Rx Doctor</Link></li>
          <li><Link to="/schemes" className={`nav-link ${isActive('/schemes') ? 'nav-link--active' : ''}`}>🏛️ Schemes</Link></li>
          <li><Link to="/weather" className={`nav-link ${isActive('/weather') ? 'nav-link--active' : ''}`}>🌦️ Weather</Link></li>
          <li><Link to="/market" className={`nav-link ${isActive('/market') ? 'nav-link--active' : ''}`}>📈 Market</Link></li>
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
