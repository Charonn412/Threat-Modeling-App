import React from 'react';
import ReactDOM from 'react-dom/client';
// Load saved library edits before anything renders.
import './library/registry';
import App from './App';
import { initTeam } from './team/store';
import './styles.css';

initTeam();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
