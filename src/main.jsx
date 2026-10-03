import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installTapHaptics } from './utils/haptics'

installTapHaptics()

// The pre-v2 Storage image cache held opaque responses (see vite.config.js);
// nothing reads it any more, so free the space.
if (typeof caches !== 'undefined') caches.delete('firebase-storage-images').catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
