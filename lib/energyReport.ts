import type Homey from 'homey';
import { getAppApi } from './appApi.js';

/**
 * Homey Energy's own reports (`energy.getReportDay/Week/Month/Year`, `homey.energy.readonly`): the Energy tab's kWh per
 * period. Their answer isn't described in homey-api's specification and hasn't been read on a Homey yet, so before
 * Chart · Totals can take them as a source, `npm run diagnostics -- --energy-report day:2026-10-30` records one as it
 * comes (`GET /diagnostics?energyReport=`). The forms: `day:YYYY-MM-DD`, `week:YYYY-Www`, `month:YYYY-MM`, `year:YYYY`.
 */
const FORMS = {
  day: { re: /^\d{4}-\d{2}-\d{2}$/, call: 'getReportDay', arg: 'date' },
  week: { re: /^\d{4}-W\d{2}$/, call: 'getReportWeek', arg: 'isoWeek' },
  month: { re: /^\d{4}-\d{2}$/, call: 'getReportMonth', arg: 'yearMonth' },
  year: { re: /^\d{4}$/, call: 'getReportYear', arg: 'year' },
} as const;

/** `day:2026-10-30` as the call and its argument, or null. */
export function parseEnergyReport(spec: string): { call: string, args: Record<string, string> } | null {
  const at = spec.indexOf(':');
  const kind = spec.slice(0, at) as keyof typeof FORMS;
  const value = spec.slice(at + 1);
  if (at < 0 || !Object.prototype.hasOwnProperty.call(FORMS, kind) || !FORMS[kind].re.test(value)) return null;
  return { call: FORMS[kind].call, args: { [FORMS[kind].arg]: value } };
}

/**
 * The report as Homey answers it, with the reports Homey says it has (`getReportsAvailable`), each read on its own so
 * one failing (a missing scope, `Not Found`) leaves the other; an unreadable spec says how to write one.
 */
export async function readEnergyReport(homey: Homey.App['homey'], spec: string) {
  const parsed = parseEnergyReport(spec);
  if (!parsed) return { error: 'Use day:YYYY-MM-DD, week:YYYY-Www, month:YYYY-MM or year:YYYY' };
  const api = await getAppApi(homey);
  const read = async (fn: () => Promise<unknown>) => {
    try {
      return { ok: await fn() };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
  const [report, available] = await Promise.all([
    read(() => api.energy[parsed.call](parsed.args)),
    read(() => api.energy.getReportsAvailable()),
  ]);
  return { request: { [parsed.call]: parsed.args }, report, available };
}
