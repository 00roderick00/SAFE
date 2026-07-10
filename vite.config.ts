import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.GITHUB_PAGES ? '/SAFE/' : '/',
  resolve: {
    alias: {
      // Shared code between client and Supabase Edge Functions.
      // The source of truth lives under supabase/functions/_shared so
      // Deno can import it via relative paths from each function file.
      '@shared': path.resolve(__dirname, 'supabase/functions/_shared'),
    },
  },
})
