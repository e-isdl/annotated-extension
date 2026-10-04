import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try { console.error('[annotated crash]', error, info); } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 480 }}>
          <h1 style={{ fontSize: 17, margin: '0 0 8px' }}>Something broke while loading.</h1>
          <p style={{ fontSize: 13, opacity: 0.7, margin: '0 0 8px' }}>Screenshot this and send it to support:</p>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, background: 'rgba(127,127,127,.15)', padding: 12, borderRadius: 8, margin: 0 }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #888', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
