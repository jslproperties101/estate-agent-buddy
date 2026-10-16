// Text for the owner's 17 Oct 2026 changes (branch 2.0.26.10.17.1): the card's location button and its menu, and the
// Add Location search bar. English, Bahasa Malaysia and Chinese; the Bahasa Malaysia and Chinese wording is a first
// draft for the owner to check.
import type { Lang } from '../i18n';

const en = {
  locationOf: (t: string) => `Location: ${t}`,
  notSet: 'Location Not Set',
  menuTitle: 'Property Location',
  share: 'Share Location',
  openMaps: 'Open in Google Maps',
  shareTitle: 'Share Location With',
  search: 'Search Buyers and Vendors',
  buyers: 'Buyers',
  vendors: 'Vendors',
  noContacts: 'No buyers or vendors with a phone number yet.',
  noPhone: 'No Phone Number',
  fromPhonebook: 'New Contact From Phone Book',
  picked: (n: string) => `Chosen: ${n}`,
  sendWhatsapp: 'Send on WhatsApp',
  saveContact: 'Save as New Contact',
  back: 'Back',
  close: 'Close',
  mapSearch: 'Search a place or address',
  mapSearchBtn: 'Search',
  mapSearching: 'Searching…',
  mapNoResults: 'No place found. Try another name or address.',
};

type C1017 = typeof en;

const bm: C1017 = {
  locationOf: t => `Lokasi: ${t}`,
  notSet: 'Lokasi Belum Ditetapkan',
  menuTitle: 'Lokasi Hartanah',
  share: 'Kongsi Lokasi',
  openMaps: 'Buka dalam Google Maps',
  shareTitle: 'Kongsi Lokasi Dengan',
  search: 'Cari Pembeli dan Penjual',
  buyers: 'Pembeli',
  vendors: 'Penjual',
  noContacts: 'Belum ada pembeli atau penjual yang mempunyai nombor telefon.',
  noPhone: 'Tiada Nombor Telefon',
  fromPhonebook: 'Kenalan Baharu dari Buku Telefon',
  picked: n => `Dipilih: ${n}`,
  sendWhatsapp: 'Hantar melalui WhatsApp',
  saveContact: 'Simpan sebagai Kenalan Baharu',
  back: 'Kembali',
  close: 'Tutup',
  mapSearch: 'Cari tempat atau alamat',
  mapSearchBtn: 'Cari',
  mapSearching: 'Mencari…',
  mapNoResults: 'Tiada tempat dijumpai. Cuba nama atau alamat lain.',
};

const zh: C1017 = {
  locationOf: t => `位置：${t}`,
  notSet: '尚未设置位置',
  menuTitle: '房产位置',
  share: '分享位置',
  openMaps: '在 Google 地图中打开',
  shareTitle: '分享位置给',
  search: '搜索买家和卖家',
  buyers: '买家',
  vendors: '卖家',
  noContacts: '还没有带电话号码的买家或卖家。',
  noPhone: '没有电话号码',
  fromPhonebook: '从通讯录新建联系人',
  picked: n => `已选择：${n}`,
  sendWhatsapp: '通过 WhatsApp 发送',
  saveContact: '保存为新联系人',
  back: '返回',
  close: '关闭',
  mapSearch: '搜索地点或地址',
  mapSearchBtn: '搜索',
  mapSearching: '正在搜索…',
  mapNoResults: '没有找到地点，请换一个名称或地址。',
};

export const c1017Strings: Record<Lang, C1017> = { en, bm, zh };
