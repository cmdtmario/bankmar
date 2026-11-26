import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const preparar = import.meta.env.VITE_DEMO ? import('./demo/servidor').then((m) => m.instalarDemo()) : Promise.resolve();

preparar.then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
))
