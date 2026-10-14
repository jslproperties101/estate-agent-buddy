// "Choose from phone book" — one button used by every screen that takes a name and phone number (contact form,
// Send Name Card). It asks for Contacts permission when tapped, opens Android's contact picker, hands the chosen
// name and number to the screen (which puts them in normal, editable boxes) and always says what happened:
// busy while the picker is open, and a clear message when permission is refused, the picker is closed without a
// choice, or this installed APK does not contain the phone book part.
import { ReactNode, useState } from 'react';
import { Lang } from '../i18n';
import { PickedContact, pickPhoneContacts, phonebookProblem, PhonebookProblem } from '../lib/phonebook';
import { titled3 } from '../lib/titleCase';

const T = titled3( {
  en: {
    label: 'Choose from phone book', opening: 'Opening phone book…', none: 'No contact was chosen.', noPhone: 'This contact has no phone number. Type the number.',
    problem: {
      denied: 'Contacts permission was refused. Allow Contacts for Estate Agent AI Buddy in the phone Settings → Apps → Permissions, then try again. You can also type the details.',
      'plugin-missing': 'This installed version of the app does not include the phone book. Install the latest APK (Settings → About), or type the details.',
      unsupported: 'The phone book is not available in this browser. It works in the Android app and in Chrome on Android. Type the details instead.',
      failed: 'The phone book could not be opened. Try again, or type the details.',
    } as Record<PhonebookProblem, string>,
  },
  bm: {
    label: 'Pilih daripada buku telefon', opening: 'Membuka buku telefon…', none: 'Tiada kenalan dipilih.', noPhone: 'Kenalan ini tiada nombor telefon. Taip nombornya.',
    problem: {
      denied: 'Kebenaran Kenalan ditolak. Benarkan Kenalan untuk Estate Agent AI Buddy di Tetapan telefon → Aplikasi → Kebenaran, kemudian cuba lagi. Anda juga boleh menaip.',
      'plugin-missing': 'Versi aplikasi yang dipasang tidak mengandungi buku telefon. Pasang APK terkini (Tetapan → Perihal), atau taip butirannya.',
      unsupported: 'Buku telefon tidak tersedia dalam pelayar ini. Ia berfungsi dalam aplikasi Android dan Chrome di Android. Taip butirannya.',
      failed: 'Buku telefon tidak dapat dibuka. Cuba lagi, atau taip butirannya.',
    } as Record<PhonebookProblem, string>,
  },
  zh: {
    label: '从通讯录选择', opening: '正在打开通讯录…', none: '没有选择联系人。', noPhone: '此联系人没有电话号码，请手动输入。',
    problem: {
      denied: '通讯录权限被拒绝。请在手机 设置 → 应用 → 权限 中为 Estate Agent AI Buddy 允许通讯录，然后再试。也可以手动输入。',
      'plugin-missing': '已安装的应用版本不包含通讯录功能。请安装最新的 APK（设置 → 关于），或手动输入。',
      unsupported: '此浏览器无法使用通讯录。安卓应用和安卓 Chrome 中可以使用。请手动输入。',
      failed: '无法打开通讯录。请再试一次，或手动输入。',
    } as Record<PhonebookProblem, string>,
  },
});

type Msg = { text: string; error: boolean } | null;

/** The shared behaviour: ask permission, open the picker, hand over the choice, and always say what happened. */
export function usePhonebook(lang: Lang, onPicked: (c: PickedContact) => void) {
  const t = T[lang];
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function pick() {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      const got = await pickPhoneContacts(false);
      if (got === null) { setMsg({ text: t.problem.unsupported, error: true }); return; }
      const p = got[0];
      if (!p) { setMsg({ text: t.none, error: false }); return; }
      onPicked(p);
      if (!p.tel) setMsg({ text: t.noPhone, error: false });
    } catch (e) {
      setMsg({ text: t.problem[phonebookProblem(e)], error: true });
    } finally { setBusy(false); }
  }
  return { t, busy, msg, pick };
}

const PhonebookIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zM3 7h2M3 12h2M3 17h2" /><circle cx="12" cy="10" r="2.5" /><path d="M8.5 16a3.5 3.5 0 017 0" /></svg>
);

export function PhonebookButton({ lang, onPicked, compact, testId = 'pick-contact', className = 'btn secondary' }: {
  lang: Lang; onPicked: (c: PickedContact) => void; compact?: boolean; testId?: string; className?: string;
}) {
  const { t, busy, msg, pick } = usePhonebook(lang, onPicked);
  return (
    <>
      {compact
        ? <button type="button" className="combo-btn" onClick={() => void pick()} aria-label={t.label} title={t.label} aria-busy={busy} data-testid={testId}><PhonebookIcon /></button>
        : <button type="button" className={className} onClick={() => void pick()} aria-busy={busy} data-testid={testId}>📇 {busy ? t.opening : t.label}</button>}
      {msg && <p className={msg.error ? 'error pb-msg' : 'muted small pb-msg'} role={msg.error ? 'alert' : 'status'} data-testid={`${testId}-msg`}>{msg.text}</p>}
    </>
  );
}

/** A phone number box with the phone-book icon beside it. The number stays typed text and editable after choosing; permission
 *  refused, picker closed without a choice, unsupported browser and a missing plugin each get a clear message under the box. */
export function PhoneInput({ lang, id, label, value, onChange, onBlur, onPicked, dataField = 'phone', testId = 'pick-contact', pickLabel }: {
  lang: Lang; id: string; label: ReactNode; value: string; onChange: (v: string) => void; onBlur?: () => void;
  onPicked: (c: PickedContact) => void; dataField?: string; testId?: string; pickLabel?: string;
}) {
  const { t, busy, msg, pick } = usePhonebook(lang, onPicked);
  const name = pickLabel ?? t.label;
  return (
    <div className="ff">
      <span>{label}</span>
      <div className="combo">
        <input id={id} data-field={dataField} type="tel" inputMode="tel" value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
        <button type="button" className="combo-btn" onClick={() => void pick()} aria-label={name} title={name} aria-busy={busy} data-testid={testId}><PhonebookIcon /></button>
      </div>
      {msg && <p className={msg.error ? 'error pb-msg' : 'muted small pb-msg'} role={msg.error ? 'alert' : 'status'} data-testid={`${testId}-msg`}>{msg.text}</p>}
    </div>
  );
}
