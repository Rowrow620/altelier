import { randomBytes } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const devPort = 5173;

function contentSecurityPolicy(devNonce?: string) {
  const policyNonce = devNonce ? [`'nonce-${devNonce}'`] : [];
  return [
    "default-src 'none'",
    ["script-src 'self'", ...policyNonce].join(' '),
    ["style-src 'self' https://fonts.googleapis.com", ...policyNonce].join(' '),
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://images.nexusmods.com https://staticdelivery.nexusmods.com",
    "base-uri 'none'",
    "form-action 'none'",
    ...(devNonce ? [`connect-src 'self' ws://localhost:${devPort}`] : []),
  ].join('; ');
}

export default defineConfig(({ command }) => {
  const devNonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined;

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'atelier-renderer-csp',
        apply: 'build',
        // Electron loads the built renderer from disk, where HTTP headers are unavailable.
        transformIndexHtml: () => [{
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy() },
          injectTo: 'head-prepend',
        }],
      },
    ],
    base: './',
    html: { cspNonce: devNonce },
    server: {
      port: devPort,
      strictPort: true,
      headers: { 'Content-Security-Policy': contentSecurityPolicy(devNonce) },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
