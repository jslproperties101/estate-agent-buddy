// v1buddychange015 (Batch I): words for Viewing Rush. BM / ZH to be checked by a native speaker.
import type { Lang } from '../../i18n';

const en = {
  title: 'Viewing Rush',
  blurb: 'Drive across a 3D town to reach each buyer viewing in time.',
  intro: 'Your buyers are waiting. Drive to each viewing before the clock runs out.',
  how1: 'Hold the left and right pads to steer. The car drives forward by itself.', how2: 'Follow the gold arrow to the glowing gold beacon.', how3: 'Each viewing adds 10 seconds. Arrive fast for bonus points.',
  start: 'Start driving', back: 'Back to Games', resume: 'Keep driving', finish: 'Finish round', pause: 'Pause', paused: 'Paused',
  time: 'Time', score: 'Score', viewings: 'Viewings', brake: 'Brake', left: 'Steer left', right: 'Steer right',
  next: 'Next viewing', done: 'Viewing done!', fast: 'Fast arrival', bump: 'Bump!', slow: 'Mind the buildings',
  sample: 'Practice game with sample buyers. Not real appointments.', noGl: 'This phone could not start the 3D view.',
};
type S = typeof en;
const bm: S = {
  title: 'Kejar Tinjauan',
  blurb: 'Pandu merentasi bandar 3D untuk tiba di setiap tinjauan pembeli tepat pada masa.',
  intro: 'Pembeli sedang menunggu. Pandu ke setiap tinjauan sebelum masa tamat.',
  how1: 'Tekan pad kiri dan kanan untuk membelok. Kereta bergerak ke hadapan sendiri.', how2: 'Ikut anak panah emas ke suar emas yang bercahaya.', how3: 'Setiap tinjauan menambah 10 saat. Sampai cepat untuk mata bonus.',
  start: 'Mula memandu', back: 'Kembali ke Permainan', resume: 'Teruskan', finish: 'Tamatkan pusingan', pause: 'Jeda', paused: 'Dijeda',
  time: 'Masa', score: 'Mata', viewings: 'Tinjauan', brake: 'Brek', left: 'Belok kiri', right: 'Belok kanan',
  next: 'Tinjauan seterusnya', done: 'Tinjauan selesai!', fast: 'Sampai pantas', bump: 'Langgar!', slow: 'Jaga-jaga bangunan',
  sample: 'Permainan latihan dengan pembeli contoh. Bukan temu janji sebenar.', noGl: 'Telefon ini tidak dapat membuka paparan 3D.',
};
const zh: S = {
  title: '看房冲刺',
  blurb: '在 3D 城市中开车，准时赶到每位买家的看房地点。',
  intro: '买家正在等你。在时间结束前开车赶到每一场看房。',
  how1: '按住左右按钮转向，车子会自动前进。', how2: '跟着金色箭头开到发光的金色信标。', how3: '每完成一场看房加 10 秒，越快到达奖励越多。',
  start: '开始驾驶', back: '返回游戏列表', resume: '继续驾驶', finish: '结束本局', pause: '暂停', paused: '已暂停',
  time: '时间', score: '得分', viewings: '看房', brake: '刹车', left: '向左转', right: '向右转',
  next: '下一场看房', done: '看房完成！', fast: '快速到达', bump: '撞到了！', slow: '小心建筑物',
  sample: '使用示例买家的练习游戏，并非真实预约。', noGl: '这部手机无法打开 3D 画面。',
};
export const vrStrings: Record<Lang, S> = { en, bm, zh };
