// JoyChange007 (House Shopping revamp): text for the Mark form, journey cards and the Continue / Start new actions.
// English, Bahasa Malaysia and Chinese; the BM and ZH wording is a first draft for Joe to check.
import type { Lang } from '../i18n';
import type { BannerKind } from '../data/types';

export interface C007Strings {
  marked: string;
  markedCount: (n: number) => string;
  markTitle: string;
  bannerType: string;
  bannerTypes: Record<BannerKind, string>;
  bannerPhone: string;
  purpose: string;
  purposes: Record<'sale' | 'rent' | 'sale_or_rent', string>;
  salePrice: string;
  rentPrice: string;
  comments: string;
  choose: string;
  missing: (fields: string) => string;
  needFix: string;
  saveMark: string;
  markSaved: string;
  journeySaved: string;
  continueJ: string;
  startNew: string;
  stillRecording: string;
  saveAsProperty: string;
  deleteMark: string;
  deleteMarkQ: string;
  deleteMarkBody: string;
  areaUnknown: string;
  noMarks: string;
}

const en: C007Strings = {
  marked: 'Marked',
  markedCount: n => `${n} marked`,
  markTitle: 'Mark property here',
  bannerType: 'Banner type',
  bannerTypes: { agent: 'Agent Banner', owner: 'Owner Banner', maybe_owner: 'Maybe Owner Banner' },
  bannerPhone: 'Banner phone number',
  purpose: 'For Sale / For Rent',
  purposes: { sale: 'For Sale', rent: 'For Rent', sale_or_rent: 'Both' },
  salePrice: 'Asking price (RM)',
  rentPrice: 'Monthly rent (RM)',
  comments: 'Comments (optional)',
  choose: 'Not Set',
  missing: f => `Please fill in: ${f}.`,
  needFix: 'Waiting for your GPS position. The mark is saved at the spot where you stand.',
  saveMark: 'Save mark',
  markSaved: 'Marked.',
  journeySaved: 'Journey saved.',
  continueJ: 'Continue this journey',
  startNew: 'Start new journey',
  stillRecording: 'Another journey is still recording. Stop it first.',
  saveAsProperty: 'Save as property',
  deleteMark: 'Delete mark',
  deleteMarkQ: 'Delete this marked position?',
  deleteMarkBody: 'Only the mark is removed. A property saved from it stays in your Subsale List.',
  areaUnknown: 'Area not known',
  noMarks: 'Nothing marked on this journey.',
};

const bm: C007Strings = {
  marked: 'Ditanda',
  markedCount: n => `${n} ditanda`,
  markTitle: 'Tanda hartanah di sini',
  bannerType: 'Jenis sepanduk',
  bannerTypes: { agent: 'Sepanduk Ejen', owner: 'Sepanduk Pemilik', maybe_owner: 'Mungkin Sepanduk Pemilik' },
  bannerPhone: 'Nombor telefon pada sepanduk',
  purpose: 'Untuk Dijual / Untuk Disewa',
  purposes: { sale: 'Untuk Dijual', rent: 'Untuk Disewa', sale_or_rent: 'Kedua-duanya' },
  salePrice: 'Harga diminta (RM)',
  rentPrice: 'Sewa bulanan (RM)',
  comments: 'Komen (pilihan)',
  choose: 'Tidak Ditetapkan',
  missing: f => `Sila isi: ${f}.`,
  needFix: 'Menunggu kedudukan GPS anda. Tanda disimpan di tempat anda berdiri.',
  saveMark: 'Simpan tanda',
  markSaved: 'Ditanda.',
  journeySaved: 'Perjalanan disimpan.',
  continueJ: 'Teruskan perjalanan ini',
  startNew: 'Mula perjalanan baharu',
  stillRecording: 'Perjalanan lain masih dirakam. Hentikannya dahulu.',
  saveAsProperty: 'Simpan sebagai hartanah',
  deleteMark: 'Padam tanda',
  deleteMarkQ: 'Padam kedudukan yang ditanda ini?',
  deleteMarkBody: 'Hanya tanda dipadam. Hartanah yang disimpan daripadanya kekal dalam Senarai Subsale anda.',
  areaUnknown: 'Kawasan tidak diketahui',
  noMarks: 'Tiada yang ditanda dalam perjalanan ini.',
};

const zh: C007Strings = {
  marked: '已标记',
  markedCount: n => `已标记 ${n} 处`,
  markTitle: '在此标记房产',
  bannerType: '横幅类型',
  bannerTypes: { agent: '经纪横幅', owner: '屋主横幅', maybe_owner: '可能是屋主横幅' },
  bannerPhone: '横幅上的电话号码',
  purpose: '出售 / 出租',
  purposes: { sale: '出售', rent: '出租', sale_or_rent: '两者' },
  salePrice: '要价 (RM)',
  rentPrice: '月租 (RM)',
  comments: '备注（可选）',
  choose: '未设置',
  missing: f => `请填写：${f}。`,
  needFix: '正在等待您的 GPS 位置。标记会保存在您所站的位置。',
  saveMark: '保存标记',
  markSaved: '已标记。',
  journeySaved: '行程已保存。',
  continueJ: '继续此行程',
  startNew: '开始新行程',
  stillRecording: '另一个行程仍在记录中，请先停止。',
  saveAsProperty: '保存为房产',
  deleteMark: '删除标记',
  deleteMarkQ: '删除这个标记的位置？',
  deleteMarkBody: '只删除标记。由它保存的房产仍在您的二手房列表中。',
  areaUnknown: '地区未知',
  noMarks: '此行程没有标记。',
};

export const c007Strings: Record<Lang, C007Strings> = { en, bm, zh };
