import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: '.vite-cache',
  base: process.env.GITHUB_PAGES ? '/SAFE/' : '/',
  resolve: {
    alias: {
      // Shared code between client and Supabase Edge Functions.
      // The source of truth lives under supabase/functions/_shared so
      // Deno can import it via relative paths from each function file.
      '@shared': path.resolve(import.meta.dirname, 'supabase/functions/_shared'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/@supabase/')) return 'vendor-supabase'
          if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) return 'vendor-motion'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'vendor-react'
          if (id.includes('/lucide-react/')) return 'vendor-icons'
          if (id.includes('/@radix-ui/')) return 'vendor-dialog'
          return undefined
        },
      },
    },
  },
})
