// v1buddychange013: styles for the Property Rules Quiz, rendered through a <style> element. All classes start with prq-.
export const PRQ_CSS = `
.prq{--prq-gold:#D8B95C;--prq-pale:#F6E3A1;--prq-ink:#0E0E10;display:flex;flex-direction:column;gap:12px;min-width:0;max-width:100%}
.prq *{box-sizing:border-box;min-width:0}
.prq-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.prq-count{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;color:var(--prq-gold);font-weight:700;overflow-wrap:anywhere}
.prq-exit{flex:none}
.prq-bar{display:grid;grid-template-columns:repeat(10,1fr);gap:3px}
.prq-seg{height:8px;background:#2a2a2e;border:1px solid #3a3a40}
.prq-seg.done{background:var(--prq-gold);border-color:var(--prq-pale)}
.prq-seg.bad{background:#7a2e2e;border-color:#b05050}
.prq-seg.now{border-color:var(--prq-pale)}
.prq-card{border:2px solid var(--prq-gold);box-shadow:3px 3px 0 #000;padding:14px;display:flex;flex-direction:column;gap:12px}
.prq-topic{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.75em;text-transform:uppercase;letter-spacing:.12em;color:var(--prq-gold)}
.prq-q{margin:0;font-size:1.05em;line-height:1.4;font-weight:700;overflow-wrap:anywhere}
.prq-opts{display:flex;flex-direction:column;gap:8px}
.prq-opt{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:10px 12px;border:2px solid #3a3a40;background:#16161a;color:inherit;font:inherit;line-height:1.35;cursor:pointer;overflow-wrap:anywhere}
.prq-opt:disabled{cursor:default}
.prq-key{flex:none;width:1.7em;height:1.7em;display:inline-flex;align-items:center;justify-content:center;background:var(--prq-gold);color:var(--prq-ink);font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:.85em}
.prq-opt.right{border-color:#5fbf6a;background:#13261a}
.prq-opt.wrong{border-color:#d05a5a;background:#2a1414}
.prq-fb{border-left:4px solid var(--prq-gold);padding:8px 10px;background:#16161a;display:flex;flex-direction:column;gap:4px}
.prq-fb.right{border-left-color:#5fbf6a}
.prq-fb.wrong{border-left-color:#d05a5a}
.prq-fb strong{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em}
.prq-fb p{margin:0;line-height:1.4;overflow-wrap:anywhere}
.prq-note{margin:0;font-size:.8em;line-height:1.35;opacity:.8;overflow-wrap:anywhere}
`;
