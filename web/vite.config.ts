import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load environment variables from the root .env instead of web/.env.local
  envDir: '../',
})
