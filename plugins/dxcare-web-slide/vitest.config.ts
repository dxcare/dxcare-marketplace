import { defineConfig } from 'vitest/config';

// Plugin-internal vitest config. `templates/repo/` is the bundle shipped to
// consumers; those tests run in the consumer's own repo (after `init`) where
// the dependencies are installed. Excluding them here keeps the plugin dev
// harness light and focused on init.mjs / locate.mjs / ci-validate-*.
export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      'templates/repo/**',
    ],
  },
});
