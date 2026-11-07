import { defineConfig } from 'vitest/config';

// Set here so the test workers inherit it: the tests' fixtures are Copenhagen times, like the Homey they were checked on.
process.env.TZ = 'Europe/Copenhagen';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/helpers/setup.ts'],
    // Not vitest's 5 s: on the NAS build box, with other sessions running, a widget test that takes under a second
    // elsewhere took up to 24 s, and different tests failed in each run. A hung test still fails.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // `npm run coverage`: a report (coverage/index.html and a summary), not a gate. The widget and page scripts run
    // unchanged in the tests, under their own file names (test/helpers/loadWidget.ts' `runFile()`), so they're counted too.
    coverage: {
      provider: 'v8',
      include: ['app.ts', 'api.ts', 'lib/**/*.ts', 'widgets/*/api.ts', 'widgets/*/public/*.js', 'settings/*.js'],
      exclude: ['settings/socket.io.js'],
      reporter: ['text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
});
