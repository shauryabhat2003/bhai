import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173
  },
  preview: {
    port: 5173,
    host: true
  },
  export default defineConfig({
    build: {
      outDir: '../server/client/dist'
    }
  }),
  
})
