import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/panel.css';

const storedTheme = localStorage.getItem('annotated-theme');
document.documentElement.dataset.theme = storedTheme === 'dark' ? 'dark' : 'light';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
