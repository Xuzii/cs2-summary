import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path matches the GitHub Pages URL at https://xuzii.github.io/cs2-summary/.
// `assetsDir: 'app'` keeps Vite's hashed JS/CSS bundles under /app/ so that
// our hand-curated /static/ and /matches/ directories never collide with a
// future build artifact.
export default defineConfig({
  base: '/cs2-summary/',
  plugins: [react()],
  build: {
    assetsDir: 'app',
    sourcemap: false,
  },
});
