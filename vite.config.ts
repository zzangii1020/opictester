import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages /opictester/).
  base: './',
  server: {
    // The optional AI evaluation server (npm run server) keeps the API key server-side.
    proxy: { '/api': 'http://localhost:8787' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:8787' },
  },
})
