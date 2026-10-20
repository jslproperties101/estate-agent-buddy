// MainForAdmin-B text: sign-in lockout, suspended / banned / closed / forced sign-out, first-login consent, licence types,
// marketing setting. English, Bahasa Malaysia and Chinese. The consent wording is JoyChange005-Main Part2 Change C
// (Joe's text); the other BM / ZH lines are a first draft for Joe to check.
import type { Lang } from '../i18n';

type Status = 'suspended' | 'banned' | 'closed' | 'forced';
export interface C00bStrings {
  locked: (min: number) => string;
  blockedTitle: Record<Status, string>;
  blockedBody: Record<Status, string>;
  contact: (email?: string, address?: string) => string;
  country: string; countryHint: string;
  agreeA: string; agreeTerms: string; agreeB: string;
  marketing: (company: string) => string;
  needTerms: string;
  termsTitle: string; termsDraft: string; close: string;
  firm: string;
  marketingSetting: string; marketingSaved: string;
}

const en: C00bStrings = {
  locked: m => `Too many failed sign-in attempts on this phone. Please wait ${m} minute${m === 1 ? '' : 's'} and try again.`,
  blockedTitle: { suspended: 'Your account is suspended', banned: 'Your account is banned', closed: 'Your account is closed', forced: 'You were signed out' },
  blockedBody: {
    suspended: 'You cannot use the app until the company lifts the suspension. Your data on this phone has not been deleted.',
    banned: 'This account can no longer use the app. Your data on this phone has not been deleted.',
    closed: 'This account has been closed. Your data on this phone has not been deleted.',
    forced: 'The company signed this account out. Sign in again to continue.',
  },
  contact: (e, a) => `Please contact support${e ? `: ${e}` : ' (contact details coming soon)'}${a ? ` · ${a}` : ''}.`,
  country: 'Country', countryHint: 'New properties start with this country. You can change it later in Settings.',
  agreeA: 'I have read and agree to the ', agreeTerms: 'Terms and Conditions', agreeB: '.',
  marketing: c => `Keep me in the loop — send me news about new features, tips to get more out of the app, early access to improvements, and special offers from ${c}. I can unsubscribe anytime.`,
  needTerms: 'You need to accept the Terms and Conditions to continue.',
  termsTitle: 'Terms and Conditions', termsDraft: 'Draft — to be reviewed by a Malaysian lawyer before release.', close: 'Close',
  firm: 'Firm licence',
  marketingSetting: 'News, tips and offers (you can unsubscribe anytime)', marketingSaved: 'Saved.',
};

const bm: C00bStrings = {
  locked: m => `Terlalu banyak cubaan log masuk gagal pada telefon ini. Sila tunggu ${m} minit dan cuba lagi.`,
  blockedTitle: { suspended: 'Akaun anda digantung', banned: 'Akaun anda disekat', closed: 'Akaun anda ditutup', forced: 'Anda telah dilog keluar' },
  blockedBody: {
    suspended: 'Anda tidak boleh menggunakan aplikasi sehingga syarikat menarik balik penggantungan. Data anda dalam telefon ini tidak dipadam.',
    banned: 'Akaun ini tidak boleh lagi menggunakan aplikasi. Data anda dalam telefon ini tidak dipadam.',
    closed: 'Akaun ini telah ditutup. Data anda dalam telefon ini tidak dipadam.',
    forced: 'Syarikat telah melog keluar akaun ini. Log masuk semula untuk meneruskan.',
  },
  contact: (e, a) => `Sila hubungi sokongan${e ? `: ${e}` : ' (butiran hubungan akan datang)'}${a ? ` · ${a}` : ''}.`,
  country: 'Negara', countryHint: 'Hartanah baharu bermula dengan negara ini. Anda boleh mengubahnya kemudian dalam Tetapan.',
  agreeA: 'Saya telah membaca dan bersetuju dengan ', agreeTerms: 'Terma dan Syarat', agreeB: '.',
  marketing: c => `Kekalkan saya dimaklumkan — hantar berita tentang ciri baharu, tip untuk memanfaatkan aplikasi, akses awal kepada penambahbaikan, dan tawaran istimewa daripada ${c}. Saya boleh berhenti melanggan pada bila-bila masa.`,
  needTerms: 'Anda perlu menerima Terma dan Syarat untuk meneruskan.',
  termsTitle: 'Terma dan Syarat', termsDraft: 'Draf — akan disemak oleh peguam Malaysia sebelum dikeluarkan.', close: 'Tutup',
  firm: 'Lesen firma',
  marketingSetting: 'Berita, tip dan tawaran (anda boleh berhenti melanggan pada bila-bila masa)', marketingSaved: 'Disimpan.',
};

const zh: C00bStrings = {
  locked: m => `此手机登录失败次数过多。请等待 ${m} 分钟后再试。`,
  blockedTitle: { suspended: '您的账户已被暂停', banned: '您的账户已被封禁', closed: '您的账户已关闭', forced: '您已被登出' },
  blockedBody: {
    suspended: '在公司解除暂停之前，您无法使用本应用。此手机上的数据没有被删除。',
    banned: '此账户已无法再使用本应用。此手机上的数据没有被删除。',
    closed: '此账户已关闭。此手机上的数据没有被删除。',
    forced: '公司已将此账户登出。请重新登录以继续。',
  },
  contact: (e, a) => `请联系客服${e ? `：${e}` : '（联系方式即将提供）'}${a ? ` · ${a}` : ''}。`,
  country: '国家', countryHint: '新房产会以此国家开始。您以后可以在设置中更改。',
  agreeA: '我已阅读并同意', agreeTerms: '《条款与条件》', agreeB: '。',
  marketing: c => `让我随时了解最新动态——向我发送新功能消息、使用技巧、抢先体验改进功能，以及来自 ${c} 的特别优惠。我可随时取消订阅。`,
  needTerms: '您需要接受条款与条件才能继续。',
  termsTitle: '条款与条件', termsDraft: '草稿——发布前须经马来西亚律师审阅。', close: '关闭',
  firm: '公司执照',
  marketingSetting: '新闻、技巧与优惠（可随时取消订阅）', marketingSaved: '已保存。',
};

export const c00bStrings: Record<Lang, C00bStrings> = { en, bm, zh };
