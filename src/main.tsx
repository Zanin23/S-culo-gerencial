import '@fontsource-variable/inter';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Elemento #root não encontrado. Verifique o index.html.');
}

createRoot(container).render(<App />);
