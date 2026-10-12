"""Builds the Property Explorer master document (.docx) for upload to Google Drive."""
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import os

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
ACCENT = RGBColor(0x1D, 0x5C, 0x88)
MUTED = RGBColor(0x5A, 0x67, 0x74)

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
for side in ("left_margin", "right_margin"):
    setattr(sec, side, Cm(2))
sec.top_margin = sec.bottom_margin = Cm(2)

st = doc.styles["Normal"]
st.font.name = "Arial"
st.font.size = Pt(10.5)
for name, size in (("Heading 1", 18), ("Heading 2", 14), ("Heading 3", 12)):
    s = doc.styles[name]
    s.font.name = "Arial"
    s.font.size = Pt(size)
    s.font.color.rgb = ACCENT if name != "Heading 3" else RGBColor(0x16, 0x21, 0x2B)


def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def h(text, level):
    doc.add_heading(text, level=level)


def p(text, bold_lead=None, italic=False, color=None, size=None):
    para = doc.add_paragraph()
    if bold_lead:
        r = para.add_run(bold_lead + " ")
        r.bold = True
    r = para.add_run(text)
    r.italic = italic
    if color:
        r.font.color.rgb = color
    if size:
        r.font.size = Pt(size)
    return para


def bullets(items):
    for it in items:
        para = doc.add_paragraph(style="List Bullet")
        if isinstance(it, tuple):
            r = para.add_run(it[0] + " ")
            r.bold = True
            para.add_run(it[1])
        else:
            para.add_run(it)


def numbered(items):
    for it in items:
        para = doc.add_paragraph(style="List Number")
        if isinstance(it, tuple):
            r = para.add_run(it[0] + " ")
            r.bold = True
            para.add_run(it[1])
        else:
            para.add_run(it)


def table(header, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    for i, txt in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        r = c.paragraphs[0].add_run(txt)
        r.bold = True
        r.font.size = Pt(9.5)
        shade(c, "DCE8F1")
    for row in rows:
        cells = t.add_row().cells
        for i, txt in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(txt))
            r.font.size = Pt(9.5)
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph()
    return t


def image(name, caption, width_cm=7.2):
    doc.add_picture(os.path.join(IMG, name), width=Cm(width_cm))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    cp = doc.add_paragraph()
    cp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = cp.add_run(caption)
    r.font.size = Pt(9.5)
    r.font.color.rgb = MUTED


# ------------------------------------------------------------------ Title
t = doc.add_paragraph()
r = t.add_run("Property Explorer")
r.bold = True
r.font.size = Pt(28)
r.font.color.rgb = ACCENT
p("Master project document: plan, features, wireframes, database schema, decisions, milestones and updates.", size=12)
p("Document version 1A · created 11 Oct 2026 · maintained by Claude for the project owner.", color=MUTED)
p("Status: design review. No application code has been written yet. Everything below is a proposal awaiting the owner's approval unless marked Confirmed.", bold_lead="Current status.")

h("How to use this document", 2)
bullets([
    "This is the single source of truth for Property Explorer. Claude updates this same document (same link) as decisions are made and work progresses.",
    "Section 12 (Updates log) lists every change by date and version.",
    "Reviewers (including other AI assistants such as ChatGPT) can read it directly from its Google Docs link. Wireframes are included as images, each with a written description so the content is reviewable as text.",
    "Labels: Confirmed = stated by the owner. For approval = Claude's proposal. Open = needs the owner's decision.",
])

h("Contents", 2)
numbered([
    "Product summary", "Decisions log", "Features by module", "Wireframes",
    "GPS on Samsung S23 Ultra", "Technology stack", "Database design",
    "Full vision coverage", "Milestones", "Milestone 1 acceptance tests",
    "Open questions", "Updates log", "Appendix A: schema.sql",
])

# ------------------------------------------------------------------ 1
h("1. Product summary", 1)
p("Property Explorer is a private working tool for a Malaysian property negotiator working mainly in Nilai and Sepang. It turns time spent driving through industrial and residential areas into a property database the owner controls, and connects that database to the owners, buyers and deals that earn commission.")
p("It combines four systems in one connected database:")
bullets([
    ("Property business management:", "properties, vendors, buyers, leads, opportunities, follow-ups, tasks, calendar and deals."),
    ("GPS property exploration:", "record routes, show explored roads in red, discover properties and record their exact locations and photos."),
    ("Property intelligence and comparison:", "neighbouring and side-by-side units, individual availability with verification dates, combined totals for buyers who need adjoining units."),
    ("AI and business assistance:", "Ask Expert specialists (with clear disclaimers) and message templates in English, Bahasa Malaysia, Chinese and Tamil."),
])
p("It is not a generic listing website. The combination of road exploration, field discovery, neighbouring-unit intelligence and a connected CRM is the core of the product.")

h("Proposed improvements (for approval)", 3)
bullets([
    ("One contact list.", "The same person may be an owner on one deal and a buyer on another. A single Contacts table with roles avoids duplicates; Vendor and Buyer buttons are filtered views."),
    ("Availability goes stale.", "Every availability change is logged with source and date. After a configurable period (default 30 days) an 'Available' unit is shown as 'Needs re-check'."),
    ("Duplicate warning.", "Adding a property within about 30 m of an existing pin, or with a matching unit number on the same street, shows the existing record first."),
    ("Photo inbox.", "Photos taken before a record exists wait in an Unassigned inbox and can be attached to the nearest property later."),
    ("Malaysian fields.", "Tenure and lease expiry, land status (e.g. Bumi lot, Malay reserve), title type and number, RM per sq ft, acres, SPA and tenancy dates, SST on commission."),
    ("Driving safety.", "Recording is hands-free; property entry is designed for when parked. One tap drops a pin and saves a draft."),
    ("Personal data.", "Contact details fall under Malaysia's Personal Data Protection Act 2010; the design keeps them access-controlled and records when a PDPA notice was given."),
])

# ------------------------------------------------------------------ 2
h("2. Decisions log", 1)
table(["#", "Topic", "Decision", "Status"], [
    ["D1", "Phone", "Samsung Galaxy S23 Ultra (Android). iPhone not needed for now.", "Confirmed"],
    ["D2", "Background GPS", "Must eventually record with screen off and Waze open. Treated as unverified until tests G1–G8 pass on the owner's phone.", "Confirmed"],
    ["D3", "Working areas", "Nilai and Sepang first.", "Confirmed"],
    ["D4", "Project document (Version 1A)", "One 'Property Explorer' Google Doc in the owner's Google Drive holds the plan, features, wireframes, schema, decisions, milestones and updates, and is kept up to date by Claude.", "Confirmed"],
    ["D5", "App type", "Native Android app (Capacitor) for the phone; the same app runs in a browser on the computer. Replaces the earlier 'web app first' plan because only a native app can record with the screen off.", "For approval"],
    ["D6", "Maps", "OpenStreetMap maps via OpenFreeMap (free, no key). Google Maps and Waze for navigation hand-off only.", "For approval"],
    ["D7", "Backend", "Supabase (PostgreSQL + PostGIS, login, photo storage), Singapore region.", "For approval"],
    ["D8", "Contacts", "One contact list with roles; Vendor and Buyer are filtered views.", "For approval"],
    ["D9", "Home buttons 9–12", "Configurable placeholders until labels are confirmed from the owner's notes.", "Open"],
    ["D10", "Solo or team; commission split; data import", "Not yet answered; design supports all options.", "Open"],
], widths=[1.0, 3.2, 10.0, 2.6])

# ------------------------------------------------------------------ 3
h("3. Features by module", 1)
p("Home screen: 12 buttons in a 3 × 4 grid. Eight labels confirmed; four to be confirmed. Labels, icons, order and targets are stored in settings so they can change without redesign. The home screen also shows follow-ups due, viewings today, units needing re-check and exploration this week.")
mods = [
    ("To-Do", "Create, edit, complete, delete tasks; deadlines, priorities, reminders; link to property, owner, buyer or deal; pending, completed, overdue; today view. Follow-ups are tasks of kind 'follow-up'."),
    ("Calendar", "Viewings, site visits, meetings, follow-up appointments, deal deadlines; day, week and month views; linked to properties and contacts; reminders."),
    ("Opportunities", "Potential business; buyer–property matching; stage and next action; estimated value and commission; notes, history and reminders."),
    ("Property", "All property types (landed, condo, shoplot, office, factory, industrial land, agricultural land, development land, more later) with type-specific fields, map location, prices, areas, tenure, specs, photos, documents, availability with history, owners, viewings, neighbours, related buyers and opportunities."),
    ("Vendor", "Owners, landlords and sellers: contact details, preferred channel and language, properties owned or represented, terms, instructions, contact history, follow-ups."),
    ("Buyer", "Buyers, tenants and investors: requirements (type, areas, budget, sizes, adjoining units needed, specs, financing readiness), follow-ups, matched properties, opportunities."),
    ("GPS Assistance", "Map with current location, Start / Pause / Stop recording, explored roads in red, property pins and clusters, nearby list, filters, add property from location, exploration history and progress, Google Maps / Waze hand-off."),
    ("Ask Expert", "Lawyer, Banker, Financial Advisor, Tax Adviser, Accountant, Property Valuer, Wealth Planner and Agent AI. Each answer is labelled with the specialist and a disclaimer that it is general guidance, not professional advice."),
    ("Buttons 9–12", "To be confirmed."),
]
table(["Module", "What it does"], mods, widths=[3.2, 13.6])
p("Cross-cutting: neighbouring-unit groups and comparison, search and filters on list and map, leads, matching, deals and commission (estimated, confirmed, received; configurable rates), message templates in EN / BM / ZH / TA with placeholders for WhatsApp, offline saving with sync, privacy and backups.")

# ------------------------------------------------------------------ 4
h("4. Wireframes", 1)
p("Phone layouts at real proportions. Names, prices and owners are example data, not the owner's records. The same layouts adapt to a wider desktop screen.", italic=True)

wf = [
    ("home.jpg", "4.1 Home dashboard",
     "Exactly 3 columns × 4 rows of buttons: To-Do, Calendar, Opportunities, Property, Vendor, Buyer, GPS Assistance (highlighted), Ask Expert, and Buttons 9–12 shown dashed as 'label to confirm'. Above the grid: summary strip (follow-ups due, units needing re-check, km explored this week). Each tile shows a live count. Below: a large 'Start exploring' button."),
    ("gps.jpg", "4.2 GPS exploration map",
     "Full-screen map. Top: recording status pill (Recording / Paused / Off, distance) and filter chips (Factory, Shoplot, Land, Available, more). Map layers: blue dot = current location; dashed blue line = today's raw GPS route; solid red = roads already explored (matched or manually marked), kept across sessions; pins coloured green (available), amber (unknown or needs check), grey (unavailable); numbered circles = clusters. Bottom sheet: nearby properties sorted by distance, session totals, and buttons 'Add property here', Pause, Stop."),
    ("property.jpg", "4.3 Property details",
     "Photo mosaic with cover photo and count. Title with property type and unit number (e.g. 'Semi-D Factory · Unit 7 (Lot 2/14)') and address. Availability badge with who verified it and when. Tabs: Details, Photos, Owner, Neighbours, History. Key-figure grid (asking price, land, built-up, RM psf, ceiling height, power) that changes by property type. Owner card with Call and WhatsApp. Row strip showing this unit's position among neighbours with each unit's own status. Notes. Bottom actions: Navigate, Message, Add follow-up."),
    ("compare.jpg", "4.4 Neighbouring-unit comparison",
     "Row strip in real order; tap units to select (units 6 and 7 selected). Line listing available side-by-side pairs. Comparison grid: Unit 6, Unit 7 and Combined for status, last verified, asking price, land, built-up, RM psf, power (not summed), owner, marketed together or separately. Totals shown only when every unit has the figure; RM psf recalculated from totals. Box showing buyer requirements this pair fits (e.g. needs 2 adjoining factories, land ≥ 15,000 sq ft, budget ≤ RM 6.5m). Buttons: Share summary, Create opportunity."),
    ("search.jpg", "4.5a Property search results",
     "Search box covering unit, street, lot, owner and reference; Filters button with count. List / Map toggle that keeps the same filters. Active filters as removable chips. Result count and sort (nearest, price, last verified). Result cards: thumbnail, unit and type, street, availability pill, price and RM psf, last verified date."),
    ("filters.jpg", "4.5b Filters",
     "Property type chips (all categories), area chips (Nilai, Sepang, Salak Tinggi, draw on map), availability chips, toggles 'Only verified in last 30 days' and 'Adjacent available units ≥ 2', ranges for asking price, land area and built-up area, and more filters (sale / rent, tenure, vendor, group / row, updated since, ceiling / power). Button 'Show N properties'."),
]
for i, (img, title, desc) in enumerate(wf):
    h(title, 2)
    p(desc)
    image(img, "Wireframe: " + title)
    if i < len(wf) - 1:
        doc.add_page_break()

# ------------------------------------------------------------------ 5
doc.add_page_break()
h("5. GPS on Samsung S23 Ultra", 1)
p("Status: NOT VERIFIED. Android allows this kind of recording, but Samsung's battery management is known to stop background apps. Background tracking will not be described as working until it passes tests G1–G8 on the owner's phone.", bold_lead="Important.")
image("gps_pipeline.jpg", "Recording pipeline: Start → foreground service with notification → Android location updates → on-phone database → upload → road matching (red roads, Milestone 2).", width_cm=16.5)
h("Implementation", 3)
bullets([
    ("Foreground location service.", "Tapping Start launches an Android foreground service of type 'location'. Android requires a permanent notification while it runs, which doubles as the privacy guarantee: no notification, no recording. The notification has Pause and Stop."),
    ("Native recorder.", "The screens use web technology inside a native shell (Capacitor). The recorder is a small native Kotlin component that writes each point straight to an on-phone database, because Android pauses the web layer when the screen is off. Points upload when the app is reopened and data is available; uploads never duplicate points."),
    ("Same GPS as Waze.", "Both apps read Android's shared fused location provider, so Waze running does not take GPS away. Each point stores time, position, accuracy, speed, heading and whether the screen was on or off."),
    ("Never on by itself.", "Recording starts only from Start. No auto-start on reboot or motion. After a restart the session is marked 'interrupted' and the app says so on next open."),
    ("Weak signal and battery.", "Points worse than about 40 m accuracy are kept but excluded from road matching. Gaps stay gaps. Sampling about every 3 s or 10 m. A car charger is recommended; battery drain is measured in testing."),
])
h("Permissions and Samsung settings", 3)
bullets([
    "Location: Precise, 'While using the app' (enough for a service the user starts). 'Allow all the time' requested only if testing shows it is needed.",
    "Notifications: Allow. Camera and photos: for property photos.",
    "Settings → Apps → Property Explorer → Battery → Unrestricted.",
    "Settings → Battery → Background usage limits → Never sleeping apps → add Property Explorer.",
    "The app checks these settings and warns if they would stop recording.",
])
h("Test plan: GPS Test app first", 3)
p("Before the full Milestone 1, Claude builds a small GPS Test app (Start, Pause, Stop, notification, map of the route with a gap report, export). The owner drives in Nilai or Sepang. Background tracking is marked verified only after G1–G6 pass on two separate drives.")
table(["Test", "What to do", "Pass when"], [
    ["G1", "Drive 15 min with the app on screen.", "Continuous route; median accuracy 10 m or better."],
    ["G2", "Start, lock the phone (screen off), drive 30 min.", "Points in ≥95% of driving minutes; no gap over 60 s except known blackspots (covered car parks, tunnels)."],
    ["G3", "Start, then navigate with Waze in front for 30 min.", "Same as G2; Waze works normally."],
    ["G4", "As G2 with Power saving mode on.", "Same as G2, or the app clearly warns that power saving stopped it."],
    ["G5", "Mobile data off for 10 min of driving, then on.", "All offline points upload once; none duplicated."],
    ["G6", "Pause 5 min, resume, then Stop.", "No points while paused or after Stop; notification disappears on Stop."],
    ["G7", "Swipe app away from Recent apps while recording.", "Recording continues, or the interruption is reported on reopening. Silent data loss is a fail."],
    ["G8", "Restart the phone mid-session.", "No silent resume; session shown as interrupted."],
], widths=[1.2, 6.6, 9.0])
p("If tests fail: (1) adjust Samsung settings and recorder; (2) switch to a proven commercial background-location plugin (paid licence for Android; price shown to the owner before any purchase); (3) last resort, screen-on mode with the phone mounted.")

# ------------------------------------------------------------------ 6
h("6. Technology stack", 1)
table(["Layer", "Choice", "Trade-off / cost"], [
    ["Phone app", "Capacitor native Android app; screens in React + TypeScript", "Installed by APK link (no Play Store needed for own use)."],
    ["Desktop", "Same app in Chrome", "Everything except route recording."],
    ["GPS recorder", "Native Kotlin foreground service + on-phone database", "Must pass G1–G8 on the S23 Ultra."],
    ["Maps", "MapLibre with OpenFreeMap (OpenStreetMap data)", "Free, no key, no usage limits stated, but no service guarantee; self-hosting or MapTiler as backup."],
    ["Navigation", "Hand-off links to Google Maps and Waze", "Free."],
    ["Backend", "Supabase: PostgreSQL + PostGIS, login, private photo storage, row-level security; Singapore region", "Free plan for building and testing (500 MB database, 1 GB files, pauses after 1 week inactive, no automatic backups). Pro plan from US$25/month with daily backups before relying on it daily."],
    ["Offline", "On-device database with upload queue; IDs created on the phone", "Latest edit wins, with full history."],
    ["Photos", "Compressed on phone (~400 KB + thumbnail)", "About 2,500 photos per GB."],
    ["Road matching", "OpenStreetMap roads for Nilai and Sepang imported into PostGIS; GPS tracks matched after each session (Milestone 2)", "Thresholds tuned on real drives."],
    ["Ask Expert AI", "Claude via the Anthropic API, called from the server (Milestone 5)", "Needs an API account with pay-per-use billing."],
    ["Build and hosting", "Private GitHub repository; GitHub Actions builds the APK and web version; free web hosting (Cloudflare Pages or Netlify)", "Free."],
], widths=[2.8, 7.2, 6.8])

# ------------------------------------------------------------------ 7
h("7. Database design", 1)
p("PostgreSQL with PostGIS on Supabase. 39 tables and 122 foreign-key links, defined in schema.sql (Appendix A). Checked by loading into a PostgreSQL 16 test server: builds without errors; a back-dated availability entry does not overwrite a newer one; the same pair of neighbouring units cannot be stored twice. Not yet applied to any live database.")
h("Connection checklist", 3)
table(["Item", "Tables", "Connected to"], [
    ["Properties", "properties", "Site, category and type-specific fields, discovering session, photos, contacts, availability history, groups, neighbours, opportunities, deals, tasks, events, activities."],
    ["Photos", "property_photos", "One property (or Unassigned inbox), session, GPS position; one photo is the cover."],
    ["Owners", "contacts, contact_roles, property_contacts", "Contact with owner role linked to many properties, each link with terms and instructions; a property can have several contacts."],
    ["Buyers", "contacts, contact_roles", "Same contact list with buyer role; no duplicate people."],
    ["Buyer requirements", "buyer_requirements, matches", "Belong to a buyer (several per buyer); include adjoining units needed; matches point to one property or a group of adjoining units."],
    ["Availability history", "availability_log", "Every change per property with source and verified flag; current status set automatically from the latest entry."],
    ["Neighbouring units", "property_groups, property_group_members, property_adjacency", "Ordered units in a row, building or development; physical adjacency (manual or suggested, with confirmation)."],
    ["GPS tracks", "exploration_sessions, gps_points", "Raw points per session, never edited; properties and photos remember their session."],
    ["Explored roads", "road_segments, road_coverage, road_coverage_events", "Nilai and Sepang road map; one coverage row per segment (no duplicates on re-drive); every match or manual correction logged."],
    ["Leads", "leads", "Contact, optional property or requirement, source, status, next follow-up."],
    ["Follow-ups", "tasks (kind = follow_up), activities", "Linked to property, contact, lead, opportunity, deal or event; one activity timeline."],
    ["Calendar appointments", "calendar_events, event_attendees, viewings", "Linked to property, contact, lead, opportunity, deal; one viewing can cover several units."],
    ["Deals", "deals, deal_properties", "From an opportunity; buyer, vendor, properties or group; booking, SPA, loan, completion or tenancy dates."],
    ["Commissions", "commissions", "One or more per deal; rate or fixed, SST, negotiator share, status estimated → confirmed → invoiced → received."],
], widths=[3.0, 4.6, 9.2])
h("All tables", 3)
table(["Group", "Tables"], [
    ["Users and settings", "workspaces, workspace_members, workspace_settings, home_tiles"],
    ["Places", "sites (industrial parks, tamans, buildings, streets, with optional boundary)"],
    ["Property types", "property_categories, property_type_fields"],
    ["Properties", "properties, property_contacts, availability_log, property_photos, documents"],
    ["Neighbours", "property_groups, property_group_members, property_adjacency"],
    ["People", "contacts, contact_roles, buyer_requirements, leads, matches"],
    ["Business", "opportunities, opportunity_properties, deals, deal_properties, commissions"],
    ["Schedule and history", "calendar_events, event_attendees, viewings, tasks, activities"],
    ["Exploration", "exploration_sessions, gps_points, road_segments, road_coverage, road_coverage_events"],
    ["Communication and AI", "message_templates, expert_profiles, expert_conversations, expert_messages"],
], widths=[4.0, 12.8])
h("Built in from the start", 3)
bullets([
    ("Privacy:", "every business table carries a workspace; row-level security returns records only to that workspace's members. Ready for a team later."),
    ("Offline-safe IDs:", "created on the phone, so offline records never clash."),
    ("Recovery:", "deletes go to 'Recently deleted' and can be restored."),
    ("Audit:", "availability, road coverage and activities keep full history."),
])

# ------------------------------------------------------------------ 8
h("8. Full vision coverage", 1)
p("Every feature in the brief has a place in the architecture now, even when its screens are built later.")
table(["Feature", "Ready in architecture", "Screens in"], [
    ["12-button home", "home_tiles", "M1"],
    ["Property records, all types", "properties, categories, type fields", "M1"],
    ["Photos per property, inbox", "property_photos, private storage", "M1"],
    ["Vendors and buyers", "contacts, roles, links, requirements", "M1"],
    ["Search and filters, list + map", "indexes on location, type, availability", "M1"],
    ["Background route recording", "native recorder, sessions, gps_points", "M1 (after G-tests pass)"],
    ["Explored roads in red, manual marking, corrections", "road_segments, road_coverage, events", "M2"],
    ["Exploration progress, areas completed", "session totals, sites with boundaries", "M2"],
    ["Groups, adjacency, comparison, adjacent filter", "groups, members, adjacency, matches", "M3"],
    ["To-Do, follow-ups, Calendar, viewings", "tasks, calendar_events, viewings, activities", "M4"],
    ["Leads, opportunities, matching", "leads, opportunities, matches", "M4"],
    ["Deals and commission", "deals, deal_properties, commissions, settings", "M4"],
    ["Message templates EN / BM / ZH / TA", "message_templates", "M5"],
    ["Ask Expert (8 specialists)", "expert_profiles, conversations, messages", "M5"],
    ["Team access", "workspaces, members, row-level security", "When needed"],
], widths=[6.4, 7.4, 3.0])

# ------------------------------------------------------------------ 9
h("9. Milestones", 1)
table(["Milestone", "Content", "Status"], [
    ["M1 – GPS test", "Small Android test app proving screen-off recording with Waze open on the S23 Ultra (tests G1–G8).", "Awaiting approval"],
    ["M1 – Field Capture", "Login and private workspace; 12-tile home; Property, Vendor, Buyer, GPS Assistance working; route recording (as verified); add property from location with photos, unit no., availability, draft and duplicate warning; type-specific fields; photo inbox; contacts and buyer requirements; search and filters on list and map; offline with sync; desktop browser version; Recently deleted.", "Awaiting approval"],
    ["M2 – Explored roads", "Road data for Nilai and Sepang; matching to red roads; manual marking and corrections; session review; progress statistics and areas.", "Planned"],
    ["M3 – Neighbours", "Groups and rows, adjacency, comparison screen, adjacent-available filter, combined totals.", "Planned"],
    ["M4 – Business workflow", "To-Do, Calendar, viewings, leads, opportunities, matching, deals, commission.", "Planned"],
    ["M5 – Communication and AI", "Multilingual templates for WhatsApp; Ask Expert.", "Planned"],
    ["M6 – Testing and improvement", "Realistic end-to-end scenarios, security review, backups.", "Planned"],
], widths=[3.6, 10.2, 3.0])
h("How Milestone 1 will be run", 3)
numbered([
    ("Code:", "in a private GitHub repository owned by the project owner. GitHub's free build service produces the Android APK and the desktop web version, so no developer tools are needed on the owner's computer."),
    ("Phone:", "open the download link on the S23 Ultra, allow Chrome to install unknown apps once, install, sign in, grant permissions and set the Samsung battery settings."),
    ("Computer:", "open the web address in Chrome and sign in with the same account."),
    ("Optional:", "build on the owner's computer with Node.js and Android Studio, with step-by-step instructions."),
])
h("What the owner must set up", 3)
table(["Item", "Why", "Cost"], [
    ["GitHub account + private repository, connected to Claude", "Holds code; builds the APK", "Free"],
    ["Supabase account and project (Singapore)", "Database, login, photo storage; two keys pasted into GitHub secrets", "Free for building and testing; Pro from US$25/month before daily reliance"],
    ["Free web hosting (Cloudflare Pages or Netlify)", "Desktop web address", "Free"],
    ["Samsung settings and permissions", "Background recording", "Free"],
    ["Maps", "OpenFreeMap needs no account", "Free"],
], widths=[6.0, 6.8, 4.0])

# ------------------------------------------------------------------ 10
h("10. Milestone 1 acceptance tests", 1)
p("GPS tests G1–G8 (section 5) come first. Results are reported at one of three levels: visual prototype, working, or tested on the owner's phone.")
table(["Test", "Steps", "Pass when"], [
    ["A1", "Install on S23 Ultra; sign in; sign in on computer.", "Both open the same workspace."],
    ["A2", "Open the home buttons; rename button 9 in settings.", "3 × 4 grid; live modules open; others show planned milestone; rename appears."],
    ["A3", "Add three neighbouring factories from the map, each with its own unit no. and 2 photos.", "Three records, correct pins, each with only its own photos."],
    ["A4", "Set one available (verified, owner call), one unknown, one sold.", "Pins green, amber, grey; history shows entry and source."],
    ["A5", "Add a fourth property on the same spot.", "Warning shows existing nearby records first."],
    ["A6", "Take 2 photos into the inbox; attach later.", "Photos move to the chosen property; inbox empty."],
    ["A7", "Close the app mid-entry; reopen.", "Draft still there."],
    ["A8", "Mobile data off; add property with photos; data on.", "Appears on computer within a minute, once only."],
    ["A9", "Create an owner linked to two units; create a buyer with a requirement.", "Owner page lists both units; units show owner; buyer under Buyer not Vendor."],
    ["A10", "Search 'Unit 7'; filter Factory + Available + verified in 30 days.", "Correct results on list and map; filters kept when switching."],
    ["A11", "Navigate with Waze, then Google Maps.", "Each opens at the right location; recording continues."],
    ["A12", "Record 20 min with screen off and Waze open; stop; reopen.", "Route in Sessions with distance; properties added are linked to the session."],
    ["A13", "Delete a property; restore it.", "Returns with photos, owner link, history."],
    ["A14", "Sign in with a second test account.", "Sees none of the owner's data."],
    ["A15", "Add a back-dated 'available' after a newer 'sold'.", "Property stays sold; older entry only in history."],
], widths=[1.2, 7.8, 7.8])

# ------------------------------------------------------------------ 11
h("11. Open questions", 1)
numbered([
    ("Screens:", "do the six wireframes look right? Anything to move, add or remove?"),
    ("GPS plan:", "approve the native Android approach, tests G1–G8 and the fallback order?"),
    ("Database:", "approve the schema (checklist in section 7)?"),
    ("Accounts:", "can the owner set up GitHub and Supabase (about 30 minutes with instructions)?"),
    ("Home buttons 9–12:", "labels from the owner's handwritten notes."),
    ("Users:", "just the owner, or a team / agency later?"),
    ("Commission:", "agency total and negotiator share recorded separately? SST applied?"),
    ("Import:", "any existing spreadsheets or contact lists to import?"),
])

# ------------------------------------------------------------------ 12
h("12. Updates log", 1)
table(["Date", "Version", "Change"], [
    ["10 Oct 2026", "Brief", "Owner's master project brief received."],
    ["10 Oct 2026", "Blueprint v1", "Product understanding, feature map, first wireframes, data model, stack (web app first), open questions, first milestone."],
    ["11 Oct 2026", "Blueprint v2", "Owner confirmed Samsung S23 Ultra, background GPS with screen off and Waze, Nilai and Sepang. Stack changed to native Android (Capacitor). Six wireframes, GPS test plan G1–G8, complete schema (39 tables) checked on PostgreSQL 16, Milestone 1 scope and tests A1–A15."],
    ["11 Oct 2026", "Version 1A", "Owner instruction: create and maintain a single 'Property Explorer' document in Google Drive, reviewable by ChatGPT without screenshots. This document created."],
], widths=[2.6, 2.8, 11.4])

# ------------------------------------------------------------------ Appendix
doc.add_page_break()
h("Appendix A: schema.sql", 1)
p("Complete database definition (review draft v1). PostgreSQL 15+ with PostGIS on Supabase.", italic=True)
with open(os.path.join(HERE, "schema.sql"), encoding="utf-8") as f:
    sql = f.read()
for line in sql.splitlines():
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(0)
    para.paragraph_format.space_before = Pt(0)
    r = para.add_run(line if line else " ")
    r.font.name = "Courier New"
    r.font.size = Pt(8)

out = os.path.join(HERE, "Property_Explorer.docx")
doc.save(out)
print(out, os.path.getsize(out))
