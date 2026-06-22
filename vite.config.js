import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'  // ← เพิ่ม

export default defineConfig({
  base: '/Training_record/',  // ← เพิ่ม สำหรับ deploy ขึ้น GitHub Pages
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    tailwindcss(),  // ← เพิ่ม
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})