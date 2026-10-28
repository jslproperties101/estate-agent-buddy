// Built-in reference content. Figures are reference only and must be confirmed on the official MM2H portal
// (mm2h.gov.my) or with a licensed MM2H agent: programme rules change.

export const RULES_CHECKED = '29 Oct 2026';
export const OFFICIAL_MM2H = 'https://www.mm2h.gov.my/apply/guidelines';
export const OFFICIAL_IMMIGRATION = 'https://www.imi.gov.my/';
export const OFFICIAL_MOTAC = 'https://www.motac.gov.my/';

export const TIER_INFO = [
  { tier: 'Silver', age: '25+', fd: 'US$150,000', property: 'RM600,000+', pass: '5 years (renewable)' },
  { tier: 'Gold', age: '25+', fd: 'US$500,000', property: 'RM1,000,000+', pass: '15 years (renewable)' },
  { tier: 'Platinum', age: '25+', fd: 'US$1,000,000', property: 'RM2,000,000+', pass: '20 years (renewable)' },
  { tier: 'SEZ/SFZ', age: '21+', fd: 'US$65,000 (21–49) / US$32,000 (50+)', property: 'Per state policy', pass: '10 years (renewable)' },
];

export const GENERAL_RULES = [
  'Minimum stay: 90 days a year (cumulative) for principals under 50.',
  'Up to 50% of the fixed deposit may be withdrawn after approval, for residence, education, medical or tourism.',
  'Buying a residence is compulsory after approval; it cannot be sold for 10 years except to upgrade.',
  'Dependants: spouse, children under 21 (21–34 if single and unemployed), disabled children, parents / parents-in-law.',
  'Pass renewal fee: RM500 per year; visa fee RM0–50 depending on nationality.',
];

export const INTEGRATIONS = [
  { name: 'MM2H / Immigration portal status sync', status: 'Planned', note: 'Read application status automatically once an official API or agent feed exists.' },
  { name: 'Licensed agent case link (our MM2H office)', status: 'In design', note: 'Share tracker progress and documents with your agent securely.' },
  { name: 'Bank fixed-deposit verification', status: 'Planned', note: 'Confirm FD placement and balance from the bank.' },
  { name: 'Cloud backup and multi-device sync', status: 'Planned', note: 'Today your data stays on this phone; use Settings → Backup.' },
  { name: 'Phone reminders (notifications)', status: 'Planned', note: 'Today deadlines show inside the app on Welcome Home.' },
  { name: 'Live AI Buddy (online model)', status: 'Needs approval', note: 'Today the Buddy answers from built-in offline knowledge. A live model needs an approved API key.' },
  { name: 'Estate Agent AI Buddy property search', status: 'In design', note: 'Find homes for the residence requirement from our agent app.' },
  { name: 'Partner coupons feed', status: 'Planned', note: 'Real partner offers pushed to the Coupons wallet.' },
  { name: 'Payments (fees, services)', status: 'Not started', note: 'No payments are taken in this app.' },
  { name: 'WhatsApp agent chat', status: 'Available (link)', note: 'Directory contacts open WhatsApp with one tap.' },
];

export const CURRICULA = [
  { name: 'British (IGCSE / A-Level)', note: 'Most common at international schools in Klang Valley, Penang and Johor.' },
  { name: 'International Baccalaureate (IB)', note: 'PYP / MYP / DP; offered by several international schools.' },
  { name: 'American (AP / US High School Diploma)', note: 'Fewer schools; mainly in Kuala Lumpur.' },
  { name: 'Australian / Canadian', note: 'Some private and international schools offer these.' },
  { name: 'Malaysian national / private', note: 'Taught in Bahasa Malaysia (and English for some subjects); expatriate places are limited.' },
];

export const GUIDE = [
  { id: 'states', title: 'Choosing where to live', body: 'Klang Valley (Kuala Lumpur, Selangor) has the widest choice of international schools, hospitals and jobs. Penang offers island living, heritage and strong private healthcare. Johor Bahru is next to Singapore and has the Forest City Special Financial Zone. Melaka, Ipoh and Kota Kinabalu are quieter and cheaper. Visit before you buy.' },
  { id: 'cost', title: 'Cost of living', body: 'Housing, schools and cars are the biggest costs. Food and transport are affordable compared with most Western cities. Imported goods, alcohol and cars carry high taxes. Keep a 3–6 month buffer in a local account.' },
  { id: 'etiquette', title: 'Culture and etiquette', body: 'Malaysia is multi-ethnic (Malay, Chinese, Indian and indigenous communities). Remove shoes when entering homes and places of worship. Use your right hand to give and receive. Dress modestly at mosques and government offices. Public displays of affection are frowned upon.' },
  { id: 'holidays', title: 'Public holidays', body: 'Major holidays include Hari Raya Aidilfitri, Chinese New Year, Deepavali, Christmas, Wesak and National Day (31 August). Some holidays differ by state, and Islamic holiday dates move each year. Offices close; book travel early.' },
  { id: 'transport', title: 'Getting around', body: 'Klang Valley has LRT, MRT, monorail and KTM trains. Ride-hailing apps are widely used. A car is useful outside city centres. Toll roads use e-wallet or card payment. Drive on the left.' },
  { id: 'money', title: 'Money and banking', body: 'The currency is the Malaysian ringgit (RM / MYR). E-wallets and DuitNow QR payments are everywhere. Keep your MM2H fixed deposit in a licensed Malaysian bank and track the withdrawal rules.' },
  { id: 'health', title: 'Healthcare', body: 'Private hospitals are high quality and widely used by expatriates; insurance is strongly advised (and required for MM2H). Government clinics charge foreigners higher rates. Emergency number: 999.' },
  { id: 'language', title: 'Language', body: 'Bahasa Malaysia is the national language; English is widely spoken. Useful words: Terima kasih (thank you), Selamat pagi (good morning), Berapa? (how much?), Tolong (please / help).' },
  { id: 'weather', title: 'Weather', body: 'Hot and humid all year (around 24–34°C). Monsoon seasons bring heavy afternoon rain; the east coast is wettest from November to February. Haze can occur mid-year.' },
];

export const HOTSPOT_CATEGORIES = ['Living area', 'Family day out', 'Food', 'Nature', 'Shopping'];

export const HOTSPOTS = [
  { id: 'montkiara', name: 'Mont Kiara', state: 'Kuala Lumpur', cat: 'Living area', note: 'Popular expat enclave with condos and international schools nearby.' },
  { id: 'bangsar', name: 'Bangsar', state: 'Kuala Lumpur', cat: 'Living area', note: 'Leafy neighbourhood with cafés, bars and good access to the city.' },
  { id: 'desaparkcity', name: 'Desa ParkCity', state: 'Kuala Lumpur', cat: 'Living area', note: 'Planned township around a central park; very family-friendly.' },
  { id: 'klcc', name: 'KLCC Park & Petronas Twin Towers', state: 'Kuala Lumpur', cat: 'Family day out', note: 'Park, playground, fountains and the aquarium nearby.' },
  { id: 'batucaves', name: 'Batu Caves', state: 'Selangor', cat: 'Family day out', note: 'Hindu temple caves up 272 colourful steps. Dress modestly.' },
  { id: 'jalanalor', name: 'Jalan Alor', state: 'Kuala Lumpur', cat: 'Food', note: 'Famous evening street food strip in Bukit Bintang.' },
  { id: 'frim', name: 'FRIM Forest Research Institute', state: 'Selangor', cat: 'Nature', note: 'Rainforest trails and canopy walkway close to KL.' },
  { id: 'pavilion', name: 'Bukit Bintang malls', state: 'Kuala Lumpur', cat: 'Shopping', note: 'Main shopping district with large malls.' },
  { id: 'georgetown', name: 'George Town heritage zone', state: 'Penang', cat: 'Family day out', note: 'UNESCO heritage streets, street art and museums.' },
  { id: 'tanjungbungah', name: 'Tanjung Bungah', state: 'Penang', cat: 'Living area', note: 'Seaside condos popular with MM2H retirees.' },
  { id: 'penanghill', name: 'Penang Hill', state: 'Penang', cat: 'Nature', note: 'Funicular to cooler air and city views.' },
  { id: 'gurneydrive', name: 'Gurney Drive hawker centre', state: 'Penang', cat: 'Food', note: 'Classic Penang hawker food by the sea.' },
  { id: 'forestcity', name: 'Forest City', state: 'Johor', cat: 'Living area', note: 'Special Financial Zone development near Singapore.' },
  { id: 'legoland', name: 'Iskandar Puteri theme parks', state: 'Johor', cat: 'Family day out', note: 'Theme parks and attractions for children.' },
  { id: 'jonker', name: 'Jonker Street', state: 'Melaka', cat: 'Food', note: 'Weekend night market in historic Melaka.' },
  { id: 'ipoholdtown', name: 'Ipoh Old Town', state: 'Perak', cat: 'Food', note: 'White coffee, heritage cafés and limestone hills.' },
  { id: 'cameron', name: 'Cameron Highlands', state: 'Pahang', cat: 'Nature', note: 'Tea plantations and cool weather getaway.' },
  { id: 'langkawi', name: 'Langkawi', state: 'Kedah', cat: 'Nature', note: 'Duty-free island with beaches and the SkyCab.' },
  { id: 'kinabalu', name: 'Kinabalu Park', state: 'Sabah', cat: 'Nature', note: 'Home of Mount Kinabalu; UNESCO World Heritage Site.' },
  { id: 'kkwaterfront', name: 'Kota Kinabalu waterfront', state: 'Sabah', cat: 'Food', note: 'Seafood night market and sunset views.' },
];

export function mapsLink(h) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.state}, Malaysia`)}`;
}

/** Sample offers shown until real partner offers are connected. Clearly labelled as samples in the app. */
export const SAMPLE_COUPONS = [
  { id: 'sample-health', title: 'Health screening 10% off', merchant: 'Partner clinic (sample)', code: 'WELCOME10', note: 'Sample offer — partner offers coming soon.' },
  { id: 'sample-move', title: 'Free moving quote', merchant: 'Partner movers (sample)', code: 'MOVEMY', note: 'Sample offer — partner offers coming soon.' },
  { id: 'sample-school', title: 'School tour priority booking', merchant: 'Partner school (sample)', code: 'TOURMY', note: 'Sample offer — partner offers coming soon.' },
];

export const OFFICIAL_CONTACTS = [
  { name: 'Emergency (police, ambulance, fire)', category: 'Emergency', phone: '999' },
  { name: 'Emergency from mobile', category: 'Emergency', phone: '112' },
  { name: 'MM2H official portal', category: 'Government', url: 'https://www.mm2h.gov.my/' },
  { name: 'Immigration Department of Malaysia', category: 'Government', url: OFFICIAL_IMMIGRATION },
  { name: 'Ministry of Tourism, Arts and Culture (MOTAC)', category: 'Government', url: OFFICIAL_MOTAC },
];

export const CONTACT_CATEGORIES = ['Agent', 'Lawyer', 'Bank', 'Mover', 'Clinic', 'School', 'Property', 'Other'];

/** Offline Buddy knowledge: keywords → answer + where to go in the app. */
export const KNOWLEDGE = [
  { k: ['silver', 'gold', 'platinum', 'tier', 'category', 'which'], a: 'MM2H has Silver, Gold and Platinum tiers, plus SEZ/SFZ for special zones. They differ mainly by fixed deposit, minimum property price and pass length. See the tier table in the Application Tracker, and confirm figures on mm2h.gov.my.', go: 'tracker' },
  { k: ['fixed deposit', 'fd', 'deposit', 'withdraw', 'withdrawal'], a: 'After approval you may withdraw up to 50% of the principal\'s fixed deposit for residence, education, medical or tourism. The Fixed Deposit & Finance menu tracks how much you can still withdraw.', go: 'finance' },
  { k: ['property', 'house', 'home', 'buy', 'rent', 'residence', 'condo'], a: 'Buying a residence is compulsory after approval, at or above your tier\'s minimum price, and it cannot be sold for 10 years except to upgrade. Use the Housing menu to shortlist homes.', go: 'housing' },
  { k: ['stay', '90', 'days', 'minimum stay'], a: 'Principals under 50 must stay at least 90 days a year in Malaysia (cumulative). Log trips as tasks to keep track.', go: 'tasks' },
  { k: ['dependant', 'dependent', 'child', 'children', 'spouse', 'parent', 'maid', 'family'], a: 'Dependants can include your spouse, children under 21 (21–34 if single and unemployed), disabled children and parents or parents-in-law. Add each person under Family Members.', go: 'family' },
  { k: ['renew', 'renewal', 'expire', 'expiry', 'passport'], a: 'Your pass is tied to passport validity. Add passport and pass expiry dates under Family Members and the app warns you 60 days ahead on Welcome Home and in Renewals.', go: 'renewals' },
  { k: ['school', 'education', 'igcse', 'ib', 'curriculum'], a: 'International schools follow British, IB, American or Australian curricula. Shortlist schools with fees and deadlines in Schools & Education.', go: 'schools' },
  { k: ['hospital', 'clinic', 'doctor', 'insurance', 'medical', 'health'], a: 'Private hospitals are widely used by expatriates and health insurance is required for MM2H. Keep providers and policy renewal dates in Healthcare & Insurance. Emergency: 999.', go: 'health' },
  { k: ['emergency', 'police', 'ambulance', '999'], a: 'In an emergency call 999 (or 112 from a mobile).', go: 'directory' },
  { k: ['sim', 'phone', 'bank account', 'licence', 'license', 'driving', 'utilities'], a: 'Your first weeks: SIM card, bank account, utilities, driving licence and a clinic. The Settling In Checklist walks you through each one.', go: 'settle' },
  { k: ['agent', 'apply', 'application', 'submit', 'document'], a: 'MM2H applications go through a MOTAC-licensed agent (or directly where allowed). Follow each step in the Application Tracker and tick off your documents checklist.', go: 'tracker' },
  { k: ['weather', 'rain', 'monsoon', 'haze'], a: 'Hot and humid all year, around 24–34°C, with heavy afternoon rain in monsoon season. See Local Life Guide → Weather.', go: 'guide' },
  { k: ['coupon', 'discount', 'offer', 'deal'], a: 'Your Coupons wallet keeps welcome offers and codes, and warns you before they expire.', go: 'coupons' },
  { k: ['news', 'latest', 'update'], a: 'The News menu shows the latest MM2H and Malaysia headlines when you are online.', go: 'news' },
  { k: ['where', 'live', 'area', 'penang', 'kl', 'kuala lumpur', 'johor', 'hotspot', 'visit'], a: 'Popular choices are Kuala Lumpur (Mont Kiara, Bangsar), Penang and Johor Bahru. Browse places by state in Hotspots and read Local Life Guide → Choosing where to live.', go: 'hotspots' },
];

export function answer(question) {
  const q = ` ${String(question || '').toLowerCase()} `;
  let best = null, bestScore = 0;
  for (const item of KNOWLEDGE) {
    const score = item.k.reduce((n, k) => n + (q.includes(k) ? k.length : 0), 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  if (!best) {
    return { a: 'I don\'t have an offline answer for that yet. Try asking about tiers, fixed deposit, property, renewals, schools, healthcare or settling in — or ask your licensed MM2H agent.', go: null };
  }
  return { a: best.a, go: best.go };
}
