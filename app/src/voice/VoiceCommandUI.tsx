// Button 12 — Voice Command: the central place to capture information by voice (replacing the removed
// Smart Capture). Property details, to-dos, appointments and contacts are understood on the phone and always
// opened in their form for the agent to check before saving.
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { Go } from '../nav';
import { PropertyVoice } from '../listing/PropertyVoice';
import { prefillFrom } from '../listing/ListingUI';
import { parseAgenda } from './agenda';
import { normalisePhone } from '../listing/model';

const T = {
  en: {
    intro: 'Say or type what you want to do. The app shows what it understood and opens it for you to check before anything is saved.',
    can: 'You can say, for example',
    examples: [
      'Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold, owner Encik Ahmad 012 345 6789',
      'Find the factory in Salak Tinggi',
      'Remind me to call Buyer K tomorrow at 3pm',
      'Schedule a viewing for P1001 with Buyer K on Friday at 11am',
      'Show my appointments tomorrow',
      'Add a new buyer Lim 012 888 7777',
    ],
  },
  bm: {
    intro: 'Sebut atau taip apa yang anda mahu buat. Aplikasi menunjukkan apa yang difahami dan membukanya untuk anda semak sebelum disimpan.',
    can: 'Contohnya anda boleh sebut',
    examples: [
      'Cipta rumah teres baharu di Putra Nilai, harga lima ratus lapan puluh ribu ringgit, empat bilik tidur, pegangan bebas',
      'Cari kilang di Salak Tinggi',
      'Ingatkan saya telefon Buyer K esok pukul 3 petang',
      'Atur lawatan untuk P1001 dengan Buyer K hari Jumaat pukul 11 pagi',
      'Tunjuk temujanji esok',
      'Tambah pembeli baharu Lim 012 888 7777',
    ],
  },
  zh: {
    intro: '说出或输入您要做的事。应用会显示理解的内容，并在保存前打开让您检查。',
    can: '例如，您可以说',
    examples: [
      'Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold',
      'Find the factory in Salak Tinggi',
      'Remind me to call Buyer K tomorrow at 3pm',
      'Schedule a viewing for P1001 with Buyer K on Friday at 11am',
      'Show my appointments tomorrow',
      'Add a new buyer Lim 012 888 7777',
    ],
  },
};

export function VoiceCommand({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = T[lang];

  /** To-do, calendar and contact commands; returns true when handled. */
  function agenda(text: string): boolean {
    const cmd = parseAgenda(text);
    if (!cmd) return false;
    if (cmd.kind === 'show') {
      if (cmd.what === 'tasks') go({ name: 'todo' }); else go({ name: 'calendar', date: cmd.date });
      return true;
    }
    if (cmd.kind === 'task') {
      go({ name: 'taskForm', prefill: { title: cmd.title, due: cmd.date ? (cmd.time ? `${cmd.date}T${cmd.time}` : cmd.date) : undefined, priority: cmd.priority ?? 'medium' } });
      return true;
    }
    if (cmd.kind === 'appointment') {
      const prop = cmd.ref ? state.properties.find(p => (p.ref ?? '').toUpperCase() === cmd.ref) : undefined;
      const who = cmd.who?.replace(/^the\s+/i, '').toLowerCase();
      const contact = who ? state.contacts.find(c => c.name.toLowerCase().includes(who) || who.includes(c.name.toLowerCase().replace(/\s*\(sample\)/, ''))) : undefined;
      go({ name: 'apptForm', kind: cmd.apptKind, date: cmd.date, time: cmd.time, title: cmd.apptKind === 'viewing' ? undefined : cmd.title || undefined, propertyId: prop?.id, contactId: contact?.id });
      return true;
    }
    if (cmd.kind === 'contact') {
      go({ name: 'contactForm', role: cmd.role, prefill: { name: cmd.name, phone: normalisePhone(cmd.phone) } });
      return true;
    }
    return false;
  }

  return (
    <section className="stack" data-testid="voice-command">
      <p className="notice">{t.intro}</p>
      <PropertyVoice lang={lang} mode="central" otherCommand={agenda}
        onCreate={changes => go({ name: 'listingForm', prefill: prefillFrom(changes) })}
        onFind={c => { go({ name: 'listing', filters: { type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose } }); return 0; }} />
      <div className="card stack-sm">
        <div className="card-title">{t.can}</div>
        {t.examples.map(x => <small key={x}>• “{x}”</small>)}
      </div>
    </section>
  );
}
