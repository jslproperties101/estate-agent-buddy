// Logic tests for the Smart Capture review rules and deletion safeguards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankFields, practiceFields, confirmField, editField, rejectField, resetField,
  canSave, buildSave, validateLabels, ReviewRuleError, Field,
} from '../src/review';
import { moveToDeleted, restore, deletePermanently, purgeExpired, daysLeft } from '../src/deleted';

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof ReviewRuleError ? e.code : 'other'; }
  return 'no-error';
};
const decideAll = (fs: Field[]) => fs.map(f => (f.suggested ? editField(f, f.suggested) : rejectField(f)));

test('R1 a new real capture has no DETECTED values and no invented values', () => {
  const fs = blankFields();
  assert.ok(fs.length > 0);
  for (const f of fs) {
    assert.equal(f.label, null);
    assert.equal(f.suggested, '');
    assert.equal(f.decision, 'pending');
  }
});

test('R2 sample practice data is never labelled DETECTED and is marked sample', () => {
  const fs = practiceFields();
  assert.ok(fs.every(f => f.label !== 'DETECTED'));
  assert.ok(fs.every(f => f.sample === true));
});

test('R3 a DETECTED value without text read from an image is refused', () => {
  const fake: Field = { ...blankFields()[0], suggested: 'Nilai', label: 'DETECTED' };
  assert.equal(code(() => validateLabels([fake])), 'detected-without-reading');
  const real: Field = { ...fake, readText: 'NILAI' };
  assert.equal(code(() => validateLabels([real])), 'no-error');
});

test('R4 INFERRED is never confirmed without the explicit second step', () => {
  const inferred = practiceFields().find(f => f.label === 'INFERRED')!;
  assert.equal(code(() => confirmField(inferred)), 'inferred-needs-explicit-confirm');
  const ok = confirmField(inferred, true);
  assert.equal(ok.decision, 'confirmed');
  assert.equal(ok.label, 'INFERRED', 'label must not change');
});

test('R5 STATED value can be confirmed with one tap; label unchanged', () => {
  const stated = practiceFields().find(f => f.label === 'STATED')!;
  const c = confirmField(stated);
  assert.equal(c.decision, 'confirmed');
  assert.equal(c.finalValue, stated.suggested);
  assert.equal(c.label, 'STATED');
});

test('R6 confirming an empty value is refused; editing to empty is refused', () => {
  const blank = blankFields()[0];
  assert.equal(code(() => confirmField(blank)), 'empty-suggestion');
  assert.equal(code(() => editField(blank, '   ')), 'edit-empty');
  assert.equal(editField(blank, ' Unit 9 ').finalValue, 'Unit 9');
});

test('R7 save is refused while any value is pending, even one', () => {
  const fs = decideAll(practiceFields());
  assert.ok(canSave(fs));
  const oneLeft = fs.map((f, i) => (i === 3 ? resetField(f) : f));
  assert.equal(canSave(oneLeft), false);
  assert.equal(code(() => buildSave(oneLeft)), 'not-all-reviewed');
  assert.equal(code(() => buildSave([])), 'no-fields');
  assert.equal(code(() => buildSave(practiceFields())), 'not-all-reviewed');
});

test('R8 only confirmed and edited values are saved; rejected are dropped', () => {
  let fs = practiceFields();
  fs = fs.map(f => {
    if (f.id === 'unit') return confirmField(f);
    if (f.id === 'price') return editField(f, 'RM 3,100,000');
    return rejectField(f);
  });
  const saved = buildSave(fs);
  assert.deepEqual(saved.map(s => [s.id, s.value, s.decision]), [
    ['unit', '7', 'confirmed'],
    ['price', 'RM 3,100,000', 'edited'],
  ]);
});

test('D1 delete moves to Recently deleted and restore brings it back', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  const r = moveToDeleted(items, [], 'a', 1000);
  assert.deepEqual(r.items.map(i => i.id), ['b']);
  assert.equal(r.bin.length, 1);
  const back = restore(r.items, r.bin, 'a');
  assert.deepEqual(back.items.map(i => i.id).sort(), ['a', 'b']);
  assert.equal(back.bin.length, 0);
});

test('D2 permanent delete needs the exact word typed', () => {
  const bin = [{ item: { id: 'a' }, deletedAt: 0 }];
  assert.equal(deletePermanently(bin, 'a', 'delet', 'DELETE').ok, false);
  assert.equal(deletePermanently(bin, 'a', '', 'DELETE').bin.length, 1);
  const ok = deletePermanently(bin, 'a', ' delete ', 'DELETE');
  assert.equal(ok.ok, true);
  assert.equal(ok.bin.length, 0);
  assert.equal(deletePermanently(bin, 'a', 'PADAM', 'PADAM').ok, true);
});

test('D3 items stay 30 days in Recently deleted', () => {
  const day = 86400000;
  const bin = [{ item: { id: 'old' }, deletedAt: 0 }, { item: { id: 'new' }, deletedAt: 25 * day }];
  assert.equal(daysLeft(bin[1], 26 * day), 29);
  const kept = purgeExpired(bin, 30 * day + 1);
  assert.deepEqual(kept.map(k => k.item.id), ['new']);
});
