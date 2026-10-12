// Smart Capture review rules (Version 1E).
// Pure logic with no screen code, so it can be tested on its own.
//
// Rules, as approved by the owner:
//  1. A value is labelled DETECTED only when it was actually read from an
//     image. Sample or invented values are never DETECTED.
//  2. Every captured value is reviewed one by one: Confirm, Edit or Reject.
//  3. INFERRED values are never confirmed automatically. The person may
//     confirm one, but only with an explicit second step.
//  4. Nothing can be saved while any value still needs review.
//  5. A label is never changed to make a value pass.

export type Label = 'DETECTED' | 'STATED' | 'INFERRED';
export type Decision = 'pending' | 'confirmed' | 'edited' | 'rejected';

export interface Field {
  id: string;
  name: string;
  /** The suggested value. Empty when nothing was suggested. */
  suggested: string;
  /** Null when there is no suggestion (the person enters the value). */
  label: Label | null;
  /** Where the suggestion came from, in plain words. */
  evidence: string;
  /** For DETECTED only: the exact text read from the image. */
  readText?: string;
  decision: Decision;
  /** The value that will be saved (for confirmed or edited). */
  finalValue: string;
  /** True when the field belongs to sample practice data. */
  sample?: boolean;
  /** When sources disagree: each competing value with its source. The app never picks one. */
  candidates?: Candidate[];
  /** Fingerprint of what the sources proposed; used to keep decisions when more files are added. */
  sig?: string;
}

export interface Candidate {
  value: string;
  label: Label;
  evidence: string;   // e.g. 'Brochure.pdf p.2: "Land area: 8,000 sq ft"'
  quote: string;      // exact words from the source
}

export type ReviewError =
  | 'empty-suggestion'
  | 'inferred-needs-explicit-confirm'
  | 'edit-empty'
  | 'not-all-reviewed'
  | 'no-fields'
  | 'detected-without-reading';

export class ReviewRuleError extends Error {
  constructor(public code: ReviewError) {
    super(code);
  }
}

/** Fields every new capture starts with. No AI is connected, so nothing is suggested. */
export const BASE_FIELDS: { id: string; name: string }[] = [
  { id: 'location', name: 'location' },
  { id: 'unit', name: 'unit' },
  { id: 'lot', name: 'lot' },
  { id: 'type', name: 'type' },
  { id: 'availability', name: 'availability' },
  { id: 'price', name: 'price' },
  { id: 'ownerPhone', name: 'ownerPhone' },
];

/** A new capture from a real photo, document or note: every field blank, no labels. */
export function blankFields(): Field[] {
  return BASE_FIELDS.map(f => ({
    id: f.id,
    name: f.name,
    suggested: '',
    label: null,
    evidence: 'noAi',
    decision: 'pending',
    finalValue: '',
  }));
}

/**
 * Practice data, clearly sample. It comes from a sample typed note and a
 * sample GPS position, so it only uses STATED and INFERRED. Nothing was read
 * from an image, so nothing is DETECTED.
 */
export function practiceFields(): Field[] {
  const f = (id: string, suggested: string, label: Label | null, evidence: string): Field => ({
    id, name: id, suggested, label, evidence, decision: 'pending', finalValue: '', sample: true,
  });
  return [
    f('location', 'Jalan Perindustrian 2/3, Nilai', 'INFERRED', 'practiceGps'),
    f('unit', '7', 'STATED', 'practiceNoteUnit'),
    f('lot', '', null, 'practiceNoLot'),
    f('type', 'Semi-D factory', 'STATED', 'practiceNoteType'),
    f('availability', 'Available', 'STATED', 'practiceNoteAvail'),
    f('price', 'RM 3,200,000', 'STATED', 'practiceNotePrice'),
    f('ownerPhone', '', null, 'practiceNoPhone'),
  ];
}

/** Rule 1: every DETECTED value must carry the text read from the image. */
export function validateLabels(fields: Field[]): void {
  for (const x of fields) {
    if (x.label === 'DETECTED' && !(x.readText && x.readText.trim())) {
      throw new ReviewRuleError('detected-without-reading');
    }
  }
}

export function needsExplicitConfirm(field: Field): boolean {
  return field.label === 'INFERRED';
}

/**
 * Confirm the suggested value as it is.
 * For an INFERRED value, `explicit` must be true: the person has answered
 * the extra "Confirm anyway?" question.
 */
export function confirmField(field: Field, explicit = false): Field {
  if (!field.suggested.trim()) throw new ReviewRuleError('empty-suggestion');
  if (needsExplicitConfirm(field) && !explicit) {
    throw new ReviewRuleError('inferred-needs-explicit-confirm');
  }
  return { ...field, decision: 'confirmed', finalValue: field.suggested };
}

/** Replace the value with one the person typed. The label is kept, for the record. */
export function editField(field: Field, value: string): Field {
  const v = value.trim();
  if (!v) throw new ReviewRuleError('edit-empty');
  return { ...field, decision: 'edited', finalValue: v };
}

/** Reject the suggestion (or leave a blank field blank). Nothing is saved for it. */
export function rejectField(field: Field): Field {
  return { ...field, decision: 'rejected', finalValue: '' };
}

/** Conflict: the person picks one of the competing values. */
export function chooseCandidate(field: Field, index: number): Field {
  const c = field.candidates?.[index];
  if (!c) throw new ReviewRuleError('empty-suggestion');
  return { ...field, suggested: c.value, label: c.label, evidence: c.evidence, readText: c.quote, decision: 'confirmed', finalValue: c.value };
}

export function hasConflict(field: Field): boolean {
  return (field.candidates?.length ?? 0) > 1;
}

/** Undo a decision so the value needs review again. */
export function resetField(field: Field): Field {
  // A conflict goes back to having no chosen value, so the choice must be made again.
  if (hasConflict(field)) return { ...field, decision: 'pending', finalValue: '', suggested: '', readText: undefined };
  return { ...field, decision: 'pending', finalValue: '' };
}

export function pendingCount(fields: Field[]): number {
  return fields.filter(f => f.decision === 'pending').length;
}

export function canSave(fields: Field[]): boolean {
  return fields.length > 0 && pendingCount(fields) === 0;
}

export interface SavedValue {
  id: string;
  value: string;
  label: Label | null;
  decision: 'confirmed' | 'edited';
}

/**
 * Rule 4: refuses unless every value has been decided.
 * Only confirmed and edited values are kept; rejected ones are dropped.
 */
export function buildSave(fields: Field[]): SavedValue[] {
  if (!fields.length) throw new ReviewRuleError('no-fields');
  if (!canSave(fields)) throw new ReviewRuleError('not-all-reviewed');
  validateLabels(fields);
  return fields
    .filter(f => f.decision === 'confirmed' || f.decision === 'edited')
    .map(f => ({ id: f.id, value: f.finalValue, label: f.label, decision: f.decision as 'confirmed' | 'edited' }));
}
