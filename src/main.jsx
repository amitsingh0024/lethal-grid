import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IS_PORTAL_BUILD, trackEvent } from './services/analytics';
import { preloadArt } from './services/preloadArt';
// Fonts are bundled and served from our own origin: no render-blocking request to Google Fonts,
// and no player IP sent to a third party before consent
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-500.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-400-italic.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import './index.css';

// Errors outside React rendering (timers, promises, event handlers) never reach the
// ErrorBoundary; report the first few per visit so they show up in analytics
let reportedErrors = 0;
const reportError = (kind, message) => {
  if (reportedErrors >= 5) return;
  reportedErrors += 1;
  try {
    trackEvent('js_error', { kind, message: String(message || 'unknown').slice(0, 150) });
  } catch {
    // Reporting must never throw
  }
};
window.addEventListener('error', (e) => reportError('error', e.message));
window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason?.message || e.reason));

// Inside a portal's iframe, Space and the arrow keys would scroll the portal's page behind the
// game. Form fields keep them, and Space still presses a focused button.
if (IS_PORTAL_BUILD) {
  const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);
  window.addEventListener('keydown', (e) => {
    if (!SCROLL_KEYS.has(e.key)) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A')) return;
    e.preventDefault();
  });
}

// Offline play for the installed web game. Portal builds run inside someone else's iframe and
// origin, so they never register one.
if (!IS_PORTAL_BUILD && import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without it the game still works online
    });
  });
}

// The loading screen in index.html stays up until the backdrops and first boards are ready
preloadArt().then(() => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});
