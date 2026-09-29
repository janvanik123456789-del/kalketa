import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BLOCK_CSS } from '@calccanvas/render';
import { App } from './App.js';
import './styles.css';

// The sheet looks exactly like the printout: same block styles.
const style = document.createElement('style');
style.textContent = BLOCK_CSS;
document.head.prepend(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
