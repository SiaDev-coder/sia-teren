import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { setupInstallCapture } from './screens/Install'
import { purgeTrash } from './db/repo'
import { getSetting, setSetting } from './db/settings'
import './styles.css'

setupInstallCapture()

// Golește din Coș elementele mai vechi de 30 de zile (o dată pe zi).
void (async () => {
  try {
    const last = await getSetting('lastPurgeAt')
    if (!last || Date.now() - last > 864e5) {
      await purgeTrash()
      await setSetting('lastPurgeAt', Date.now())
    }
  } catch (e) {
    console.error('Golire Coș:', e)
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
