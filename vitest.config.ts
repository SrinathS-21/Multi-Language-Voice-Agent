import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/unit/**/*.test.ts'],
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['convex/**/*.ts'],
            exclude: ['convex/_generated/**'],
        },
    },
});
