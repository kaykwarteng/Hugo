import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { loadAppearance } from './services/storage'
import { applyAppearance } from './utils/appearance'

async function bootstrap() {
  try {
    applyAppearance(document.documentElement, await loadAppearance())
  } catch {
    // DB/API may be offline on first paint; defaults remain applied via CSS.
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
