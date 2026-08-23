import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    coverage: {
      exclude: ['src/main.tsx', 'src/lib/types.ts'],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { branches: 23, functions: 27, lines: 37, statements: 36 },
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
