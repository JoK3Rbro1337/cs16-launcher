import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { getReduceMotion } from './lib/storage'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/saira-condensed/latin-600.css'
import '@fontsource/saira-condensed/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import './styles.css'

document.documentElement.classList.toggle('reduce-motion', getReduceMotion())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
