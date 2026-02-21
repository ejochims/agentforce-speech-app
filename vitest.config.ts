import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    environmentMatchGlobs: [
      // Client-side tests run in jsdom to access browser APIs (Web Speech, AudioContext, etc.)
      // Matched against the absolute path, so we use the double-star prefix.
      ['**/client/**', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.ts', 'shared/**/*.ts'],
      exclude: ['server/index.ts', 'server/vite.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
