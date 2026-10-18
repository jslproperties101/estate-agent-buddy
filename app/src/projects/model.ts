// JoyChange002 — the Project feature: new developments (a developer's launch), as the home tile has always described it:
// developer, launch details, unit types, prices and booking status. A project is one record (collection "projects");
// its unit types and its bookings live inside it, so it syncs, backs up and keeps history like any other record.
import type { Base } from '../data/types';

export type ProjectStatus = 'upcoming' | 'launched' | 'selling' | 'sold_out' | 'completed';
export const PROJECT_STATUSES: ProjectStatus[] = ['upcoming', 'launched', 'selling', 'sold_out', 'completed'];

/** Where a unit's booking stands (the Change 40 stages, for a new launch). */
export type BookingStatus = 'reserved' | 'booked' | 'pending_loan' | 'spa_signed' | 'cancelled';
export const BOOKING_STATUSES: BookingStatus[] = ['reserved', 'booked', 'pending_loan', 'spa_signed', 'cancelled'];

export interface UnitType {
  id: string;
  /** e.g. "Type A (22 × 75)" */
  name: string;
  /** The property type, from the Subsale List's types (e.g. "Terrace house"). */
  layout?: string;
  builtUpSqft?: number;
  landSqft?: number;
  bedrooms?: number;
  bathrooms?: number;
  priceFrom?: number;
  priceTo?: number;
  /** How many units of this type the project has. */
  units?: number;
}

export interface ProjectBooking {
  id: string;
  unitTypeId?: string;
  /** e.g. "A-12" or "Lot 34" */
  unitNo: string;
  /** A saved buyer, or a name typed in. */
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  status: BookingStatus;
  /** yyyy-mm-dd */
  bookedOn?: string;
  price?: number;
  bookingFee?: number;
  note?: string;
}

export interface Project extends Base {
  name: string;
  developer?: string;
  developerContact?: string;
  developerPhone?: string;
  state?: string;
  city?: string;
  township?: string;
  address?: string;
  tenure?: 'freehold' | 'leasehold';
  status: ProjectStatus;
  /** yyyy-mm */
  launchDate?: string;
  /** Expected completion / vacant possession, yyyy-mm */
  completionDate?: string;
  /** Developer's rebates, packages and any other launch details. */
  launchNotes?: string;
  /** The agent's own commission for this project, in %. */
  commissionPct?: number;
  unitTypes: UnitType[];
  bookings: ProjectBooking[];
  notes?: string;
}

/** A booking that still holds its unit (anything but Cancelled). */
export const holdsUnit = (b: ProjectBooking) => b.status !== 'cancelled';

/** Lowest and highest price over the unit types (undefined when no price was given). */
export function priceRange(p: Pick<Project, 'unitTypes'>): { from?: number; to?: number } {
  const lows = p.unitTypes.map(u => u.priceFrom ?? u.priceTo).filter((x): x is number => x !== undefined);
  const highs = p.unitTypes.map(u => u.priceTo ?? u.priceFrom).filter((x): x is number => x !== undefined);
  return { from: lows.length ? Math.min(...lows) : undefined, to: highs.length ? Math.max(...highs) : undefined };
}

/** Units, booked units and units left, per unit type and in total. "Left" is only known when the units are given. */
export function unitCounts(p: Pick<Project, 'unitTypes' | 'bookings'>): { total?: number; booked: number; left?: number; byType: Record<string, { total?: number; booked: number; left?: number }> } {
  const byType: Record<string, { total?: number; booked: number; left?: number }> = {};
  for (const u of p.unitTypes) byType[u.id] = { total: u.units, booked: 0 };
  let booked = 0;
  for (const b of p.bookings) {
    if (!holdsUnit(b)) continue;
    booked++;
    if (b.unitTypeId && byType[b.unitTypeId]) byType[b.unitTypeId].booked++;
  }
  for (const k of Object.keys(byType)) { const t = byType[k]; if (t.total !== undefined) t.left = Math.max(0, t.total - t.booked); }
  const known = p.unitTypes.filter(u => u.units !== undefined);
  const total = known.length ? known.reduce((n, u) => n + (u.units ?? 0), 0) : undefined;
  return { total, booked, left: total !== undefined ? Math.max(0, total - booked) : undefined, byType };
}

/** A unit number already held by another (not cancelled) booking in the project. */
export const unitTaken = (p: Pick<Project, 'bookings'>, unitNo: string, exceptId?: string) =>
  p.bookings.some(b => b.id !== exceptId && holdsUnit(b) && b.unitNo.trim().toLowerCase() === unitNo.trim().toLowerCase());

/** The agent's commission on a booking (only when both the price and the project commission are known). */
export const bookingCommission = (p: Pick<Project, 'commissionPct'>, b: Pick<ProjectBooking, 'price' | 'status'>) =>
  b.status !== 'cancelled' && b.price !== undefined && p.commissionPct !== undefined ? Math.round(b.price * p.commissionPct) / 100 : undefined;

export const placeOf = (p: Pick<Project, 'township' | 'city' | 'state'>) => [p.township, p.city, p.state].filter(Boolean).join(', ');
