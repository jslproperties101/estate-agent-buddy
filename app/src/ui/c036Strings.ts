// JoyChange002 Change 36: the pencil and X on remembered dropdown entries and on saved field values, in three languages.
import type { Lang } from '../i18n';

const en = {
  edit: (x: string) => `Edit ${x}`, remove: (x: string) => `Delete ${x}`, editField: (f: string) => `Change ${f}`, clearField: (f: string) => `Clear ${f}`,
  renameLabel: 'New name', save: 'Save', cancel: 'Cancel', del: 'Delete', editInstead: 'Edit', continueDel: 'Continue delete', rename: 'Rename',
  simpleQ: (x: string) => `Delete “${x}”?`, simpleBody: 'It is removed from this list.',
  fieldQ: 'Delete this value?', fieldBody: 'The field is emptied. Save the form to keep the change.',
  belowQ: (x: string) => `Delete “${x}” and what is saved under it?`,
  belowBody: (n: number) => `Deleting this also removes ${n} saved ${n === 1 ? 'entry' : 'entries'} linked under it (for example its townships and Jalan). If it is only a typo, edit it instead: everything linked stays.`,
  propsQ: (n: number) => `${n} ${n === 1 ? 'property uses' : 'properties use'} this`,
  propsBody: (n: number) => `${n === 1 ? 'This property' : `These ${n} properties`} will lose this part of the address and everything below it. To fix a typo, rename it instead: the properties are updated to the new name.`,
  emptyName: 'Type a name first.', taken: 'That name is already in the list.',
  renamed: (n: number) => (n ? `Renamed. ${n} ${n === 1 ? 'property was' : 'properties were'} updated.` : 'Renamed.'),
};
export type C036 = typeof en;

const bm: C036 = {
  edit: x => `Ubah ${x}`, remove: x => `Padam ${x}`, editField: f => `Tukar ${f}`, clearField: f => `Kosongkan ${f}`,
  renameLabel: 'Nama baharu', save: 'Simpan', cancel: 'Batal', del: 'Padam', editInstead: 'Ubah', continueDel: 'Teruskan padam', rename: 'Namakan semula',
  simpleQ: x => `Padam “${x}”?`, simpleBody: 'Ia dibuang daripada senarai ini.',
  fieldQ: 'Padam nilai ini?', fieldBody: 'Medan ini dikosongkan. Simpan borang untuk mengekalkan perubahan.',
  belowQ: x => `Padam “${x}” dan apa yang disimpan di bawahnya?`,
  belowBody: n => `Memadam ini juga membuang ${n} entri tersimpan yang dipautkan di bawahnya (contohnya taman dan jalannya). Jika ia hanya salah taip, ubah sahaja: semua yang dipautkan kekal.`,
  propsQ: n => `${n} hartanah menggunakan ini`,
  propsBody: n => `${n === 1 ? 'Hartanah ini' : `${n} hartanah ini`} akan kehilangan bahagian alamat ini dan semua di bawahnya. Untuk membetulkan salah taip, namakan semula: hartanah dikemas kini kepada nama baharu.`,
  emptyName: 'Taip nama dahulu.', taken: 'Nama itu sudah ada dalam senarai.',
  renamed: n => (n ? `Dinamakan semula. ${n} hartanah dikemas kini.` : 'Dinamakan semula.'),
};

const zh: C036 = {
  edit: x => `编辑 ${x}`, remove: x => `删除 ${x}`, editField: f => `更改${f}`, clearField: f => `清除${f}`,
  renameLabel: '新名称', save: '保存', cancel: '取消', del: '删除', editInstead: '编辑', continueDel: '继续删除', rename: '重命名',
  simpleQ: x => `删除“${x}”？`, simpleBody: '它会从此列表中移除。',
  fieldQ: '删除这个值？', fieldBody: '此栏会被清空。保存表格后更改才会生效。',
  belowQ: x => `删除“${x}”及其下保存的内容？`,
  belowBody: n => `删除它也会移除其下关联保存的 ${n} 个条目（例如其花园和路名）。如果只是打错字，请改用编辑：所有关联内容都会保留。`,
  propsQ: n => `${n} 个房产使用此项`,
  propsBody: n => `${n === 1 ? '此房产' : `这 ${n} 个房产`}将失去这部分地址及其以下的所有内容。如要修正错字，请改用重命名：房产会更新为新名称。`,
  emptyName: '请先输入名称。', taken: '列表中已有此名称。',
  renamed: n => (n ? `已重命名。已更新 ${n} 个房产。` : '已重命名。'),
};

export const c036Strings: Record<Lang, C036> = { en, bm, zh };
