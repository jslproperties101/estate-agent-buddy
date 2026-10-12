// Supabase Edge Function: answers Ask Expert questions with Claude (Anthropic API).
// The API key stays here as a secret and never goes into the app.
//   supabase secrets set ANTHROPIC_API_KEY=...            (required)
//   supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5  (optional)
//   supabase functions deploy ask-expert
// Then put https://<project>.supabase.co/functions/v1/ask-expert in the app (Settings → Ask Expert AI service,
// or EAB_EXPERT_API_URL). Supabase checks the caller's token before this code runs.
// Not deployed or tested against a live project yet. Usage is billed by Anthropic: set a spending limit first.

const ROLES: Record<string, string> = {
  lawyer: 'a Malaysian conveyancing lawyer', banker: 'a Malaysian mortgage banker', financial_advisor: 'a licensed Malaysian financial advisor',
  tax_adviser: 'a Malaysian tax adviser (RPGT, stamp duty, rental income)', accountant: 'a Malaysian accountant',
  valuer: 'a registered Malaysian property valuer', wealth_planner: 'a Malaysian wealth planner',
  agent_ai: 'an experienced Malaysian real estate negotiator helping a fellow agent',
};
const LANG: Record<string, string> = { en: 'English', bm: 'Bahasa Malaysia', zh: 'Simplified Chinese' };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { expert, question, context, lang, history } = await req.json();
    if (!ROLES[expert] || typeof question !== 'string' || !question.trim() || question.length > 4000) return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: cors });
    const system = `You are ${ROLES[expert]}. Give clear, practical general guidance for a property agent in Malaysia. ` +
      `Say when something must be confirmed with a qualified professional or the authorities, and do not invent figures or laws. ` +
      `Answer in ${LANG[lang] ?? 'English'}, in under 250 words.` + (context ? `\nProperty facts: ${String(context).slice(0, 1000)}` : '');
    const messages = [
      { role: 'user', content: question },
      ...((Array.isArray(history) ? history : []).slice(-6).map((m: { from: string; text: string }) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: String(m.text).slice(0, 4000) }))),
    ];
    // The conversation must alternate and end with the user; keep the first question if the history breaks that.
    const clean = messages.filter((m, i) => i === 0 || m.role !== messages[i - 1].role);
    if (clean[clean.length - 1].role !== 'user') clean.push({ role: 'user', content: 'Please continue.' });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: 800, system, messages: clean }),
    });
    if (!r.ok) return new Response(JSON.stringify({ error: `upstream ${r.status}` }), { status: 502, headers: cors });
    const j = await r.json();
    const answer = (j.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim();
    return new Response(JSON.stringify({ answer }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
