// The one money box used by every RM field (property prices, rent, calculator, deals, expenses, filters…).
// Shows "RM" beside the number and thousands separators while typing; gives the screen a plain number.
// Keeps the cursor in place when commas are added or removed, accepts pasted "RM 1,250,000.00", and treats an empty
// box as "not set". Uses lib/money.ts, so every screen reads amounts the same way.
import { useEffect, useRef, useState } from 'react';
import { caretAfterFormat, formatMoneyTyping, moneyBoxText, parseMoney } from '../lib/money';

export interface MoneyInputProps {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  allowNegative?: boolean;
  id?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'data-field'?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function MoneyInput({ value, onChange, allowNegative, ...rest }: MoneyInputProps) {
  const [text, setText] = useState(() => moneyBoxText(value));
  const ref = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);

  // A value changed from outside (voice fill, choosing a property, recalculation) replaces what is shown,
  // unless it is the same number the box already holds (so "12." or "1,000.5" are not rewritten mid-typing).
  useEffect(() => {
    if (parseMoney(text, { allowNegative }) !== value) setText(moneyBoxText(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Put the cursor back after the box was reformatted.
  useEffect(() => {
    const el = ref.current;
    if (el && caret.current !== null && document.activeElement === el) {
      try { el.setSelectionRange(caret.current, caret.current); } catch { /* some input types do not allow it */ }
    }
    caret.current = null;
  }, [text]);

  return (
    <span className="money">
      <span className="money-rm" aria-hidden="true">RM</span>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={e => {
          const typed = e.target.value;
          const next = formatMoneyTyping(typed, { allowNegative });
          caret.current = caretAfterFormat(typed, e.target.selectionStart ?? typed.length, next);
          setText(next);
          onChange(parseMoney(next, { allowNegative }));
        }}
        onPaste={(e: { clipboardData: DataTransfer; currentTarget: HTMLInputElement; preventDefault(): void }) => {
          const pasted = e.clipboardData.getData('text');
          const n = parseMoney(pasted, { allowNegative });
          // A whole amount pasted into an empty or fully selected box ("RM 1.5m", "RM 1,250,000.00") is read as a whole.
          const el = e.currentTarget;
          const all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
          if (n !== undefined && (all || !el.value) && /[a-z,]/i.test(pasted)) {
            e.preventDefault();
            setText(moneyBoxText(n));
            onChange(n);
          }
        }}
        onBlur={() => { const n = parseMoney(text, { allowNegative }); setText(moneyBoxText(n)); }}
      />
    </span>
  );
}
