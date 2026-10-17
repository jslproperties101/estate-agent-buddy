// A small spinner with a task label ("Creating PDF…"), shown only on the screen that started the work (Change 013).
// It is ordinary local screen state: leaving the screen removes it, it never appears on other screens, and the screen
// that owns the task turns it off on success, failure or cancellation. It does not block scrolling.
// Change 17b: for long jobs it can also show a percentage bar and a note that the job carries on if the person leaves.
export function BusyLine({ text, testId = 'busy-line', percent, note }: { text: string; testId?: string; percent?: number; note?: string }) {
  const pct = percent === undefined ? undefined : Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="busy-line busy-block" role="status" aria-live="polite" aria-busy="true" data-testid={testId}>
      <div className="busy-row"><span className="spinner" aria-hidden="true" /><span>{text}{pct !== undefined ? ` ${pct}%` : ''}</span></div>
      {pct !== undefined && <div className="busy-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-testid={`${testId}-bar`}><span style={{ width: `${pct}%` }} /></div>}
      {note && <small className="muted" data-testid={`${testId}-note`}>{note}</small>}
    </div>
  );
}
