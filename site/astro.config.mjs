// @ts-check
// Trang giới thiệu Budkin — trang tĩnh (Astro), đăng lên GitHub Pages: https://hoangduong2k.github.io/Budkin/
// Dùng chung với app: hình robot 2D (src/renderer/src/flat/robots/art.tsx, styles/robot-art.css), ảnh chụp
// (docs/screenshots). React chỉ chạy ở những phần cần tương tác (robot ở góc, menu, câu hỏi thường gặp).
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://hoangduong2k.github.io',
  base: '/Budkin',
  trailingSlash: 'ignore',
  i18n: {
    locales: ['vi', 'en'],
    defaultLocale: 'vi',
    // Tiếng Việt ở /Budkin/, tiếng Anh ở /Budkin/en/
    routing: { prefixDefaultLocale: false }
  },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Một bản React cho cả trang lẫn file dùng chung với app (nằm ngoài thư mục site/)
    resolve: { dedupe: ['react', 'react-dom'] },
    server: { fs: { allow: ['..'] } }
  }
})
