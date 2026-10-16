// A small spinner with a task label ("Creating PDF…"), shown only on the screen that started the work (Change 013).
// It is ordinary local screen state: leaving the screen removes it, it never appears on other screens, and the screen
// that owns the task turns it off on success, failure or cancellation. It does not block scrolling.
export function BusyLine({ text, testId = 'busy-line' }: { text: string; testId?: string }) {
  return (
    <div className="busy-line" role="status" aria-live="polite" data-testid={testId}>
      <span className="spinner" aria-hidden="true" /><span>{text}</span>
    </div>
  );
}
