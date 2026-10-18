// Text for Change 015 (Subsale List cards, photo menu, check / not-filled counts, Add Location popup), in English,
// Bahasa Malaysia and Chinese. The Bahasa Malaysia and Chinese wording is a first draft for the owner to check.
import type { Lang } from '../i18n';

const en = {
  card: {
    edit: 'Edit property',
    editOf: (t: string) => `Edit property: ${t}`,
    openOf: (t: string) => `Open property: ${t}`,
    clickToOpen: 'Click to Open',
    forSale: 'FOR SALE', forRent: 'FOR RENT',
    storeys: (n: number) => `${n} ${n === 1 ? 'Storey' : 'Storeys'}`,
    bedrooms: (n: number) => `${n} ${n === 1 ? 'Bedroom' : 'Bedrooms'}`,
    bathrooms: (n: number) => `${n} ${n === 1 ? 'Bathroom' : 'Bathrooms'}`,
    land: (x: string) => `Land size ${x}`,
    builtUp: (x: string) => `Built-Up ${x}`,
    parking: (n: number) => `${n} Parking`,
    toCheck: (n: number) => `* ${n} To Check`,
    notFilled: (n: number) => `* ${n} Not Filled`,
  },
  details: {
    toCheckTitle: (n: number) => `To check (${n})`,
    notFilledTitle: (n: number) => `Not filled (${n})`,
  },
  photo: {
    menu: (n: number) => `Photo ${n} actions`,
    makeMain: 'Make as Main Photo',
    remove: 'Remove',
  },
};

type C15 = typeof en;

const bm: C15 = {
  card: {
    edit: 'Sunting hartanah',
    editOf: t => `Sunting hartanah: ${t}`,
    openOf: t => `Buka hartanah: ${t}`,
    clickToOpen: 'Klik untuk Buka',
    forSale: 'UNTUK DIJUAL', forRent: 'UNTUK DISEWA',
    storeys: n => `${n} Tingkat`,
    bedrooms: n => `${n} Bilik Tidur`,
    bathrooms: n => `${n} Bilik Air`,
    land: x => `Saiz tanah ${x}`,
    builtUp: x => `Binaan ${x}`,
    parking: n => `${n} Parkir`,
    toCheck: n => `* ${n} Perlu Disemak`,
    notFilled: n => `* ${n} Belum Diisi`,
  },
  details: {
    toCheckTitle: n => `Perlu disemak (${n})`,
    notFilledTitle: n => `Belum diisi (${n})`,
  },
  photo: {
    menu: n => `Tindakan foto ${n}`,
    makeMain: 'Jadikan Foto Utama',
    remove: 'Buang',
  },
};

const zh: C15 = {
  card: {
    edit: '编辑房产',
    editOf: t => `编辑房产：${t}`,
    openOf: t => `打开房产：${t}`,
    clickToOpen: '点击打开',
    forSale: '出售', forRent: '出租',
    storeys: n => `${n} 层`,
    bedrooms: n => `${n} 间卧室`,
    bathrooms: n => `${n} 间浴室`,
    land: x => `土地 ${x}`,
    builtUp: x => `建筑 ${x}`,
    parking: n => `${n} 个车位`,
    toCheck: n => `* ${n} 项待核实`,
    notFilled: n => `* ${n} 项未填写`,
  },
  details: {
    toCheckTitle: n => `待核实（${n}）`,
    notFilledTitle: n => `未填写（${n}）`,
  },
  photo: {
    menu: n => `照片 ${n} 操作`,
    makeMain: '设为主照片',
    remove: '移除',
  },
};

export const c15Strings: Record<Lang, C15> = { en, bm, zh };
