import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Electron renderer build — base must be './' so assets load over file:// protocol.
// Browser / GitHub Pages build uses vite.config.ts with base: '/WebLogViewer/'.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: {
    format: 'es'
  }
})
