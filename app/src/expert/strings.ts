// Ask Expert text, in three languages.
import type { Lang } from '../i18n';

const en = {
  title: 'Ask Expert',
  intro: 'Choose a specialist. Ask your own trusted expert on WhatsApp, record their answer here, or get an AI answer when the AI service is set up. Every answer is general guidance, not professional advice.',
  experts: { lawyer: 'Lawyer', banker: 'Banker', financial_advisor: 'Financial Advisor', tax_adviser: 'Tax Adviser', accountant: 'Accountant', valuer: 'Property Valuer', wealth_planner: 'Wealth Planner', agent_ai: 'Agent AI' } as Record<string, string>,
  topics: {
    lawyer: 'SPA, title, transfer, tenancy agreements', banker: 'Loans, eligibility, margins, valuations', financial_advisor: 'Affordability and cash flow',
    tax_adviser: 'RPGT, stamp duty, rental income tax', accountant: 'Records, income and expenses', valuer: 'Market value and comparables',
    wealth_planner: 'Property in a long-term plan', agent_ai: 'Listing copy, follow-ups, negotiation tips',
  } as Record<string, string>,
  previous: 'Previous questions', none: 'No questions yet.',
  ask: 'Your question', askPh: 'Type or speak your question…', property: 'About a property (optional)', save: 'Save question',
  disclaimer: (who: string) => `General guidance from ${who}. Not professional advice; check with a qualified professional before acting.`,
  you: 'You', viaWhatsApp: 'sent on WhatsApp', manual: 'recorded by you', ai: 'AI answer',
  sendTo: (who: string) => `Ask my ${who} on WhatsApp`,
  chooseExpert: (who: string) => `Choose your ${who} contact`,
  noExpertContacts: (who: string) => `No ${who} in your contacts yet. Add one as a contact with the role Professional.`,
  addExpertContact: '+ Add an expert contact',
  record: 'Record the answer received', answer: 'Answer', saveAnswer: 'Save answer',
  aiAsk: 'Get an AI answer', aiBusy: 'Asking…',
  aiOff: 'AI answers are not set up. They need your own AI service (Profile & Name Card → Settings → Ask Expert AI service); no AI key is ever stored in the app.',
  aiErr: 'The AI service did not answer. Try again later, or ask your expert on WhatsApp.',
  waText: (who: string, q: string, about?: string) => `Hi ${who}, I would like your advice${about ? ` on a property (${about})` : ''}:\n\n${q}\n\nThank you.`,
  deleteQ: 'Delete this question and its answers?',
};
export type ExpertStrings = typeof en;

const bm: ExpertStrings = {
  title: 'Tanya Pakar',
  intro: 'Pilih pakar. Tanya pakar yang anda percayai melalui WhatsApp, rekod jawapan mereka di sini, atau dapatkan jawapan AI apabila perkhidmatan AI disediakan. Setiap jawapan ialah panduan umum, bukan nasihat profesional.',
  experts: { lawyer: 'Peguam', banker: 'Pegawai Bank', financial_advisor: 'Penasihat Kewangan', tax_adviser: 'Penasihat Cukai', accountant: 'Akauntan', valuer: 'Penilai Hartanah', wealth_planner: 'Perancang Kekayaan', agent_ai: 'Ejen AI' },
  topics: {
    lawyer: 'SPA, hakmilik, pindah milik, perjanjian sewa', banker: 'Pinjaman, kelayakan, margin, penilaian', financial_advisor: 'Kemampuan dan aliran tunai',
    tax_adviser: 'CKHT, duti setem, cukai pendapatan sewa', accountant: 'Rekod, pendapatan dan perbelanjaan', valuer: 'Nilai pasaran dan perbandingan',
    wealth_planner: 'Hartanah dalam rancangan jangka panjang', agent_ai: 'Teks iklan, susulan, tip rundingan',
  },
  previous: 'Soalan sebelum ini', none: 'Belum ada soalan.',
  ask: 'Soalan anda', askPh: 'Taip atau sebut soalan anda…', property: 'Mengenai hartanah (pilihan)', save: 'Simpan soalan',
  disclaimer: (who: string) => `Panduan umum daripada ${who}. Bukan nasihat profesional; semak dengan profesional bertauliah sebelum bertindak.`,
  you: 'Anda', viaWhatsApp: 'dihantar melalui WhatsApp', manual: 'direkod oleh anda', ai: 'Jawapan AI',
  sendTo: (who: string) => `Tanya ${who} saya melalui WhatsApp`,
  chooseExpert: (who: string) => `Pilih kenalan ${who} anda`,
  noExpertContacts: (who: string) => `Belum ada ${who} dalam kenalan anda. Tambah sebagai kenalan dengan peranan Profesional.`,
  addExpertContact: '+ Tambah kenalan pakar',
  record: 'Rekod jawapan yang diterima', answer: 'Jawapan', saveAnswer: 'Simpan jawapan',
  aiAsk: 'Dapatkan jawapan AI', aiBusy: 'Sedang bertanya…',
  aiOff: 'Jawapan AI belum disediakan. Ia memerlukan perkhidmatan AI anda sendiri (Profil & Kad Nama → Tetapan → Perkhidmatan AI Tanya Pakar); kunci AI tidak pernah disimpan dalam aplikasi.',
  aiErr: 'Perkhidmatan AI tidak menjawab. Cuba lagi nanti, atau tanya pakar anda melalui WhatsApp.',
  waText: (who: string, q: string, about?: string) => `Hai ${who}, saya ingin mendapatkan nasihat anda${about ? ` mengenai hartanah (${about})` : ''}:\n\n${q}\n\nTerima kasih.`,
  deleteQ: 'Padam soalan ini dan jawapannya?',
};

const zh: ExpertStrings = {
  title: '咨询专家',
  intro: '选择专家。通过 WhatsApp 询问您信任的专家并在此记录回答，或在设置 AI 服务后获取 AI 回答。所有回答仅为一般指导，并非专业意见。',
  experts: { lawyer: '律师', banker: '银行人员', financial_advisor: '理财顾问', tax_adviser: '税务顾问', accountant: '会计师', valuer: '房产估价师', wealth_planner: '财富规划师', agent_ai: '代理 AI' },
  topics: {
    lawyer: '买卖合约、地契、过户、租约', banker: '贷款、资格、贷款比例、估价', financial_advisor: '负担能力与现金流',
    tax_adviser: '产业盈利税、印花税、租金所得税', accountant: '记录、收入与开支', valuer: '市值与比较',
    wealth_planner: '长期规划中的房产', agent_ai: '广告文案、跟进、谈判技巧',
  },
  previous: '以往问题', none: '还没有问题。',
  ask: '您的问题', askPh: '输入或说出您的问题…', property: '关于某个房产（可选）', save: '保存问题',
  disclaimer: (who: string) => `${who}提供的一般指导，并非专业意见；采取行动前请咨询合格的专业人士。`,
  you: '您', viaWhatsApp: '已通过 WhatsApp 发送', manual: '由您记录', ai: 'AI 回答',
  sendTo: (who: string) => `通过 WhatsApp 询问我的${who}`,
  chooseExpert: (who: string) => `选择您的${who}联系人`,
  noExpertContacts: (who: string) => `您的联系人中还没有${who}。请以“专业人士”角色添加联系人。`,
  addExpertContact: '+ 添加专家联系人',
  record: '记录收到的回答', answer: '回答', saveAnswer: '保存回答',
  aiAsk: '获取 AI 回答', aiBusy: '正在询问…',
  aiOff: '尚未设置 AI 回答。需要您自己的 AI 服务（个人资料与名片 → 设置 → 咨询专家 AI 服务）；应用中从不保存 AI 密钥。',
  aiErr: 'AI 服务没有回应。请稍后再试，或通过 WhatsApp 询问您的专家。',
  waText: (who: string, q: string, about?: string) => `${who}您好，我想请教您${about ? `关于一个房产（${about}）` : ''}：\n\n${q}\n\n谢谢。`,
  deleteQ: '删除此问题及其回答？',
};

export const expertStrings: Record<Lang, ExpertStrings> = { en, bm, zh };
