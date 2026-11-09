import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'FeriaBot Pro',
        short_name: 'FeriaBot',
        description: 'Credenciales con QR, fichas digitales de stands y leads de ferias.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0a0e1c',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [{ name: 'Mi tarjeta QR', short_name: 'Mi tarjeta', url: '/visitante', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] }],
      },
      workbox: {
        // Todas las rutas de la app (incluida /visitante) abren el index.html guardado cuando no hay red.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        runtimeCaching: [
          {
            // Lecturas de la API que usa la tarjeta del visitante (API en el puerto 8000 o detrás de /api).
            // Primero la red; sin conexión, la última respuesta guardada. Workbox copia esta función tal cual
            // dentro del service worker: no puede usar constantes de este archivo.
            urlPattern: ({ url, request, sameOrigin }) =>
              request.method === 'GET' &&
              (!sameOrigin || url.pathname.startsWith('/api/')) &&
              /^\/(?:api\/)?(?:visitantes\/[^/]+|inscripciones|leads|vistas|ferias(?:\/[^/]+)?)\/?$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              // Se borra al cerrar sesión (AuthContext), para no dejar datos de otra cuenta.
              cacheName: 'feriabot-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'feriabot-fuentes',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Con VITE_API_URL=/api el frontend y la API salen por el mismo puerto (útil para túneles).
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
