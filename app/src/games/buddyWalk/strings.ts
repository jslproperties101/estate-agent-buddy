// v1buddychange014: Buddy Walk's words in English, Bahasa Melayu and Chinese. BM / ZH to be checked by a native speaker.
// Property words (type names, Bedrooms, Land size, "/ month"...) come from the Subsale List's own words, so they match.
import type { Lang } from '../../i18n';

const en = {
  introTitle: 'Walk through your listings',
  introBody: 'Your saved listings hang in a gold gallery. Walk up to a frame and face it to see the listing’s key facts.',
  challengeTitle: 'Visit challenge',
  challengeBody: (n: number) => `Visit as many of your ${n === 1 ? '1 listing' : `${n} listings`} as you can in 60 seconds. Face a listing and stay a moment for it to count.`,
  startChallenge: 'Start the 60-second challenge',
  justWalk: 'Just walk around',
  howTo: 'Hold the arrow buttons, or drag on the picture: left and right to look, up and down to walk. On a computer: arrow keys or W A S D.',
  exit: 'Exit', finish: 'Finish',
  timeLeft: (s: number) => `${s} s left`,
  freeWalk: 'Free walk',
  visited: (v: number, n: number) => `Visited ${v} of ${n}`,
  fwd: 'Walk forward', back: 'Walk back', left: 'Turn left', right: 'Turn right',
  canvas: (n: number, facing?: string) => `3D gallery of ${n === 1 ? '1 listing' : `${n} listings`}.${facing ? ` In front of you: ${facing}.` : ' No listing in front of you.'}`,
  hint: 'Walk up to a gold frame and face it.',
  listingNo: (i: number, n: number) => `Listing ${i} of ${n}`,
  visiting: 'Visiting…', visitedTag: 'Visited',
  emptyTitle: 'No listings to walk through yet',
  emptyBody: 'Add a property in the Subsale List, or load sample data in Settings, then come back for a walk.',
  more: (n: number) => `Showing the first ${n} listings of your Subsale List.`,
};
type S = typeof en;

const bm: S = {
  introTitle: 'Berjalan melalui senarai anda',
  introBody: 'Senarai yang anda simpan tergantung dalam galeri emas. Berjalan ke sebuah bingkai dan hadapinya untuk melihat butiran utama senarai itu.',
  challengeTitle: 'Cabaran Lawatan',
  challengeBody: n => `Lawati seberapa banyak daripada ${n} senarai anda dalam 60 saat. Hadap sesuatu senarai dan tunggu sebentar supaya ia dikira.`,
  startChallenge: 'Mula cabaran 60 saat',
  justWalk: 'Berjalan sahaja',
  howTo: 'Tekan dan tahan butang anak panah, atau seret pada gambar: kiri dan kanan untuk melihat, atas dan bawah untuk berjalan. Di komputer: kekunci anak panah atau W A S D.',
  exit: 'Keluar', finish: 'Selesai',
  timeLeft: s => `${s} saat lagi`,
  freeWalk: 'Jalan bebas',
  visited: (v, n) => `Dilawati ${v} daripada ${n}`,
  fwd: 'Jalan ke depan', back: 'Jalan ke belakang', left: 'Pusing kiri', right: 'Pusing kanan',
  canvas: (n, facing) => `Galeri 3D dengan ${n} senarai.${facing ? ` Di hadapan anda: ${facing}.` : ' Tiada senarai di hadapan anda.'}`,
  hint: 'Berjalan ke bingkai emas dan hadapinya.',
  listingNo: (i, n) => `Senarai ${i} daripada ${n}`,
  visiting: 'Sedang melawat…', visitedTag: 'Dilawati',
  emptyTitle: 'Belum ada senarai untuk dilawati',
  emptyBody: 'Tambah hartanah dalam Senarai Subsale, atau muatkan data contoh di Tetapan, kemudian kembali untuk berjalan.',
  more: n => `Menunjukkan ${n} senarai pertama dalam Senarai Subsale anda.`,
};

const zh: S = {
  introTitle: '漫步浏览您的房源',
  introBody: '您保存的房源挂在一条金色画廊里。走到相框前并面向它，即可查看该房源的主要信息。',
  challengeTitle: '看房挑战',
  challengeBody: n => `在 60 秒内尽量多看您的 ${n} 个房源。面向一个房源并停留片刻即可计数。`,
  startChallenge: '开始 60 秒挑战',
  justWalk: '随便走走',
  howTo: '按住箭头按钮，或在画面上拖动：左右拖动转向，上下拖动行走。电脑上：方向键或 W A S D。',
  exit: '退出', finish: '完成',
  timeLeft: s => `剩余 ${s} 秒`,
  freeWalk: '自由漫步',
  visited: (v, n) => `已看 ${v} / ${n}`,
  fwd: '向前走', back: '向后走', left: '向左转', right: '向右转',
  canvas: (n, facing) => `3D 画廊，共 ${n} 个房源。${facing ? `您面前：${facing}。` : '您面前没有房源。'}`,
  hint: '走到金色相框前并面向它。',
  listingNo: (i, n) => `第 ${i} 个，共 ${n} 个`,
  visiting: '正在看房…', visitedTag: '已看',
  emptyTitle: '还没有可浏览的房源',
  emptyBody: '请先在二手房列表中添加房产，或在设置中载入示例数据，然后再来漫步。',
  more: n => `显示二手房列表中的前 ${n} 个房源。`,
};

export const bwStrings: Record<Lang, S> = { en, bm, zh };
