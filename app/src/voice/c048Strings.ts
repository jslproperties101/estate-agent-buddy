// JoyChange002 Changes 48 and 50: the AI Assisted Command screen and the property / contact choosers, in three languages.
import type { Lang } from '../i18n';

interface Group { title: string; examples: string[] }
const en = {
  howTo: 'How to use and examples', hideHowTo: 'Hide how to use',
  howIntro: 'Type, or tap the microphone and speak. What you said goes into the box above so you can fix it; nothing happens until you tap the send arrow. Then the app shows what it understood, and nothing is saved until you confirm.',
  send: 'Show proposed details', speak: 'Speak', listening: 'Listening… speak now. Tap the microphone to stop.', working: 'Writing down what you said…', gettingReady: 'Getting ready… wait for the sound, then speak.',
  tapToUse: 'Tap an example to put it in the box.',
  note: 'Commands are understood in English and Bahasa Malaysia. Chinese speech becomes text, but its commands are not understood yet.',
  diag: 'Voice not working? Open Voice diagnostics',
  groups: [
    { title: 'Add a new property', examples: ['Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold, owner Encik Ahmad 012 345 6789'] },
    { title: 'Find properties', examples: ['Find the factory in Salak Tinggi', 'Show condos for rent in Putra Nilai'] },
    { title: 'Change a property', examples: ['Set the asking price of P1001 to RM3 million', 'Change the status of P1001 to Sold', 'Change the status of the house at Jalan Seriemas 1 to Rented'] },
    { title: 'To-do and calendar', examples: ['Remind me to call Buyer K tomorrow at 3pm', 'Schedule a viewing for P1001 with Buyer K on Friday at 11am', 'Show my appointments tomorrow'] },
    { title: 'Buyers and contacts', examples: ['Add a new buyer Lim 012 888 7777', 'Find buyers looking for a factory in Salak Tinggi'] },
  ] as Group[],
  // Change 50
  property: 'Property', newProperty: 'Create a new property listing', contact: 'Contact', newContact: 'Create a new contact',
  best: 'Best match', openExisting: 'Open this property with these details', toForm: 'Open in the form to check',
  chooseProperty: 'Which property? The best match is chosen; tap to choose another.', chooseContact: 'Which contact? The best match is chosen; tap to choose another.',
  noMatchProperty: 'No property matches what you said, so a new listing is suggested. You can choose an existing one instead.',
  noMatchContact: 'No saved contact matches, so a new contact is suggested. You can choose a saved one instead.',
  noId: 'No ID', vendor: 'Vendor', buyer: 'Buyer',
};
export type C048 = typeof en;

const bm: C048 = {
  howTo: 'Cara guna dan contoh', hideHowTo: 'Sembunyi cara guna',
  howIntro: 'Taip, atau tekan mikrofon dan bercakap. Apa yang anda sebut masuk ke kotak di atas supaya boleh dibetulkan; tiada apa berlaku sehingga anda tekan anak panah hantar. Kemudian aplikasi menunjukkan apa yang difahami, dan tiada apa disimpan sehingga anda sahkan.',
  send: 'Tunjuk butiran dicadangkan', speak: 'Bercakap', listening: 'Sedang mendengar… bercakap sekarang. Tekan mikrofon untuk berhenti.', working: 'Menulis apa yang anda sebut…', gettingReady: 'Sedang bersedia… tunggu bunyi, kemudian bercakap.',
  tapToUse: 'Tekan contoh untuk memasukkannya ke kotak.',
  note: 'Arahan difahami dalam Bahasa Inggeris dan Bahasa Malaysia. Pertuturan Cina menjadi teks tetapi arahannya belum difahami.',
  diag: 'Suara tidak berfungsi? Buka Diagnostik suara',
  groups: [
    { title: 'Tambah hartanah baharu', examples: ['Cipta rumah teres baharu di Putra Nilai, harga lima ratus lapan puluh ribu ringgit, empat bilik tidur, pegangan bebas'] },
    { title: 'Cari hartanah', examples: ['Cari kilang di Salak Tinggi'] },
    { title: 'Ubah hartanah', examples: ['Tukar harga P1001 kepada RM3 juta', 'Tukar status P1001 kepada terjual'] },
    { title: 'Tugasan dan kalendar', examples: ['Ingatkan saya telefon Buyer K esok pukul 3 petang', 'Atur lawatan untuk P1001 dengan Buyer K hari Jumaat pukul 11 pagi', 'Tunjuk temujanji esok'] },
    { title: 'Pembeli dan kenalan', examples: ['Tambah pembeli baharu Lim 012 888 7777', 'Cari pembeli yang mencari kilang di Salak Tinggi'] },
  ],
  property: 'Hartanah', newProperty: 'Cipta senarai hartanah baharu', contact: 'Kenalan', newContact: 'Cipta kenalan baharu',
  best: 'Padanan terbaik', openExisting: 'Buka hartanah ini dengan butiran ini', toForm: 'Buka dalam borang untuk disemak',
  chooseProperty: 'Hartanah yang mana? Padanan terbaik dipilih; tekan untuk memilih yang lain.', chooseContact: 'Kenalan yang mana? Padanan terbaik dipilih; tekan untuk memilih yang lain.',
  noMatchProperty: 'Tiada hartanah sepadan, jadi senarai baharu dicadangkan. Anda boleh memilih yang sedia ada.',
  noMatchContact: 'Tiada kenalan tersimpan yang sepadan, jadi kenalan baharu dicadangkan. Anda boleh memilih yang tersimpan.',
  noId: 'Tiada ID', vendor: 'Penjual', buyer: 'Pembeli',
};

const zh: C048 = {
  howTo: '使用方法和示例', hideHowTo: '隐藏使用方法',
  howIntro: '输入文字，或点击麦克风说话。您说的话会进入上面的输入框，方便修改；点击发送箭头之前不会有任何操作。之后应用会显示理解的内容，确认前不会保存。',
  send: '显示建议的资料', speak: '说话', listening: '正在聆听…请说话。点击麦克风停止。', working: '正在记录您说的话…', gettingReady: '正在准备…听到提示音后再说话。',
  tapToUse: '点击示例即可放入输入框。',
  note: '命令目前可识别英文和马来文。中文语音会转成文字，但其命令暂时无法理解。',
  diag: '语音不能用？打开语音诊断',
  groups: [
    { title: '新增房产', examples: ['Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold'] },
    { title: '查找房产', examples: ['Find the factory in Salak Tinggi'] },
    { title: '修改房产', examples: ['Set the asking price of P1001 to RM3 million', 'Change the status of P1001 to Sold'] },
    { title: '待办和日历', examples: ['Remind me to call Buyer K tomorrow at 3pm', 'Schedule a viewing for P1001 with Buyer K on Friday at 11am'] },
    { title: '买家和联系人', examples: ['Add a new buyer Lim 012 888 7777', 'Find buyers looking for a factory in Salak Tinggi'] },
  ],
  property: '房产', newProperty: '新建房产挂牌', contact: '联系人', newContact: '新建联系人',
  best: '最佳匹配', openExisting: '用这些资料打开此房产', toForm: '在表格中打开以检查',
  chooseProperty: '是哪个房产？已选最佳匹配；点击可选择其他。', chooseContact: '是哪位联系人？已选最佳匹配；点击可选择其他。',
  noMatchProperty: '没有符合的房产，因此建议新建挂牌。您也可以选择已有的房产。',
  noMatchContact: '没有符合的已存联系人，因此建议新建联系人。您也可以选择已存的联系人。',
  noId: '无编号', vendor: '卖家', buyer: '买家',
};

export const c048Strings: Record<Lang, C048> = { en, bm, zh };
