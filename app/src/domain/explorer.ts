// Explorer progress on the dashboard, worked out only from the agent's own saved records (nothing invented):
//  - km explored this week: distance of House Shopping routes started since Monday 00:00 (local time);
//  - properties on the map: properties with a saved map position, out of all properties;
//  - routes recorded: saved House Shopping journeys.
// Sample (demo) records are left out so the numbers describe real work only.
import type { Journey } from '../data/types';
import type { Listing } from '../listing/model';
import { hasPosition } from '../listing/model';

export interface ExplorerProgress { kmWeek: number; mapped: number; total: number; trips: number }

/** Monday 00:00 local time of the week containing `now`. */
export function weekStart(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (d.getDay() + 6) % 7; // Monday → 0 … Sunday → 6
  d.setDate(d.getDate() - back);
  return d.getTime();
}

export function explorerProgress(journeys: Journey[], properties: Listing[], now = new Date()): ExplorerProgress {
  const from = weekStart(now);
  const real = <T extends { sample?: boolean }>(xs: T[]) => xs.filter(x => !x.sample);
  const js = real(journeys);
  const ps = real(properties);
  const metres = js.filter(j => j.startedAt >= from).reduce((sum, j) => sum + (j.distanceM || 0), 0);
  return {
    kmWeek: Math.round(metres / 100) / 10,
    mapped: ps.filter(hasPosition).length,
    total: ps.length,
    trips: js.filter(j => j.status === 'saved').length,
  };
}
