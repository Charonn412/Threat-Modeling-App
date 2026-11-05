import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the built app works from GitHub Pages, a subfolder, or file://
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { globals: true, environment: 'node' },
});
