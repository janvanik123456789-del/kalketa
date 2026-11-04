import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BLOCK_CSS } from '@kalketa/render';
import { App } from './App.js';
import { MATH_FONT_CSS } from './mathFont.js';
import './styles.css';
import '@kalketa/chart-editor/chart-editor.css';

// The sheet looks exactly like the printout: same block styles.
const style = document.createElement('style');
style.textContent = `${MATH_FONT_CSS}\n${BLOCK_CSS}`;
document.head.prepend(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
