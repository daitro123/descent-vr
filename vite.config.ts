import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:quest` serves over HTTPS on the LAN: the Quest browser only
// exposes WebXR on secure origins, and a LAN IP is not one without TLS.
export default defineConfig(({ mode }) => ({
  // Relative asset URLs, so the build works under GitHub Pages' /descent-vr/
  // subpath as well as at a site root.
  base: './',
  plugins: mode === 'quest' ? [basicSsl()] : [],
  server: { host: true },
  // @iwer/devui pins its own three; share ours instead of bundling two copies.
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1500 },
}));
