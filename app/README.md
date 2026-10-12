# Property Explorer: Smart Capture prototype (Version 1I)

This is a prototype only, using sample data. It has no login, no database, no AI and no live news. Everything is lost when the page is closed. Do not use it with real client data.

## What changed from property-explorer-starter-news.zip

- **Home screen:** the 3 × 4 home grid replaces the side menu. Explorer progress is at the top, the GPS map has a large card, and recent properties show as photo cards. Buttons 9–12 say "Coming soon".
- **News & Big News:** opened from the news icon in the header, not from a home button. It shows sample content only.
- **No invented DETECTED values:** a real photo or document starts with every field blank. A DETECTED label is refused unless the value carries text actually read from an image.
- **Reviewing values:** each value has its own Confirm, Edit and Reject buttons. Blank fields have Enter value and Leave blank instead. There is no "confirm all".
- **INFERRED values:** never confirmed automatically. Pressing Confirm on one asks "Confirm it anyway?" first. Labels never change.
- **Saving:** Save stays locked until every value is reviewed. The save function also refuses on its own, not just the button. Only confirmed and edited values are saved.
- **Deleting:**
  - Delete asks first, then moves the capture to Recently deleted.
  - You can Undo straight away, or Restore within 30 days.
  - Permanent deletion needs DELETE typed (PADAM in Bahasa Malaysia).
- **Languages:** English and Bahasa Malaysia switch. The Bahasa Malaysia wording is a draft and needs checking.
- **Readability and offline use:** no text is smaller than 14 px, and buttons are at least 44 px tall. The app uses the phone's own fonts and makes no outside requests, so it works offline.
- **Fixed versions:** every package version is pinned exactly (no "latest").

## Version 1I: local reading (no AI, no account, no network)

- PDF text is read with pdf.js (bundled, works offline). Pages with no text are reported as scanned (they need OCR in the Android app).
- Word (.docx) text is read by our own small reader. Old .doc files are reported as unsupported.
- Extraction rules: English and Bahasa Malaysia; a small draft set for Chinese and Tamil. Every value keeps its file, page and exact words (DETECTED); values from a typed note are STATED.
- Sensitive-data check: IC, passport and account numbers and title/SPA wording. Those numbers are never used or shown; sensitive files would never go to cloud AI.
- Conflicts between files are shown side by side; the app never chooses. Important fields that were not found are listed as missing.
- Photos: made smaller on the phone (max 1600 px, JPEG), and exact duplicates are refused. Reading text from photos (OCR) is not in this prototype.

Measure on your own non-confidential brochures:

```
npm run measure -- <folder with PDF/DOCX files> [expected.json]
```

See tests/fixtures/expected.json for the format. Results go to measurement.md in that folder.

## Commands

```
npm test          # type check + rule tests + local-pipeline tests + build + browser screen tests
npm run measure   # measure the local pipeline on a folder of sample brochures
npm run build     # builds into dist/
```

The build uses esbuild instead of Vite. The workspace where this was made could not download packages, because the npm registry was blocked there. All packages used were already on that machine.

## Not done yet (limitations)

- **Screen type checks:** the screen files (`.tsx`) are built but not type-checked, because the React type package (`@types/react`) could not be downloaded. The logic files are type-checked.
- **Packages:** `npm install` and `package-lock.json` have not been run or created yet. They need a normal internet connection, for example GitHub Actions.
- **Not built yet:**
  - matching against existing properties (needs a database);
  - AI reading;
  - voice recording;
  - GPS;
  - the Android app;
  - the other home buttons.
- **Phone testing:** tested in Chromium at S23 Ultra size (384 × 824), not on the real phone.
