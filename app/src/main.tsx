import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installKeyboardAlign } from './ui/keyboardAlign';

// JoyChange002 Change 30: the field being typed in always shows above the keyboard.
installKeyboardAlign();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
