import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        'src/server.ts',
        'src/types/**',
        'src/modules/domain/domain.events.ts',
        'src/modules/realtime/**',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: { branches: 20, functions: 18, lines: 30, statements: 30 },
    },
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
