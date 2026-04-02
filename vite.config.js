import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages-এ লাইভ করার জন্য নিচের base লাইনটি যোগ করা হয়েছে
  base: '/Sakib-Store-New/', 
})
