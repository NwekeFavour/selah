import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      theme="light"
      richColors
      closeButton
      visibleToasts={4}
      toastOptions={{ className: "selah-toast" }}
    />
  </StrictMode>,
)
