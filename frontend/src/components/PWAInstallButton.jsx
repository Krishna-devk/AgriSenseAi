import { useState, useEffect } from 'react'
import './PWAInstallButton.css'

// Platform detection helpers
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
const isAndroid = () => /Android/.test(navigator.userAgent)
const isDesktop = () => !isIOS() && !isAndroid()
const isInStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const PWAInstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(window.deferredPrompt || null)
  const [installed, setInstalled] = useState(isInStandaloneMode())
  const [showIOSModal, setShowIOSModal] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Already installed — nothing to do
    if (isInStandaloneMode()) {
      setInstalled(true)
      return
    }

    // Sync prompt that may already be captured in index.html
    if (window.deferredPrompt) {
      setDeferredPrompt(window.deferredPrompt)
    }

    const handlePromptReady = () => {
      setDeferredPrompt(window.deferredPrompt)
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault()
      window.deferredPrompt = e
      setDeferredPrompt(e)
    }

    const handleInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
      window.deferredPrompt = null
    }

    // Poll for the prompt (handles late-firing events)
    const poll = setInterval(() => {
      if (window.deferredPrompt && !deferredPrompt) {
        setDeferredPrompt(window.deferredPrompt)
      }
    }, 1500)

    window.addEventListener('pwa-prompt-ready', handlePromptReady)
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      clearInterval(poll)
      window.removeEventListener('pwa-prompt-ready', handlePromptReady)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [deferredPrompt])

  const handleClick = async () => {
    // iOS: no native prompt — show manual instructions
    if (isIOS()) {
      setShowIOSModal(true)
      return
    }

    // Desktop & Android: use the deferred install prompt
    const prompt = deferredPrompt || window.deferredPrompt
    if (!prompt) {
      // Fallback: user is on a browser that doesn't support install prompts
      // (e.g., Firefox) — open instructions
      alert('To install AgriSense AI:\n\n• Chrome/Edge: Click the ⊕ icon in the address bar\n• Firefox: Bookmark or use browser menu to install')
      return
    }

    try {
      setInstalling(true)
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') {
        setInstalled(true)
        setDeferredPrompt(null)
        window.deferredPrompt = null
      }
    } catch (err) {
      console.error('PWA install error:', err)
    } finally {
      setInstalling(false)
    }
  }

  // Hide if already installed as app
  if (installed) return null

  const label = isIOS()
    ? 'Add to Home Screen'
    : isDesktop()
    ? 'Install Desktop App'
    : 'Install App'

  const isReady = !!(deferredPrompt || window.deferredPrompt || isIOS())

  return (
    <>
      <div
        className={`pwa-install-floating animate-bounceIn ${isReady ? 'pwa--ready' : 'pwa--waiting'}`}
        onClick={handleClick}
        title={label}
        role="button"
        aria-label={label}
      >
        {installing ? (
          <div className="pwa-spinner" />
        ) : (
          <img src="/cropped_circle_image.png" alt="Install" className="install-logo-img" />
        )}
        <div className="install-tooltip">
          <span className="tooltip-status">
            {isReady ? (isDesktop() ? '💻 Desktop App' : '📱 Mobile App') : 'Loading...'}
          </span>
          <span className="tooltip-main">
            {installing ? 'Installing...' : label}
          </span>
        </div>
      </div>

      {/* iOS Manual Instructions Modal */}
      {showIOSModal && (
        <div className="ios-modal-backdrop" onClick={() => setShowIOSModal(false)}>
          <div className="ios-modal" onClick={e => e.stopPropagation()}>
            <button className="ios-modal-close" onClick={() => setShowIOSModal(false)}>✕</button>
            <div className="ios-modal-icon">📲</div>
            <h3>Install AgriSense AI</h3>
            <p>Add this app to your home screen for the best experience:</p>
            <ol className="ios-steps">
              <li>Tap the <strong>Share</strong> button <span className="ios-share-icon">⎙</span> at the bottom of Safari</li>
              <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top-right corner</li>
            </ol>
            <div className="ios-modal-hint">Works best in Safari on iOS</div>
          </div>
        </div>
      )}
    </>
  )
}

export default PWAInstallButton
