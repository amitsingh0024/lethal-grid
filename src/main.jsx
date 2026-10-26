import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { trackEvent } from './services/analytics';
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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
