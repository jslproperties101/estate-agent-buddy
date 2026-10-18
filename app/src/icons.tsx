// Small inline icons, so the app needs no icon package and works offline.
import logo256 from './brand/logo-256.webp';
import logo512 from './brand/logo-512.webp';
import splash256 from './brand/splash-256.webp';
import splash512 from './brand/splash-512.webp';
import robot96 from './brand/robot-96.webp';
import robot192 from './brand/robot-192.webp';
type P = { size?: number };
const svg = (d: string) => ({ size = 22 }: P) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export const IconBack = svg('M15 5l-7 7 7 7');
export const IconNews = svg('M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M7 9h7M7 13h7M7 16h4');
export const IconTodo = svg('M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2');
export const IconCalendar = svg('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4');
export const IconTrend = svg('M3 17l6-6 4 4 8-8M15 7h6v6');
export const IconHome = svg('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6');
export const IconVendor = svg('M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0');
export const IconBuyer = svg('M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M12 20a6 6 0 0110 0');
export const IconGps = svg('M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z');
export const IconExpert = svg('M12 3a7 7 0 00-4 12.7V19h8v-3.3A7 7 0 0012 3zM9 22h6');
export const IconMoney = svg('M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v4M18 10v4');
export const IconCalc = svg('M6 3h12v18H6zM9 7h6M9 11h1M12 11h1M15 11h0M9 14h1M12 14h1M9 17h1M12 17h1M15 14v3');
/** Change 29: the plain user (profile) icon for the top bar: a head and shoulders inside a circle. */
export const IconUser = svg('M12 21a9 9 0 100-18 9 9 0 000 18zM12 13a3 3 0 100-6 3 3 0 000 6zM6.2 18.2a6.5 6.5 0 0111.6 0');
export const IconCard = svg('M3 6h18v12H3zM8 13a2 2 0 100-4 2 2 0 000 4zM5 16a3 3 0 016 0M14 10h4M14 13h4');
/** Subsale: a house with a resale arrow. */
export const IconSubsale = svg('M3 11l8-6 8 6M5 10v9h8M17 14h5M19.5 11.5L22 14l-2.5 2.5M22 19h-5');
/** Project: a new development, two towers with a crane. */
export const IconProject = svg('M4 21V9h6v12M10 21V5h6v16M3 21h18M16 3h5M19 3v5M7 12h0M7 15h0M13 8h0M13 11h0M13 14h0');
/** Market Intelligence: a bar chart with a magnifier. */
export const IconMarket = svg('M4 20V13M9 20V9M14 20v-5M3 20h12M18 14a3 3 0 100-6 3 3 0 000 6zM20.2 12.2L22 14');
/** Co-broke: two hands meeting over a house. */
export const IconCobroke = svg('M12 3l6 4.5V11H6V7.5zM3 15l4-2 3 2h4a1.5 1.5 0 010 3h-3M21 15l-4-2M3 15v5h3l5 1 7-3 3-3');
/** Notifications: a bell. */
export const IconBell = svg('M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0');
/** Contacts: two people (buyers and vendors together). */
export const IconContacts = svg('M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a6 6 0 013.5 6');
/** Inquiries & Viewings: a speech bubble with an eye. */
export const IconChat = svg('M4 5h16v11H9l-5 4zM8.5 10.5c1-1.6 2.2-2.4 3.5-2.4s2.5.8 3.5 2.4c-1 1.6-2.2 2.4-3.5 2.4s-2.5-.8-3.5-2.4zM12 10.5h0');
/** Settings: a gear. */
// Change 18 (owner): a real settings cog, drawn like the other icons (outline, same stroke). The earlier drawing was a circle
// with eight rays, which looked like a sun. Outline from the Feather icon set (MIT licence).
export const IconGear = svg('M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z');
export const IconPencil = svg('M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4zM14.5 5.5l3 3');
export const IconPin = svg('M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z');
/** Change 015: the X that closes a popup. */
export const IconClose = svg('M6 6l12 12M18 6L6 18');
/** Change 43: the robot mascot from the logo (no house or buildings), used for AI Assisted Command. Cut from the owner's logo
 *  artwork supplied by the owner on 18 Oct 2026 (assets/brand/robot-source.png, transparent background). */
export const IconRobot = ({ size = 40 }: P) => (
  <img className="robot-img" src={size > 48 ? robot192 : robot96} srcSet={`${robot96} 96w, ${robot192} 192w`} sizes={`${size}px`} width={size} height={size} alt="" aria-hidden="true" decoding="async" draggable={false} />
);
export const IconMic = svg('M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M8 21h8');
/** Estate Agent AI Buddy logo in the app: header, sign-in and first-start choice. Change 002a (owner, Oct 2026): the owner-supplied
 *  black-and-gold artwork (assets/brand/logo-002a-source.jpg) replaces the earlier red-bordered logo here only; the phone's
 *  launcher icon and the start-up `splash` artwork are unchanged. */
export const IconLogo = ({ size = 28, big, splash }: P & { big?: boolean; splash?: boolean }) => (
  <img className="logo-img" src={splash ? (big ? splash512 : splash256) : (big ? logo512 : logo256)} width={size} height={size} alt="" aria-hidden="true" decoding="async" draggable={false} />
);

// Change 011 / 013: Creative Media (a picture frame with a sparkle), Buyer Matching (a person linked to a house) and the
// top-bar language button (a globe).
export const IconCreative = svg('M4 6h11v12H4zM4 15l3.5-3.5 3 3 2-2 2.5 2.5M8.5 9.5h0M18 3l.8 2.2L21 6l-2.2.8L18 9l-.8-2.2L15 6l2.2-.8z');
export const IconMatch = svg('M7 10a3 3 0 100-6 3 3 0 000 6zM2 20a5 5 0 0110 0M14 13l4-3.5 4 3.5M15 12.5V20h6v-7.5M10.5 13.5h3M12.5 11.5l2 2-2 2');
export const IconGlobe = svg('M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z');
// ClaudeChanges001 change 12: Calendar and To-do in one tile, and Track My Sales.
export const IconAgenda = svg('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M7.5 14.5l1.5 1.5 3-3M14 15h3');
export const IconSales = svg('M4 20h16M6.5 16.5v-3M10.5 16.5v-6M14.5 16.5v-4M18.5 16.5V7M4.5 11l5-4.5 4 3 6-5');
