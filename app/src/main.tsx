import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installKeyboardAlign } from './ui/keyboardAlign';
import { isWebsite } from './native/native';

// JoyChange002 Change 47: the laptop website gets its wide layout (styles.css, html.website) and has no on-screen keyboard.
if (isWebsite()) document.documentElement.classList.add('website');
// JoyChange002 Change 30: the field being typed in always shows above the keyboard.
else installKeyboardAlign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
