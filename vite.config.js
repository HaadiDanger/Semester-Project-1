import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // Keep Vite's default denials and protect generated local operator credentials.
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
        '**/.dev-seed/**', '**/.profile-imports/**', '**/.supabase/**', '**/supabase/.temp/**', '**/supabase/.branches/**'],
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'motion', test: /node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/, priority: 20 },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
})
