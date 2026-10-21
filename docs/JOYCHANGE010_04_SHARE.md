# JoyChange010-04 — Share into the app, Shared Documents, move documents between folders

Branch `joychange006`. Asked by Joe on 21 Oct 2026 (screenshot: the Android share sheet over a land title photo in WhatsApp).
Joe confirmed: everything happens inside the app (no Dropbox).

## What the agent gets
- **Share list (Android):** in WhatsApp or any app, Share on a photo or document shows **"Estate Agent AI Buddy Document
  Upload"** (Malay phone: "Muat Naik Dokumen Estate Agent AI Buddy"; Chinese phone: "Estate Agent AI Buddy 文件上传") with
  the app's icon. Pictures and documents (PDF, Word, Excel, ...) only; up to 20 files at a time, 50 MB each.
- **Shared Documents** (button under "Add New Property" on the Subsale / Property List, with the number waiting): the
  shared files arrive here and this screen opens by itself with "n files arrived". Each file: name, size, date added,
  **Open**, **Move to property**, **Delete** (asks first).
- **Move to property:** pick the property from the searchable property list (photo, ID, address), pick the folder — a first
  guess from the file name (e.g. "geran" → Title documents, "floor plan" → Floor plans), changeable — then **Move**. The
  file becomes an ordinary document of that property (synced, backed up, in its history) and leaves the tray.
- **Move between folders:** every document row has a "Move to folder" pick list, in the property form's Documents section
  (saved with the form) and on the property page (saved at once): Title documents, Brochures, Floor plans, Owner
  correspondence, Rental or sales documents, Other documents. 🔒 marks the confidential folders.

## Rules kept
- Confidential folders: since 010-05 every file goes to the cloud and the database decides from the folder who may read it,
  so moving a document only changes its folder (the earlier "private copy" step was removed).
- Only properties the agent may edit are offered (own ones, and shared ones with edit rights); archived ones are not.
  Permission is checked again at the moment of moving.
- Booking / Sale / Rental page files (`dealKey`) keep their place (no folder pick list on them).
- Only `content://` shares are accepted by the phone (never raw file paths); copies are made in the app's private cache and
  deleted once read.

## Files
- `app/src/share/inbox.ts` (tray, move, folder move), `app/src/share/SharedDocsUI.tsx` (screen), `app/src/share/strings.ts`
  (EN / BM / ZH), `app/src/native/share.ts` (phone bridge), `app/src/data/types.ts` (`meta.sharedInbox`).
- Android: `app/scripts/android-setup.mjs` — activity-alias `.EabShareTarget` with SEND / SEND_MULTIPLE filters, label in
  `res/values{,-ms,-zh}/eab_share.xml`, plugin `EabSharePlugin.java` registered in MainActivity.
- Screens: `App.tsx` (route `sharedDocs`, opens on arrival), `nav.ts`, `listing/ListingUI.tsx` (button, property page move),
  `listing/ListingForm.tsx` (form move).
- Tests: `app/tests/joychange010.test.ts` J10-04a-g (7 unit), `app/tests/ui-joychange010.test.mjs` (2 screen).

## Status
- Unit 603 pass, lint pass, new screen tests 2/2. Android setup checked on a fake Capacitor template (manifest alias, labels,
  plugin registered); the Java was compiled against stand-in Android/Capacitor classes only.
- **Not built into an APK yet. Not tested on a phone.** The real share list, WhatsApp hand-off and big files can only be
  checked on the phone.
- No database change.

## Limits
- Files waiting in Shared Documents are on this phone only (not synced, not in backups) until moved into a property.
- iPhone: not built (needs a Share Extension).
- Videos and plain text/links are not offered to the app.
