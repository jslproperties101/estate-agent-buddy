# Stage 5 — Property Calculator, PDFs and Voice Command

Branch `feature/v2-stage5-calculator-pdfs-voice`, started from `feature/v2-stage4-gps` @ `adf9c18`. Not merged, not deployed,
no live Supabase change, no native change. Stage 3 and Stage 4 are still awaiting owner review; Stage 5 is **not approved**.

**Every statement below is about the code and browser tests (Chromium, 384 × 824 px, with stand-ins for the speech service,
the share sheet and Google Maps). Nothing here has been run on the Samsung S23 Ultra.**

## 1. Already present vs newly implemented

| Area | Already present | New in Stage 5 |
| --- | --- | --- |
| Calculator | Four calculators (purchase, rental, sale, commission), Malaysian stamp duty / RPGT / legal-fee rules, editable assumptions, RM formatting | Search-and-pick a property; pick a client; **Save** (name, edit in place, "save as new"); **History** tab (open, PDF, delete with confirm); **Update property record** (reviewable, per-field tick, adds a record-history entry); calculator **PDF** |
| Formulas / rates | `domain/calculator.ts` | **Unchanged.** A saved calculation keeps its inputs and a snapshot of the rates, so old results never change when assumptions change; "Use today's rates" is an explicit button |
| Buyer PDF | Nothing | Field checklist, photo choice (max 12), preview, share/download, EN/BM/中文 |
| PDF engine | Nothing | Local, free: lays out A4 pages, draws them on a canvas, writes a PDF 1.4 file. No server, no paid service |
| Voice | Create-from-speech, agenda parsing, native + browser recognizer, error codes | **Diagnostics screen**; "set price/rent to …" and "change status to Sold" by reference or by type + place; "find buyers who want …"; all open a review panel |
| Data | — | New record collection `calculations` (free-text collection name in `eab_records`, so **no database migration**). Sync, history, recently-deleted and merge work unchanged (unit test CB5) |

## 2. Calculator

- Saved calculation = `{kind, title, propertyId, contactId, purchase, rental, sale, commission, rates}`. Results are always recomputed.
- "Update property record" proposes only entered values that differ (asking price, monthly rent, maintenance fee, commission %). Nothing is written until the agent ticks fields and taps Apply.
- A calculation whose property was deleted still opens and prints (the PDF says the property is no longer in the app).

## 3. Buyer PDF

- Never offered in the checklist: owner name/phone, vendor, commission, arrangement, notes, handled-by, tenancy, documents, marketing, history, exact coordinates.
- The exact address starts **unticked**.
- A missing field is not ticked; if the agent ticks it, the PDF prints "To be confirmed" (never an invented value).
- Verifiable facts carry their existing label: Confirmed / Owner stated / Need to check / Unknown / Not marked. Anything not Confirmed is highlighted and a legend explains it.
- No photos → a clear message; the PDF is still made. A photo that cannot be read leaves a grey box.

### PDF caveats (honest limits)
- The PDF is **picture-based**: text is not selectable/searchable and any link is not clickable. Reason: a local, dependency-free writer that handles Chinese reliably on any phone font.
- **Sharing/downloading inside the Android app is NOT PROVEN.** It uses the Web Share API with a file, else a browser download. An Android WebView may ignore both. If so, the recommended fix is `@capacitor/filesystem` + `@capacitor/share` (free, official, but it changes native dependencies → **needs your approval**; a new APK would then be required).

## 4. Voice Command

- Diagnostics (`Voice Command → Voice diagnostics`): checks plugin present, microphone permission, secure context, online, browser; shows an actionable message per failure; **Test recognition** really listens; **Copy report**. The report states it is not proof of anything on the phone unless the test heard words on the phone itself.
- New commands (English and Bahasa Malaysia): *"set the asking price of P1001 to 850,000"*, *"change P1001 to Sold"*, *"find buyers who want a condo in Cheras under 600,000"*. Each opens a before → after review with a tick and Apply/Cancel. Ambiguous matches ask you to choose; unknown references say so.
- **Chinese**: speech is turned into text in Chinese, but these commands are **not parsed in Chinese** (the screen says so). All screens/strings exist in EN/BM/中文.
- Native requirements: `@capacitor-community/speech-recognition` v7 is already a dependency and `RECORD_AUDIO` is already declared by `scripts/android-setup.mjs`. **No new plugin, permission or native version change.** A new APK is needed only if the APK currently on the phone was built before that plugin was included — the diagnostics screen shows "plugin missing" if so. The phone also needs Google's speech service (Google app) and, for most phones, internet.
- Recommended next steps: install the APK, open Voice diagnostics, tap Test recognition, and tell me the verdict.

## 5. Decisions still open (not resolved by this stage)

Stage 3 (unchanged): headline placement; the 20-fact verification list; loss of owner verification marks when a typed owner becomes a vendor contact.

New:
1. **Buyers have no structured requirements** (budget, area, type, bedrooms). "Find buyers by requirements" therefore matches against buyer notes/source plus the properties each buyer enquired about or viewed. Decision: add requirement fields to Buyer (a data-model change) or keep this.
2. Whether to add the Capacitor share/filesystem plugins (section 3).
3. Whether Chinese voice commands should be parsed.

## 6. To test on the S23 Ultra
1. Voice diagnostics verdict and Test recognition (EN, BM, 中文 speech).
2. Each new voice command → review panel → Apply.
3. Calculator PDF and Buyer PDF: preview, Share (WhatsApp), Download — and whether the saved file opens.
4. Chinese characters render correctly in the PDF.
5. Saved calculation appears on a second phone after Sync.
