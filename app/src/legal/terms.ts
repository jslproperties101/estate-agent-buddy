// Terms and Conditions shown from the first-login screen (JoyChange005-Main Part2, draft v1.0, with the location clause
// of Part5 inserted after "Records and audit trail" and the sections renumbered). DRAFT written by Claude: it must be
// reviewed by a Malaysian lawyer before release. The version is "1.1-draft" so that the reviewed text, published as a new
// version, is accepted again by everyone. {COMPANY_NAME}, the email and the address come from the shared settings
// (eab_settings in the company's database), never from the code.
import type { Lang } from '../i18n';

export const TERMS_VERSION = '1.1-draft';

type Sec = [string, string];
const EN: { title: string; meta: string; sections: Sec[] } = {
  title: 'TERMS AND CONDITIONS — EA AI Buddy',
  meta: 'Version 1.1 (draft) | Effective: [date of release]',
  sections: [
    ['1. About these Terms', 'These Terms govern your use of the EA AI Buddy app ("the App"), operated by {COMPANY_NAME} ("we", "us"). By ticking the agreement box and using the App, you agree to these Terms. If you do not agree, do not use the App.'],
    ['2. Who may use the App', 'The App is for real estate agents, negotiators and their teams. You must be at least 18 years old. You are responsible for holding any registration or licence required by law (for example, with the Board of Valuers, Appraisers, Estate Agents and Property Managers in Malaysia) and for keeping it valid.'],
    ['3. Your account', 'You must give accurate information and keep your login secure. You are responsible for everything done under your account. Tell us immediately if you suspect unauthorised use.'],
    ['4. Your listings and content', 'You are fully responsible for every listing, photo, price, description and other content you add. Content must be true, accurate and not misleading, and you must have the owner\'s permission to advertise a property. You must not post false, fraudulent, discriminatory, infringing or unlawful content. You give us a licence to store, display and process your content to run the App.'],
    ['5. Records and audit trail', 'To meet legal and regulatory duties, we keep records of accounts, listings, edits and activity, including deleted items, for at least 7 years. We may disclose these records to the authorities, including the police and Jabatan Penilaian dan Perkhidmatan Harta, when required by law or to investigate misleading or unlawful listings.'],
    ['6. Location', 'If you allow location access, we record your device\'s location when you log in. We use it to help keep accounts secure, detect unusual logins, and meet our record-keeping duties. Location is only requested when you use the location map feature, and you can refuse or turn it off in your phone settings at any time; the App will still work. Location records are kept as described in the Records and audit trail section and handled under our Privacy Notice.'],
    ['7. Acceptable use', 'You must not misuse the App, attempt to access other users\' data, reverse-engineer the App, overload our systems, or use the App to send spam.'],
    ['8. AI features', 'AI-assisted features may make mistakes. Always check AI-generated content and actions before relying on or publishing them. You remain responsible for the final content.'],
    ['9. Projects shared by administrators', 'Projects shared with you by an administrator or your agency remain their property. Access may be withdrawn at any time, and the project will then be removed from your App without archiving.'],
    ['10. Subscriptions and payments', 'Some features may require a paid subscription. Prices, billing periods and refund terms will be shown before you pay. Fees are subject to applicable taxes, including SST.'],
    ['11. Privacy', 'We handle your personal data under the Personal Data Protection Act 2010 and our Privacy Notice. Promotional messages are sent only if you opt in; you can opt out anytime. Service, security and legal notices are sent to all users.'],
    ['12. Third-party services', 'The App uses third-party services such as Google, Supabase and cloud storage providers. Their own terms may also apply.'],
    ['13. Suspension and termination', 'We may suspend or close accounts that break these Terms or the law. Records will still be kept as described in section 5.'],
    ['14. Disclaimer and limitation of liability', 'The App is provided "as is". To the extent permitted by law, we are not liable for indirect or consequential losses, lost deals, or losses caused by content added by users.'],
    ['15. Changes to these Terms', 'We may update these Terms. We will notify you in the App, and you may be asked to accept the new version to keep using it.'],
    ['16. Governing law', 'These Terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction.'],
    ['17. Contact', '{COMPANY_NAME} — {EMAIL} — {ADDRESS}'],
  ],
};
const BM: typeof EN = {
  title: 'TERMA DAN SYARAT — EA AI Buddy',
  meta: 'Versi 1.1 (draf) | Berkuat kuasa: [tarikh keluaran]',
  sections: [
    ['1. Mengenai Terma ini', 'Terma ini mengawal penggunaan aplikasi EA AI Buddy ("Aplikasi") yang dikendalikan oleh {COMPANY_NAME} ("kami"). Dengan menanda kotak persetujuan dan menggunakan Aplikasi, anda bersetuju dengan Terma ini. Jika anda tidak bersetuju, jangan gunakan Aplikasi.'],
    ['2. Siapa boleh menggunakan Aplikasi', 'Aplikasi ini untuk ejen hartanah, perunding dan pasukan mereka. Anda mesti berumur sekurang-kurangnya 18 tahun. Anda bertanggungjawab memiliki dan mengekalkan sebarang pendaftaran atau lesen yang diwajibkan oleh undang-undang (contohnya dengan Lembaga Penilai, Pentaksir, Ejen Harta Tanah dan Pengurus Harta).'],
    ['3. Akaun anda', 'Anda mesti memberikan maklumat yang tepat dan menjaga keselamatan log masuk anda. Anda bertanggungjawab atas semua tindakan di bawah akaun anda. Maklumkan kami segera jika anda mengesyaki penggunaan tanpa kebenaran.'],
    ['4. Iklan dan kandungan anda', 'Anda bertanggungjawab sepenuhnya atas setiap iklan, gambar, harga, keterangan dan kandungan lain yang anda tambah. Kandungan mesti benar, tepat dan tidak mengelirukan, dan anda mesti mendapat kebenaran pemilik untuk mengiklankan hartanah. Anda tidak boleh menyiarkan kandungan palsu, menipu, diskriminasi, melanggar hak atau menyalahi undang-undang. Anda memberi kami lesen untuk menyimpan, memaparkan dan memproses kandungan anda bagi menjalankan Aplikasi.'],
    ['5. Rekod dan jejak audit', 'Bagi mematuhi kewajipan undang-undang, kami menyimpan rekod akaun, iklan, suntingan dan aktiviti, termasuk item yang dipadam, sekurang-kurangnya 7 tahun. Kami boleh mendedahkan rekod ini kepada pihak berkuasa, termasuk polis dan Jabatan Penilaian dan Perkhidmatan Harta, apabila dikehendaki oleh undang-undang atau untuk menyiasat iklan yang mengelirukan atau menyalahi undang-undang.'],
    ['6. Lokasi', 'Jika anda membenarkan akses lokasi, kami merekodkan lokasi peranti anda semasa anda log masuk. Kami menggunakannya untuk membantu memastikan keselamatan akaun, mengesan log masuk luar biasa, dan memenuhi kewajipan penyimpanan rekod kami. Lokasi hanya diminta apabila anda menggunakan ciri peta lokasi, dan anda boleh menolak atau mematikannya dalam tetapan telefon pada bila-bila masa; Aplikasi masih akan berfungsi. Rekod lokasi disimpan seperti yang dinyatakan dalam seksyen Rekod dan jejak audit dan dikendalikan di bawah Notis Privasi kami.'],
    ['7. Penggunaan yang dibenarkan', 'Anda tidak boleh menyalahgunakan Aplikasi, cuba mengakses data pengguna lain, membuat kejuruteraan balikan, membebankan sistem kami, atau menggunakan Aplikasi untuk menghantar spam.'],
    ['8. Ciri AI', 'Ciri berbantukan AI mungkin membuat kesilapan. Sentiasa semak kandungan dan tindakan AI sebelum bergantung padanya atau menyiarkannya. Anda kekal bertanggungjawab atas kandungan akhir.'],
    ['9. Projek yang dikongsi oleh pentadbir', 'Projek yang dikongsi oleh pentadbir atau agensi anda kekal milik mereka. Akses boleh ditarik balik pada bila-bila masa, dan projek akan dikeluarkan daripada Aplikasi anda tanpa diarkibkan.'],
    ['10. Langganan dan bayaran', 'Sesetengah ciri mungkin memerlukan langganan berbayar. Harga, tempoh bil dan terma bayaran balik akan dipaparkan sebelum anda membayar. Yuran tertakluk kepada cukai yang berkenaan, termasuk SST.'],
    ['11. Privasi', 'Kami mengendalikan data peribadi anda di bawah Akta Perlindungan Data Peribadi 2010 dan Notis Privasi kami. Mesej promosi hanya dihantar jika anda bersetuju; anda boleh menarik diri pada bila-bila masa. Notis perkhidmatan, keselamatan dan undang-undang dihantar kepada semua pengguna.'],
    ['12. Perkhidmatan pihak ketiga', 'Aplikasi menggunakan perkhidmatan pihak ketiga seperti Google, Supabase dan penyedia storan awan. Terma mereka juga mungkin terpakai.'],
    ['13. Penggantungan dan penamatan', 'Kami boleh menggantung atau menutup akaun yang melanggar Terma ini atau undang-undang. Rekod akan tetap disimpan seperti dalam seksyen 5.'],
    ['14. Penafian dan had liabiliti', 'Aplikasi disediakan "seadanya". Setakat yang dibenarkan undang-undang, kami tidak bertanggungjawab atas kerugian tidak langsung atau berbangkit, urus niaga yang terlepas, atau kerugian akibat kandungan yang ditambah oleh pengguna.'],
    ['15. Perubahan Terma', 'Kami boleh mengemas kini Terma ini. Kami akan memaklumkan anda dalam Aplikasi, dan anda mungkin diminta menerima versi baharu untuk terus menggunakannya.'],
    ['16. Undang-undang yang mentadbir', 'Terma ini ditadbir oleh undang-undang Malaysia, dan mahkamah Malaysia mempunyai bidang kuasa.'],
    ['17. Hubungi', '{COMPANY_NAME} — {EMAIL} — {ADDRESS}'],
  ],
};
const ZH: typeof EN = {
  title: '条款与条件 — EA AI Buddy',
  meta: '版本 1.1（草稿）| 生效日期：[发布日期]',
  sections: [
    ['1. 关于本条款', '本条款规范您对由 {COMPANY_NAME}（"我们"）运营的 EA AI Buddy 应用程序（"本应用"）的使用。勾选同意框并使用本应用，即表示您同意本条款。如不同意，请勿使用本应用。'],
    ['2. 使用资格', '本应用供房地产经纪人、谈判员及其团队使用。您必须年满18岁。您有责任持有并维持法律要求的任何注册或执照（例如马来西亚估价师、评估师、房地产经纪人及物业管理人局）。'],
    ['3. 您的账户', '您必须提供准确信息并妥善保管登录凭证。您须对账户下的一切行为负责。如怀疑账户被盗用，请立即通知我们。'],
    ['4. 您的房源与内容', '您须对所添加的每个房源、照片、价格、描述及其他内容承担全部责任。内容必须真实、准确且不具误导性，并须获得业主授权方可刊登房产广告。您不得发布虚假、欺诈、歧视、侵权或违法内容。您授予我们为运营本应用而存储、展示及处理您内容的许可。'],
    ['5. 记录与审计追踪', '为履行法律及监管义务，我们会保存账户、房源、编辑及活动记录（包括已删除项目）至少7年。在法律要求或为调查误导性或违法房源时，我们可能向有关当局（包括警方及估价与产业服务局）披露这些记录。'],
    ['6. 位置信息', '如果您允许位置访问，我们会在您登录时记录您设备的位置。我们使用该信息来帮助保障账户安全、发现异常登录，并履行我们的记录保存义务。仅在您使用位置地图功能时才会请求位置权限，您可随时拒绝或在手机设置中关闭；本应用仍可正常使用。位置记录将按"记录与审计追踪"部分所述保存，并依据我们的隐私声明处理。'],
    ['7. 合理使用', '您不得滥用本应用、试图访问其他用户数据、对本应用进行逆向工程、使系统超载，或利用本应用发送垃圾信息。'],
    ['8. AI 功能', 'AI 辅助功能可能出错。在依赖或发布 AI 生成的内容和操作前，请务必核对。您仍须对最终内容负责。'],
    ['9. 管理员共享的项目', '由管理员或您的机构共享的项目仍归其所有。访问权限可随时撤回，届时该项目将从您的应用中移除，不会存档。'],
    ['10. 订阅与付款', '部分功能可能需要付费订阅。价格、计费周期及退款条款将在付款前显示。费用须缴纳适用税项，包括 SST。'],
    ['11. 隐私', '我们依据《2010年个人资料保护法令》及我们的隐私声明处理您的个人资料。仅在您选择同意后才会发送推广信息，您可随时退订。服务、安全及法律通知将发送给所有用户。'],
    ['12. 第三方服务', '本应用使用 Google、Supabase 及云存储等第三方服务，其条款亦可能适用。'],
    ['13. 暂停与终止', '对于违反本条款或法律的账户，我们可暂停或关闭。相关记录仍将按第5条保存。'],
    ['14. 免责声明与责任限制', '本应用按"现状"提供。在法律允许范围内，我们不对间接或后果性损失、错失交易或因用户添加内容造成的损失承担责任。'],
    ['15. 条款变更', '我们可能更新本条款，并会在应用内通知您；您可能需要接受新版本方可继续使用。'],
    ['16. 适用法律', '本条款受马来西亚法律管辖，马来西亚法院拥有管辖权。'],
    ['17. 联系方式', '{COMPANY_NAME} — {EMAIL} — {ADDRESS}'],
  ],
};

const BY_LANG: Record<Lang, typeof EN> = { en: EN, bm: BM, zh: ZH };
const MISSING: Record<Lang, { email: string; address: string; company: string }> = {
  en: { email: '[email address]', address: '[business address]', company: 'the operator of EA AI Buddy' },
  bm: { email: '[alamat e-mel]', address: '[alamat perniagaan]', company: 'pengendali EA AI Buddy' },
  zh: { email: '[电子邮箱]', address: '[营业地址]', company: 'EA AI Buddy 的运营方' },
};

/** The Terms in one language, with the company name, email and address from the shared settings. */
export function termsText(lang: Lang, s: { company?: string | null; email?: string | null; address?: string | null }) {
  const t = BY_LANG[lang];
  const m = MISSING[lang];
  const fill = (x: string) => x.replace(/\{COMPANY_NAME\}/g, s.company || m.company).replace('{EMAIL}', s.email || m.email).replace('{ADDRESS}', s.address || m.address);
  return { title: t.title, meta: t.meta, sections: t.sections.map(([h, b]) => [h, fill(b)] as Sec) };
}

/** The company name from the shared settings, or a neutral description while it is not known yet. */
export const companyOr = (lang: Lang, name?: string | null) => name || MISSING[lang].company;
