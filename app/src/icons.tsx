// Small inline icons, so the app needs no icon package and works offline.
type P = { size?: number };
const svg = (d: string) => ({ size = 22 }: P) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export const IconBack = svg('M15 5l-7 7 7 7');
export const IconNews = svg('M4 5h13v14H6a2 2 0 01-2-2zM17 9h3v8a2 2 0 01-2 2M7 9h7M7 13h7M7 16h4');
export const IconCamera = svg('M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z');
export const IconTrash = svg('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13');
export const IconCheck = svg('M5 12l5 5 9-10');
export const IconTodo = svg('M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2');
export const IconCalendar = svg('M4 6h16v14H4zM4 10h16M8 3v4M16 3v4');
export const IconTrend = svg('M3 17l6-6 4 4 8-8M15 7h6v6');
export const IconHome = svg('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6');
export const IconVendor = svg('M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0');
export const IconBuyer = svg('M8 11a3 3 0 100-6 3 3 0 000 6zM16 11a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M12 20a6 6 0 0110 0');
export const IconGps = svg('M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z');
export const IconExpert = svg('M12 3a7 7 0 00-4 12.7V19h8v-3.3A7 7 0 0012 3zM9 22h6');
export const IconLock = svg('M6 11h12v10H6zM8 11V8a4 4 0 018 0v3');
export const IconRestore = svg('M4 12a8 8 0 108-8H7M7 1L4 4l3 3');
export const IconNote = svg('M6 3h9l4 4v14H6zM9 12h7M9 16h7');
export const IconMic = svg('M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M8 21h8');
/** Estate Agent Buddy mark: a roof over a key-shaped door. */
export const IconLogo = ({ size = 28 }: P) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none">
    <defs><linearGradient id="eab-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7E7A6" /><stop offset=".5" stopColor="#D4AF37" /><stop offset="1" stopColor="#9C7A22" /></linearGradient></defs>
    <rect x="1" y="1" width="30" height="30" rx="9" stroke="url(#eab-gold)" strokeWidth="1.6" />
    <path d="M7 15.5L16 8l9 7.5" stroke="url(#eab-gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16" cy="17" r="2.6" stroke="url(#eab-gold)" strokeWidth="2" />
    <path d="M16 19.6V25M16 22.5h2.4" stroke="url(#eab-gold)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
