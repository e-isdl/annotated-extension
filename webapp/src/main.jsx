import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { isThemeId } from './lib/themes';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/tour.css';

let storedTheme = null;
try { storedTheme = localStorage.getItem('annotated-theme'); } catch {}
document.documentElement.dataset.theme = isThemeId(storedTheme) ? storedTheme : 'light';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
