import React from 'react';
import { trackEvent } from '../services/analytics';

/**
 * Catches render errors anywhere in the game so a bug shows a recovery card
 * instead of blanking the whole page. The save in localStorage is never touched.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lethal Grid crashed:', error, info?.componentStack);
    try {
      trackEvent('app_crash', {
        message: String(error?.message || error).slice(0, 150),
      });
    } catch {
      // Analytics must never break the recovery screen
    }
  }

  handleCopy = () => {
    const { error } = this.state;
    const text = `${error?.name || 'Error'}: ${error?.message || error}\n${error?.stack || ''}`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => this.setState({ copied: true }))
      .catch(() => {});
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>The siege hit a snag</h1>
          <p>
            Something went wrong, but your progress is saved. Reload to jump back in.
          </p>
          <code className="crash-detail">{String(error?.message || error)}</code>
          <div className="crash-actions">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="btn-secondary" onClick={this.handleCopy}>
              {copied ? 'Copied' : 'Copy error details'}
            </button>
          </div>
        </div>
      </main>
    );
  }
}
