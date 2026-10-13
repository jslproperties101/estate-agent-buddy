// Field Help: the short explanations behind the small "?" next to fields that may not be obvious.
// Every entry has the same four parts so explanations stay consistent across the app:
//   what   what the field means
//   enter  what to type or choose
//   eg     an example (optional)
//   why    why it matters (optional)
// BM and Chinese wording are drafts for the owner to check, like the rest of the app's translations.
import type { Lang } from '../i18n';

export interface HelpText { what: string; enter: string; eg?: string; why?: string }
type Topic = Record<Lang, HelpText>;

export const HELP_LABELS: Record<Lang, { open: (f: string) => string; close: string; enter: string; eg: string; why: string }> = {
  en: { open: f => `What is “${f}”?`, close: 'Close help', enter: 'Enter', eg: 'Example', why: 'Why it matters' },
  bm: { open: f => `Apakah “${f}”?`, close: 'Tutup bantuan', enter: 'Isi', eg: 'Contoh', why: 'Mengapa penting' },
  zh: { open: f => `“${f}”是什么？`, close: '关闭说明', enter: '填写', eg: '例子', why: '为什么重要' },
};

export const HELP: Record<string, Topic> = {
  refPrefix: {
    en: { what: 'The letters at the start of your own property reference.', enter: 'Choose a prefix, or add your own (letters only).', eg: 'P → P1001; IND → IND1001', why: 'Lets you group listings and say a short code on the phone.' },
    bm: { what: 'Huruf di permulaan rujukan hartanah anda sendiri.', enter: 'Pilih awalan, atau tambah sendiri (huruf sahaja).', eg: 'P → P1001; IND → IND1001', why: 'Memudahkan anda mengumpul senarai dan menyebut kod pendek.' },
    zh: { what: '您自己的房产编号开头的字母。', enter: '选择前缀，或自行添加（仅字母）。', eg: 'P → P1001；IND → IND1001', why: '方便分组并在电话中说出简短编号。' },
  },
  refNo: {
    en: { what: 'The number part of the reference. Each number is used once.', enter: 'Keep the suggested number, or pick a free one (used numbers are red).', eg: '1001', why: 'A unique reference avoids mixing up two properties.' },
    bm: { what: 'Bahagian nombor rujukan. Setiap nombor digunakan sekali.', enter: 'Kekalkan nombor dicadangkan, atau pilih yang kosong (yang digunakan berwarna merah).', eg: '1001', why: 'Rujukan unik mengelakkan dua hartanah tertukar.' },
    zh: { what: '编号的数字部分，每个数字只用一次。', enter: '保留建议号码，或选择未用的号码（已用的为红色）。', eg: '1001', why: '唯一编号可避免混淆两个房产。' },
  },
  headline: {
    en: { what: 'A short title shown on the property card.', enter: 'Type, area and one selling point.', eg: 'Corner terrace, Putra Nilai, renovated', why: 'It is what you and buyers see first in the list.' },
    bm: { what: 'Tajuk ringkas pada kad hartanah.', enter: 'Jenis, kawasan dan satu kelebihan.', eg: 'Teres lot tepi, Putra Nilai, diubah suai', why: 'Inilah yang anda dan pembeli lihat dahulu.' },
    zh: { what: '房产卡片上显示的简短标题。', enter: '类型、地区和一个卖点。', eg: 'Putra Nilai 角头排屋，已装修', why: '这是您和买家在列表中最先看到的。' },
  },
  purpose: {
    en: { what: 'Whether the owner wants to sell, rent out, or both.', enter: 'For sale, for rent, or sale and rent.', why: 'Decides which price boxes appear (asking price or monthly rent).' },
    bm: { what: 'Sama ada pemilik mahu menjual, menyewakan, atau kedua-duanya.', enter: 'Dijual, disewa, atau jual dan sewa.', why: 'Menentukan kotak harga yang dipaparkan.' },
    zh: { what: '业主要出售、出租还是两者皆可。', enter: '出售、出租或买卖兼出租。', why: '决定显示哪些价格栏（售价或月租）。' },
  },
  tenure: {
    en: { what: 'How the land is owned: freehold (no end date) or leasehold (ends in a given year).', enter: 'Freehold or leasehold; for leasehold also the expiry year.', eg: 'Leasehold, expires 2097', why: 'Short remaining leases are harder to finance and sell.' },
    bm: { what: 'Cara tanah dimiliki: pegangan bebas (tiada tarikh tamat) atau pajakan (tamat pada tahun tertentu).', enter: 'Pegangan bebas atau pajakan; untuk pajakan, tahun tamat juga.', eg: 'Pajakan, tamat 2097', why: 'Baki pajakan pendek sukar dibiayai dan dijual.' },
    zh: { what: '土地拥有方式：永久地契（无期限）或租赁地契（到某年届满）。', enter: '永久地契或租赁地契；租赁地契还要填届满年份。', eg: '租赁地契，2097 年届满', why: '剩余年限短的产业较难贷款和出售。' },
  },
  leaseExpiryYear: {
    en: { what: 'The year the leasehold title ends (on the title or SPA).', enter: 'A four-digit year.', eg: '2097', why: 'The app works out the years left, which banks check.' },
    bm: { what: 'Tahun hakmilik pajakan tamat (pada geran atau SPA).', enter: 'Tahun empat digit.', eg: '2097', why: 'Aplikasi mengira baki tahun, yang disemak oleh bank.' },
    zh: { what: '租赁地契届满的年份（见地契或买卖合约）。', enter: '四位数年份。', eg: '2097', why: '应用会算出剩余年限，银行会查看。' },
  },
  titleType: {
    en: { what: 'The kind of land title document.', enter: 'Individual, strata, master title, etc.', eg: 'Strata title', why: 'Affects how quickly a sale can complete and whether a loan is possible.' },
    bm: { what: 'Jenis dokumen hakmilik tanah.', enter: 'Individu, strata, hakmilik induk, dll.', eg: 'Hakmilik strata', why: 'Mempengaruhi tempoh jualan dan kelulusan pinjaman.' },
    zh: { what: '地契文件的类型。', enter: '个别地契、分层地契、母地契等。', eg: '分层地契', why: '影响交易完成速度及能否贷款。' },
  },
  landUse: {
    en: { what: 'What the land may be used for (category of land use on the title).', enter: 'Building, agriculture, industry…', why: 'A buyer cannot use the land for something the title does not allow.' },
    bm: { what: 'Kegunaan tanah yang dibenarkan (kategori kegunaan tanah pada geran).', enter: 'Bangunan, pertanian, perusahaan…', why: 'Pembeli tidak boleh guna tanah selain yang dibenarkan geran.' },
    zh: { what: '土地允许的用途（地契上的土地用途类别）。', enter: '建筑、农业、工业……', why: '买家不能将土地用于地契不允许的用途。' },
  },
  restriction: {
    en: { what: 'Restriction in interest on the title, e.g. Bumiputera lot or state consent needed.', enter: 'Choose the restriction, or none.', eg: 'Bumiputera lot', why: 'Limits who can buy and adds time for consent.' },
    bm: { what: 'Sekatan kepentingan pada geran, contohnya lot Bumiputera atau perlu kebenaran negeri.', enter: 'Pilih sekatan, atau tiada.', eg: 'Lot Bumiputera', why: 'Mengehadkan pembeli dan menambah masa kebenaran.' },
    zh: { what: '地契上的权益限制，例如土著保留地或需州政府批准。', enter: '选择限制，或无。', eg: '土著单位', why: '限制可购买的人，并增加审批时间。' },
  },
  lotNo: {
    en: { what: 'The official lot number on the land title (not the house number).', enter: 'As written on the title.', eg: 'PT 12345', why: 'Identifies the exact land for lawyers and banks.' },
    bm: { what: 'Nombor lot rasmi pada geran (bukan nombor rumah).', enter: 'Seperti tertulis pada geran.', eg: 'PT 12345', why: 'Mengenal pasti tanah dengan tepat untuk peguam dan bank.' },
    zh: { what: '地契上的正式地段号（不是门牌号）。', enter: '照地契填写。', eg: 'PT 12345', why: '让律师和银行准确识别土地。' },
  },
  location: {
    en: { what: 'Where the property is on the map.', enter: 'Tap “Add from Google Map” and tap the spot, or use your current GPS position while standing there.', why: 'Used for the property map, navigation and House Shopping.' },
    bm: { what: 'Lokasi hartanah pada peta.', enter: 'Ketik “Tambah dari Google Map” dan ketik tempatnya, atau guna kedudukan GPS semasa ketika berada di situ.', why: 'Digunakan untuk peta hartanah, navigasi dan House Shopping.' },
    zh: { what: '房产在地图上的位置。', enter: '点按“从 Google 地图添加”并点选位置，或在现场使用当前 GPS 位置。', why: '用于房产地图、导航和看房路线。' },
  },
  landSqft: {
    en: { what: 'The land area, in square feet.', enter: 'Numbers only. For acres, multiply by 43,560.', eg: '1,540', why: 'Buyers compare price per square foot of land.' },
    bm: { what: 'Keluasan tanah, dalam kaki persegi.', enter: 'Nombor sahaja. Untuk ekar, darab 43,560.', eg: '1,540', why: 'Pembeli membandingkan harga sekaki persegi tanah.' },
    zh: { what: '土地面积（平方尺）。', enter: '只填数字。英亩乘以 43,560。', eg: '1,540', why: '买家会比较每平方尺地价。' },
  },
  builtUpSqft: {
    en: { what: 'The floor area of the building, in square feet.', enter: 'Numbers only, from the SPA, title or plan.', eg: '2,200', why: 'Used for price per square foot and to compare similar units.' },
    bm: { what: 'Keluasan lantai bangunan, dalam kaki persegi.', enter: 'Nombor sahaja, dari SPA, geran atau pelan.', eg: '2,200', why: 'Untuk harga sekaki persegi dan membandingkan unit.' },
    zh: { what: '建筑物的楼面面积（平方尺）。', enter: '只填数字，参照买卖合约、地契或图则。', eg: '2,200', why: '用于计算每平方尺价格和比较单位。' },
  },
  frontageFt: {
    en: { what: 'Width of the land along the road, in feet.', enter: 'Numbers only.', eg: '22', why: 'Wider frontage usually means more value and parking.' },
    bm: { what: 'Lebar tanah di sepanjang jalan, dalam kaki.', enter: 'Nombor sahaja.', eg: '22', why: 'Hadapan lebih lebar biasanya lebih bernilai.' },
    zh: { what: '土地临路的宽度（尺）。', enter: '只填数字。', eg: '22', why: '临路越宽通常价值越高、停车越多。' },
  },
  ceilingFt: {
    en: { what: 'Clear height inside a factory or warehouse, in feet.', enter: 'Numbers only.', eg: '30', why: 'Decides racking and machinery a tenant can fit.' },
    bm: { what: 'Ketinggian bersih dalam kilang atau gudang, dalam kaki.', enter: 'Nombor sahaja.', eg: '30', why: 'Menentukan rak dan mesin yang muat.' },
    zh: { what: '工厂或仓库内部净高（尺）。', enter: '只填数字。', eg: '30', why: '决定租户可放的货架和机器。' },
  },
  powerKva: {
    en: { what: 'Electricity supply capacity, in kVA.', enter: 'Numbers only, from the TNB bill or owner.', eg: '200', why: 'Manufacturing tenants need enough power; upgrades are costly.' },
    bm: { what: 'Kapasiti bekalan elektrik, dalam kVA.', enter: 'Nombor sahaja, dari bil TNB atau pemilik.', eg: '200', why: 'Penyewa kilang perlukan kuasa mencukupi; naik taraf mahal.' },
    zh: { what: '电力供应容量（kVA）。', enter: '只填数字，参照 TNB 账单或业主。', eg: '200', why: '制造业租户需要足够电力；升级费用高。' },
  },
  askingPrice: {
    en: { what: 'The price the owner is asking.', enter: 'Amount in RM.', eg: 'RM 580,000', why: 'Used for matching buyers, commission and the calculator.' },
    bm: { what: 'Harga yang diminta oleh pemilik.', enter: 'Jumlah dalam RM.', eg: 'RM 580,000', why: 'Untuk padanan pembeli, komisen dan kalkulator.' },
    zh: { what: '业主的叫价。', enter: '以 RM 计的金额。', eg: 'RM 580,000', why: '用于配对买家、佣金和计算器。' },
  },
  commissionPct: {
    en: { what: 'Your agreed commission as a percentage of the price.', enter: 'A percentage.', eg: '2', why: 'The app shows the commission in RM for Agent Financial.' },
    bm: { what: 'Komisen yang dipersetujui, peratus daripada harga.', enter: 'Peratus.', eg: '2', why: 'Aplikasi menunjukkan komisen dalam RM untuk Kewangan Ejen.' },
    zh: { what: '约定佣金占价格的百分比。', enter: '百分比。', eg: '2', why: '应用会以 RM 显示佣金，供财务使用。' },
  },
  securityDepositMonths: {
    en: { what: 'Security deposit, counted in months of rent.', enter: 'Number of months.', eg: '2', why: 'Shown to tenants as the RM amount they must pay upfront.' },
    bm: { what: 'Deposit sekuriti, dikira dalam bulan sewa.', enter: 'Bilangan bulan.', eg: '2', why: 'Ditunjukkan kepada penyewa sebagai jumlah RM pendahuluan.' },
    zh: { what: '押金，以月租计算。', enter: '月数。', eg: '2', why: '告诉租客需预付的 RM 金额。' },
  },
  utilityDepositMonths: {
    en: { what: 'Utility deposit (water, electricity), counted in months of rent.', enter: 'Number of months; often half a month.', eg: '0.5' },
    bm: { what: 'Deposit utiliti (air, elektrik), dikira dalam bulan sewa.', enter: 'Bilangan bulan; biasanya setengah bulan.', eg: '0.5' },
    zh: { what: '水电押金，以月租计算。', enter: '月数；通常为半个月。', eg: '0.5' },
  },
  maintenanceFee: {
    en: { what: 'Monthly maintenance and sinking fund for strata property.', enter: 'Monthly amount in RM.', eg: 'RM 280', why: 'Buyers and tenants include it in their monthly cost.' },
    bm: { what: 'Yuran penyelenggaraan dan kumpulan wang penjelas bulanan untuk hartanah strata.', enter: 'Jumlah bulanan dalam RM.', eg: 'RM 280', why: 'Pembeli dan penyewa mengambil kira kos bulanan.' },
    zh: { what: '分层产业每月的管理费和偿债基金。', enter: '每月 RM 金额。', eg: 'RM 280', why: '买家和租客会计入每月开支。' },
  },
  availability: {
    en: { what: 'When the property can be handed over.', enter: 'Vacant now, tenanted, or from a date.', why: 'Buyers who need to move in soon can be matched correctly.' },
    bm: { what: 'Bila hartanah boleh diserahkan.', enter: 'Kosong sekarang, disewa, atau mulai tarikh.', why: 'Pembeli yang perlu masuk segera dapat dipadankan.' },
    zh: { what: '房产何时可交屋。', enter: '现空置、已出租或某日起。', why: '可正确配对急需入住的买家。' },
  },
  vendorId: {
    en: { what: 'The owner (vendor or landlord) of this property, from your Contacts.', enter: 'Choose an existing vendor, or type a new owner’s name and phone below.', why: 'Keeps one record per owner, so follow-ups are in one place.' },
    bm: { what: 'Pemilik (penjual atau tuan rumah) hartanah ini, dari Kenalan anda.', enter: 'Pilih penjual sedia ada, atau taip nama dan telefon pemilik baharu di bawah.', why: 'Satu rekod bagi setiap pemilik, susulan di satu tempat.' },
    zh: { what: '此房产的业主（卖家或房东），来自联系人。', enter: '选择现有卖家，或在下方输入新业主的姓名和电话。', why: '每位业主只有一份记录，方便跟进。' },
  },
  arrangement: {
    en: { what: 'How you hold this listing: direct from the owner, co-broke with another agent, or exclusive.', enter: 'Choose one; for co-broke, note the other agent.', why: 'Affects commission sharing and who may advertise it.' },
    bm: { what: 'Cara anda memegang senarai ini: terus dari pemilik, co-broke dengan ejen lain, atau eksklusif.', enter: 'Pilih satu; untuk co-broke, catat ejen lain.', why: 'Mempengaruhi pembahagian komisen dan siapa boleh mengiklan.' },
    zh: { what: '您持有此盘的方式：业主直接委托、与其他经纪合作，或独家。', enter: '选择其一；合作盘请注明对方经纪。', why: '影响佣金分配及谁可以刊登广告。' },
  },
  bannerStatus: {
    en: { what: 'Whether your banner is placed at this property.', enter: 'Not placed, placed, or removed.', why: 'Shows on My Banner Location so you can track every banner.' },
    bm: { what: 'Sama ada banner anda dipasang di hartanah ini.', enter: 'Belum dipasang, dipasang, atau dibuka.', why: 'Dipaparkan di Lokasi Banner Saya untuk menjejak setiap banner.' },
    zh: { what: '是否已在此房产挂上您的横幅。', enter: '未挂、已挂或已撤。', why: '显示在“我的横幅位置”，方便追踪。' },
  },
  regNo: {
    en: { what: 'Your Board registration number as REN, PEA or REA.', enter: 'The number on your tag, without the letters.', eg: '12345', why: 'Required on name cards and adverts under Board of Valuers rules.' },
    bm: { what: 'Nombor pendaftaran Lembaga anda sebagai REN, PEA atau REA.', enter: 'Nombor pada tag anda, tanpa huruf.', eg: '12345', why: 'Wajib pada kad nama dan iklan di bawah peraturan Lembaga Penilai.' },
    zh: { what: '您在估价师局的注册号码（REN、PEA 或 REA）。', enter: '名牌上的号码，不含字母。', eg: '12345', why: '根据估价师局规定，名片和广告必须显示。' },
  },
  whatsapp: {
    en: { what: 'The name this person uses on WhatsApp, if different from their real name.', enter: 'Their WhatsApp name or alias.', eg: '@KL Factory Hunter', why: 'Helps you find the chat when the WhatsApp name does not match.' },
    bm: { what: 'Nama yang orang ini guna di WhatsApp, jika berbeza dengan nama sebenar.', enter: 'Nama atau alias WhatsApp mereka.', eg: '@KL Factory Hunter', why: 'Membantu mencari perbualan jika nama WhatsApp berbeza.' },
    zh: { what: '此人在 WhatsApp 上使用的名字（若与真名不同）。', enter: '其 WhatsApp 名称或别名。', eg: '@KL Factory Hunter', why: '当 WhatsApp 名字不同时，方便找到对话。' },
  },
  buyerStatus: {
    en: { what: 'How likely this buyer is to buy soon.', enter: 'Cold, Warm, Hot, Dropped or Booked / Bought.', why: 'Lets you focus your calls on hot buyers first.' },
    bm: { what: 'Sejauh mana pembeli ini mungkin membeli tidak lama lagi.', enter: 'Sejuk, Suam, Panas, Digugurkan atau Ditempah / Dibeli.', why: 'Fokuskan panggilan kepada pembeli panas dahulu.' },
    zh: { what: '此买家近期购买的可能性。', enter: '冷、温、热、已放弃或已预订 / 已购买。', why: '让您优先联系热门买家。' },
  },
  vendorStatus: {
    en: { what: 'Where you are with this owner’s listing.', enter: 'Choose the next thing waiting, e.g. Pending Property Info or Pending Follow-up.', why: 'Shows at a glance which vendors need action.' },
    bm: { what: 'Status urusan anda dengan senarai pemilik ini.', enter: 'Pilih perkara seterusnya yang menunggu, cth. Menunggu Maklumat Hartanah atau Menunggu Susulan.', why: 'Menunjukkan penjual yang perlu tindakan.' },
    zh: { what: '您与此业主盘源的进展。', enter: '选择下一步待办，例如“待补房产资料”或“待跟进”。', why: '一眼看出哪些卖家需要处理。' },
  },
};
