import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/tokens.css';
import './styles/globals.css';

let storedTheme = null;
try { storedTheme = localStorage.getItem('annotated-theme'); } catch {}
document.documentElement.dataset.theme = storedTheme === 'dark' ? 'dark' : 'light';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
