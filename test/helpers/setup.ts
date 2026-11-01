import { beforeEach } from 'vitest';

// The Insights limiter is app-wide (module state): a busy Homey in one test mustn't pause the next one's reads.
// Imported here, not at the top: a static import would load `homey-api` before a test file's `vi.mock` of it.
beforeEach(async () => {
  (await import('../../lib/insightsLog.js')).resetInsightsLimit();
});
