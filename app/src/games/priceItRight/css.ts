// Price It Right: the game's own styling, rendered with a <style> element inside the game (all classes start with pir-).
// Black and gold with small 8-bit touches: stepped pixel shadows, a monospace heading font and a blocky progress bar.
export const PIR_CSS = `
.pir { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.pir * { min-width: 0; }
.pir-mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Courier New', monospace; letter-spacing: .03em; }
.pir-title { margin: 0; font-size: 22px; line-height: 1.2; font-weight: 800; text-transform: uppercase; color: var(--gold-hi, #F6E3A1); text-shadow: 2px 2px 0 #000; overflow-wrap: anywhere; }
.pir-disc { border: 2px dashed var(--line-2, #4A4231); background: #0E0E10; color: var(--gold-hi, #F6E3A1); padding: 6px 10px; font-size: 14px; font-weight: 700; text-align: center; line-height: 1.3; overflow-wrap: anywhere; }
.pir-note { margin: 0; font-size: 14px; color: var(--muted, #BEB7A6); overflow-wrap: anywhere; }
.pir-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pir-top-info { display: flex; flex-direction: column; gap: 2px; font-size: 15px; font-weight: 800; color: var(--gold-hi, #F6E3A1); }
.pir-top-info span:last-child { color: var(--ink, #F7F4EC); font-weight: 700; }
.pir-prog { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 3px; }
.pir-prog i { display: block; height: 8px; background: #2E2A22; border: 1px solid #000; }
.pir-prog i.done { background: #D8B95C; }
.pir-prog i.cur { background: #F6E3A1; box-shadow: 0 0 0 1px #D8B95C; }

.pir-menu { display: flex; flex-direction: column; gap: 10px; }
.pir button.pir-mode { width: 100%; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; gap: 4px; text-align: left; padding: 12px 14px; min-height: 72px;
  border: 2px solid #D8B95C; border-radius: 6px; background: #131316; color: var(--ink, #F7F4EC); box-shadow: 0 4px 0 #000; }
.pir-mode strong { font-size: 17px; color: var(--gold-hi, #F6E3A1); overflow-wrap: anywhere; }
.pir-mode small { font-size: 14px; font-weight: 500; color: var(--muted, #BEB7A6); overflow-wrap: anywhere; line-height: 1.3; }
.pir-mode:active:not([aria-disabled="true"]) { transform: translateY(2px); box-shadow: 0 2px 0 #000; }
.pir-mode[aria-disabled="true"] { border-style: dashed; border-color: var(--line-2, #4A4231); background: #17171A; box-shadow: none; cursor: not-allowed; }
.pir-mode[aria-disabled="true"] strong { color: #A39883; }
.pir-mode .pir-why { color: var(--amber, #F0C060); font-weight: 700; }

.pir-card { display: flex; flex-direction: column; gap: 10px; }
.pir-art { background: #0E0E10; border: 3px solid #D8B95C; box-shadow: 4px 4px 0 #000, inset 0 0 0 2px #000; padding: 4px 6px 0; }
.pir-art-svg { display: block; width: 100%; height: auto; max-height: 140px; image-rendering: pixelated; }
.pir-head { display: flex; flex-direction: column; gap: 2px; }
.pir-type { font-size: 18px; font-weight: 800; color: var(--gold-hi, #F6E3A1); overflow-wrap: anywhere; line-height: 1.25; }
.pir-area { font-size: 15px; color: var(--ink, #F7F4EC); overflow-wrap: anywhere; line-height: 1.3; }
.pir-spec { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.pir-spec li { border: 2px solid var(--line-2, #4A4231); background: #17171A; padding: 2px 8px; font-size: 14px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.pir-spec li.kind { background: #D8B95C; border-color: #D8B95C; color: #0E0E10; }
.pir-spec li.sale-tag { background: #F6E3A1; }
.pir-flavour { margin: 0; font-size: 14px; color: var(--muted, #BEB7A6); font-style: italic; overflow-wrap: anywhere; }

.pir-q { margin: 0; font-size: 18px; font-weight: 800; color: var(--gold-hi, #F6E3A1); line-height: 1.3; overflow-wrap: anywhere; }
.pir-opts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.pir button.pir-opt { width: 100%; min-height: 56px; justify-content: flex-start; flex-wrap: wrap; text-align: left; gap: 10px; padding: 8px 12px; font-size: 17px;
  border: 2px solid #D8B95C; border-radius: 6px; background: #131316; color: var(--ink, #F7F4EC); box-shadow: 0 4px 0 #000; }
.pir-letter { flex: none; width: 30px; height: 30px; display: inline-grid; place-items: center; background: #D8B95C; color: #0E0E10; font-weight: 800; font-size: 16px; }
.pir-amt { flex: 1 1 120px; overflow-wrap: anywhere; font-weight: 800; }
.pir-tag { flex: none; font-size: 13px; font-weight: 800; padding: 1px 6px; border: 2px solid currentColor; line-height: 1.3; }
.pir-opt:active:not([aria-disabled="true"]) { transform: translateY(2px); box-shadow: 0 2px 0 #000; }
.pir-opt[aria-disabled="true"] { cursor: default; }
.pir-opt.is-right { border-color: #6FD49B; background: #12261B; color: #BFF3D4; }
.pir-opt.is-right .pir-letter { background: #6FD49B; }
.pir-opt.is-wrong { border-color: #FF8A7A; background: #2A1512; color: #FFC9C0; }
.pir-opt.is-wrong .pir-letter { background: #FF8A7A; }
.pir-opt.is-dim { opacity: .62; box-shadow: none; }

.pir-fb { display: flex; flex-direction: column; gap: 6px; border: 3px solid #6FD49B; background: #0E0E10; padding: 10px 12px; box-shadow: 4px 4px 0 #000; }
.pir-fb.no { border-color: #FF8A7A; }
.pir-fb strong { font-size: 18px; color: #BFF3D4; overflow-wrap: anywhere; }
.pir-fb.no strong { color: #FFC9C0; }
.pir-fb span { font-size: 16px; overflow-wrap: anywhere; }
.pir-actions { display: flex; flex-direction: column; gap: 8px; }
@media (prefers-reduced-motion: reduce) { .pir-opt, .pir-mode { transition: none; } }
`;
