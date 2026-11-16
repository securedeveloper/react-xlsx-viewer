import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import 'react-xlsx-viewer/styles.css';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
