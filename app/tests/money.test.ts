import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoneyTyping, moneyBoxText, caretAfterFormat, rm, rm2, rmShort } from '../src/lib/money';

test('M1 parseMoney reads typed and pasted amounts the same way everywhere', () => {
  assert.equal(parseMoney('500000'), 500000);
  assert.equal(parseMoney('500,000'), 500000);
  assert.equal(parseMoney('RM 1,500,000'), 1500000);
  assert.equal(parseMoney('rm1,250,000.00'), 1250000);
  assert.equal(parseMoney('RM 1,234.5'), 1234.5);
  assert.equal(parseMoney('580k'), 580000);
  assert.equal(parseMoney('RM1.5m'), 1500000);
  assert.equal(parseMoney('1.5 juta'), 1500000);
  assert.equal(parseMoney('0.125'), 0.13, 'rounded to sen');
  assert.equal(parseMoney(''), undefined, 'empty is "not set", never 0');
  assert.equal(parseMoney('  '), undefined);
  assert.equal(parseMoney('abc'), undefined);
  assert.equal(parseMoney('1.2.3'), undefined);
  assert.equal(parseMoney('-500'), undefined, 'no negatives unless allowed');
  assert.equal(parseMoney('-500', { allowNegative: true }), -500);
  assert.equal(parseMoney('0'), 0);
});

test('M2 formatMoneyTyping adds thousands separators while typing without changing the number', () => {
  assert.equal(formatMoneyTyping('500000'), '500,000');
  assert.equal(formatMoneyTyping('1500000'), '1,500,000');
  assert.equal(formatMoneyTyping('1,5000,00'), '1,500,000', 'commas typed in the wrong place are regrouped');
  assert.equal(formatMoneyTyping('12.'), '12.', 'a trailing point is kept so the next digit can follow');
  assert.equal(formatMoneyTyping('1234.567'), '1,234.56', 'at most two decimals');
  assert.equal(formatMoneyTyping('1.2.3'), '1.23', 'a second point is dropped');
  assert.equal(formatMoneyTyping('.5'), '0.5');
  assert.equal(formatMoneyTyping('007'), '7');
  assert.equal(formatMoneyTyping('RM 500000abc'), '500,000');
  assert.equal(formatMoneyTyping(''), '');
  for (const typed of ['500000', '1500000', '1234.5', '99']) assert.equal(parseMoney(formatMoneyTyping(typed)), Number(typed));
});

test('M3 moneyBoxText shows a stored number; caret stays after the same digit', () => {
  assert.equal(moneyBoxText(undefined), '');
  assert.equal(moneyBoxText(0), '0');
  assert.equal(moneyBoxText(1500000), '1,500,000');
  assert.equal(moneyBoxText(1234.5), '1,234.50');
  // Typing "0" after "150,00|" → "150,000|" (cursor at the end).
  assert.equal(caretAfterFormat('150,000', 7, '150,000'), 7);
  // Inserting "5" in the middle of "1,000,000": "1,5|000,000" → "15,000,000", cursor after the 5.
  const typed = '1,5000,000';
  const next = formatMoneyTyping(typed);
  assert.equal(next, '15,000,000');
  assert.equal(next.slice(0, caretAfterFormat(typed, 3, next)), '15');
  // Deleting a digit at the start keeps the cursor at the start.
  assert.equal(caretAfterFormat(',500,000', 0, '500,000'), 0);
});

test('M4 display formats', () => {
  assert.equal(rm(500000), 'RM 500,000');
  assert.equal(rm(1500000), 'RM 1,500,000');
  assert.equal(rm(-2500), '-RM 2,500');
  assert.equal(rm(undefined), '');
  assert.equal(rm2(1234.5), 'RM 1,234.50');
  assert.equal(rmShort(1500000), 'RM 1.5m');
  assert.equal(rmShort(580000), 'RM 580k');
  assert.equal(rmShort(95000), 'RM 95,000');
});
