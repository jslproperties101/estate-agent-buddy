// Small inline icons, so the app needs no icon package and works offline.
import logo256 from './brand/logo-256.webp';
import logo512 from './brand/logo-512.webp';
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
export const IconGear = svg('M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1');
export const IconMic = svg('M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M8 21h8');
/** Estate Agent AI Buddy logo (the owner's artwork, white outer border removed; source in assets/brand/). */
export const IconLogo = ({ size = 28, big }: P & { big?: boolean }) => (
  <img className="logo-img" src={big ? logo512 : logo256} width={size} height={size} alt="" aria-hidden="true" decoding="async" draggable={false} />
);
