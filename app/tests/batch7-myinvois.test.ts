// Batch 7c (9 Nov 2026): MyInvois v1.1 signing (supabase/functions/_shared/myinvois_sign.ts) and the myinvois function
// (supabase/functions/myinvois/handler.ts) against a stand-in LHDN. The certificate is made here with openssl for the test
// only (a stand-in CA named like LHDN's trial CA, and a company certificate with TIN and BRN); it is thrown away after.
// Not LHDN: nothing here proves LHDN accepts the signature.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createPublicKey, verify as rsaVerify } from 'node:crypto';
import { certProblems, importKey, readCert, signDocument, signingTime, unsignedText } from '../../supabase/functions/_shared/myinvois_sign';
import { handleMyinvois, resetForTests, type Deps } from '../../supabase/functions/myinvois/handler';
import { buildUBL } from '../src/buddy/einvoice';
import type { AcctEinvoice, AcctProfile } from '../src/buddy/model';

const TIN = 'C21234567890';
let dir = '', certPem = '', keyPem = '', pkcs1Pem = '', serialHex = '', otherCertPem = '', otherKeyPem = '';
const ossl = (...a: string[]) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'b7-myinvois-'));
  ossl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-days', '2', '-subj', '/C=MY/O=LHDNM/OU=Terms of use at http:\\/\\/www.posdigicert.com.my/CN=Trial LHDNM Sub CA V1');
  ossl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'co.key', '-out', 'co.csr', '-subj', `/C=MY/O=Example Realty Sdn Bhd/organizationIdentifier=${TIN}/serialNumber=202301012345/CN=Example Realty Sdn Bhd`);
  ossl('x509', '-req', '-in', 'co.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-set_serial', '0x5f3a9c11d2e4', '-days', '2', '-out', 'co.pem');
  ossl('rsa', '-in', 'co.key', '-traditional', '-out', 'co1.key');
  ossl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'x.key', '-out', 'x.pem', '-days', '2', '-subj', '/C=MY/O=Other/CN=Other');
  certPem = readFileSync(join(dir, 'co.pem'), 'utf8'); keyPem = readFileSync(join(dir, 'co.key'), 'utf8'); pkcs1Pem = readFileSync(join(dir, 'co1.key'), 'utf8');
  otherCertPem = readFileSync(join(dir, 'x.pem'), 'utf8'); otherKeyPem = readFileSync(join(dir, 'x.key'), 'utf8');
  serialHex = ossl('x509', '-in', 'co.pem', '-noout', '-serial').trim().split('=')[1];
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

const co: AcctProfile = { id: 'company', created: 0, updated: 0, msic: '68201', msicDesc: 'Real estate agents', party: { name: 'Example Realty Sdn Bhd', tin: TIN, brn: '202301012345', addr: 'Jalan Ampang', city: 'Kuala Lumpur', state: '14', postcode: '50450' } };
const einv: AcctEinvoice = {
  id: 'e1', created: 0, updated: 0, kind: 'single', refNo: 'INV-A-0001', date: '2026-11-09', time: '10:00:00', status: 'ready',
  buyer: { name: 'Tan Holdings Sdn Bhd', tin: 'C10987654320', brn: '201901023456', addr: '12 Jalan Desa', city: 'Kuala Lumpur', state: '14', postcode: '58100' },
  lines: [{ desc: 'Agency commission', qty: 1, price: 24000, taxPct: 8, cls: '022' }],
} as unknown as AcctEinvoice;
const NOW = Date.UTC(2026, 10, 9, 2, 3, 4, 567);

test('certificate: issuer as LHDN writes it (CN first), serial in decimal, subject with TIN and BRN', () => {
  const c = readCert(certPem);
  assert.equal(c.issuer, 'CN=Trial LHDNM Sub CA V1, OU=Terms of use at http://www.posdigicert.com.my, O=LHDNM, C=MY');
  assert.equal(c.serial, BigInt('0x' + serialHex).toString());
  assert.equal(c.subject, `CN=Example Realty Sdn Bhd, SERIALNUMBER=202301012345, OID.2.5.4.97=${TIN}, O=Example Realty Sdn Bhd, C=MY`);
  assert.deepEqual(certProblems(c, TIN), []);
  assert.match(certProblems(c, 'C99999999990').join(), /does not match/);
  assert.deepEqual(certProblems(readCert(otherCertPem), TIN), ['certificate subject has no organizationIdentifier (the TIN)', 'certificate subject has no serialNumber (the business registration number)']);
});

test('signing: digests, RSA-SHA256 signature, XAdES properties, and the document LHDN gets back after removing the signature', async () => {
  const doc = buildUBL(einv, co, '1.0');
  const cert = readCert(certPem);
  const s = await signDocument(doc, await importKey(keyPem), cert, NOW);
  const plain = unsignedText(doc);
  assert.equal(JSON.parse(plain).Invoice[0].InvoiceTypeCode[0].listVersionID, '1.1');
  const sha = (x: string | Buffer) => createHash('sha256').update(x).digest();
  assert.equal(s.docDigest, sha(plain).toString('base64'));
  assert.ok(rsaVerify('sha256', Buffer.from(plain), createPublicKey(certPem), Buffer.from(s.signature, 'base64')), 'signature checks with the certificate');
  assert.equal(s.certDigest, sha(Buffer.from(cert.der)).toString('base64'));
  const out = JSON.parse(s.text);
  const inv = out.Invoice[0];
  const sig = inv.UBLExtensions[0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0].SignatureInformation[0].Signature[0];
  const props = sig.Object[0].QualifyingProperties[0].SignedProperties;
  assert.equal(props[0].SignedSignatureProperties[0].SigningTime[0]._, '2026-11-09T02:03:04Z');
  assert.equal(props[0].SignedSignatureProperties[0].SigningCertificate[0].Cert[0].IssuerSerial[0].X509SerialNumber[0]._, cert.serial);
  assert.equal(s.propsDigest, sha(JSON.stringify({ Target: 'signature', SignedProperties: props })).toString('base64'));
  assert.equal(sig.SignedInfo[0].Reference[0].DigestValue[0]._, s.propsDigest);
  assert.equal(sig.SignedInfo[0].Reference[1].DigestValue[0]._, s.docDigest);
  assert.equal(sig.KeyInfo[0].X509Data[0].X509Certificate[0]._, cert.base64);
  assert.equal(inv.Signature[0].ID[0]._, 'urn:oasis:names:specification:ubl:signature:Invoice');
  assert.equal(unsignedText(out), plain, 'taking the signature off again gives exactly the signed bytes');
  assert.equal(s.hash, createHash('sha256').update(s.text).digest('hex'));
  assert.equal(Buffer.from(s.base64, 'base64').toString('utf8'), s.text);
  assert.equal(signingTime(Date.UTC(2026, 0, 2, 3, 4, 5, 999)), '2026-01-02T03:04:05Z');
});

test('signing: an older-style RSA PRIVATE KEY (PKCS#1) works too, and signing twice at the same second gives the same document', async () => {
  const doc = buildUBL(einv, co);
  const cert = readCert(certPem);
  const a = await signDocument(doc, await importKey(pkcs1Pem), cert, NOW);
  const b = await signDocument(doc, await importKey(keyPem), cert, NOW + 300);
  assert.equal(a.text, b.text, 'RSA PKCS#1 v1.5 is deterministic');
});

// ---------- the function ----------
const SB = 'https://b7.supabase.co';
const ME = '0b8e1f6a-1111-4222-8333-444455556666';
function lhdnStandIn(o: { reject?: boolean } = {}) {
  const calls: { url: string; body?: string }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
    if (String(url) === `${SB}/auth/v1/user`) {
      const auth = (init?.headers as Record<string, string>)?.authorization;
      return auth === 'Bearer good' ? Response.json({ id: ME }) : auth === 'Bearer other' ? Response.json({ id: '9b8e1f6a-1111-4222-8333-444455556666' }) : new Response('{}', { status: 401 });
    }
    if (String(url).endsWith('/connect/token')) return Response.json({ access_token: 'lhdn-token', expires_in: 3600 });
    if (String(url).endsWith('/api/v1.0/documentsubmissions')) {
      if (o.reject) return Response.json({ submissionUid: 'S1', acceptedDocuments: [], rejectedDocuments: [{ invoiceCodeNumber: 'INV-A-0001', error: { message: 'Validation Error', details: [{ message: 'Invalid signature' }] } }] }, { status: 202 });
      return Response.json({ submissionUid: 'S1', acceptedDocuments: [{ uuid: 'U1', invoiceCodeNumber: 'INV-A-0001' }], rejectedDocuments: [] }, { status: 202 });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchFn };
}
function deps(env: Record<string, string>, fetchFn: typeof fetch): Deps {
  const all: Record<string, string> = {
    SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon', MYINVOIS_ENV: 'preprod', MYINVOIS_CLIENT_ID: 'id', MYINVOIS_CLIENT_SECRET: 'secret',
    MYINVOIS_SUPPLIER_TIN: TIN, MYINVOIS_ALLOWED_USERS: ME, MYINVOIS_CERT_PEM: certPem, MYINVOIS_KEY_PEM: keyPem, ...env,
  };
  return { env: k => all[k] ?? '', fetch: fetchFn, now: () => NOW };
}
const submit = (d: Deps, auth = 'good', doc: unknown = buildUBL(einv, co)) => handleMyinvois(new Request('https://fn/myinvois', {
  method: 'POST', headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', codeNumber: 'INV-A-0001', document: doc }),
}), d);

test('function: signs as v1.1 and sends LHDN the hash of exactly what it sends', async () => {
  resetForTests();
  const { calls, fetchFn } = lhdnStandIn();
  const r = await submit(deps({}, fetchFn));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'submitted', env: 'preprod', version: '1.1', submissionUid: 'S1', uuid: 'U1' });
  const sent = JSON.parse(calls.find(c => c.url.endsWith('/documentsubmissions'))!.body!).documents[0];
  const text = Buffer.from(sent.document, 'base64').toString('utf8');
  assert.equal(sent.documentHash, createHash('sha256').update(text).digest('hex'));
  assert.equal(sent.format, 'JSON'); assert.equal(sent.codeNumber, 'INV-A-0001');
  const inv = JSON.parse(text).Invoice[0];
  assert.equal(inv.InvoiceTypeCode[0].listVersionID, '1.1');
  assert.ok(inv.UBLExtensions && inv.Signature);
  assert.ok(calls[0].url.startsWith('https://preprod-api.myinvois.hasil.gov.my') || calls[0].url === `${SB}/auth/v1/user`);
  assert.ok(calls.every(c => !c.url.includes('://api.myinvois')), 'sandbox only');
});

test('function: who may submit, and what is refused before anything reaches LHDN', async () => {
  resetForTests();
  const { calls, fetchFn } = lhdnStandIn();
  assert.equal((await submit(deps({ MYINVOIS_CLIENT_SECRET: '' }, fetchFn))).status, 503);
  const noUsers = await submit(deps({ MYINVOIS_ALLOWED_USERS: '' }, fetchFn));
  assert.deepEqual([noUsers.status, (await noUsers.json()).missing], [503, 'MYINVOIS_ALLOWED_USERS']);
  assert.equal((await submit(deps({}, fetchFn), 'bad')).status, 401);
  assert.equal((await submit(deps({}, fetchFn), 'other')).status, 403, 'signed in but not on the list');
  const wrongTin = buildUBL(einv, { ...co, party: { ...co.party, tin: 'C99999999990' } });
  assert.equal((await submit(deps({}, fetchFn), 'good', wrongTin)).status, 403);
  resetForTests();
  const badCert = await submit(deps({ MYINVOIS_CERT_PEM: otherCertPem, MYINVOIS_KEY_PEM: otherKeyPem }, fetchFn));
  assert.equal(badCert.status, 500); assert.match(JSON.stringify(await badCert.json()), /organizationIdentifier/);
  resetForTests();
  const noCert = await submit(deps({ MYINVOIS_CERT_PEM: '', MYINVOIS_KEY_PEM: '' }, fetchFn));
  assert.deepEqual([noCert.status, (await noCert.json()).missing], [503, 'certificate']);
  assert.equal(calls.filter(c => c.url.includes('myinvois.hasil')).length, 0, 'LHDN was never called');
});

test('function: unsigned v1.0 only in the sandbox, only with no certificate and the switch on', async () => {
  resetForTests();
  const { calls, fetchFn } = lhdnStandIn();
  const r = await submit(deps({ MYINVOIS_CERT_PEM: '', MYINVOIS_KEY_PEM: '', MYINVOIS_ALLOW_UNSIGNED_V10: 'true' }, fetchFn));
  assert.equal((await r.json()).version, '1.0');
  const sent = JSON.parse(calls.find(c => c.url.endsWith('/documentsubmissions'))!.body!).documents[0];
  assert.equal(JSON.parse(Buffer.from(sent.document, 'base64').toString()).Invoice[0].InvoiceTypeCode[0].listVersionID, '1.0');
  resetForTests();
  const prod = lhdnStandIn();
  const p = await submit(deps({ MYINVOIS_ENV: 'prod', MYINVOIS_CERT_PEM: '', MYINVOIS_KEY_PEM: '', MYINVOIS_ALLOW_UNSIGNED_V10: 'true' }, prod.fetchFn));
  assert.equal(p.status, 503, 'never unsigned in production');
});

test('function: LHDN rejecting the document comes back as invalid with its reasons', async () => {
  resetForTests();
  const { fetchFn } = lhdnStandIn({ reject: true });
  const r = await (await submit(deps({}, fetchFn))).json();
  assert.equal(r.status, 'invalid'); assert.deepEqual(r.errors, ['Validation Error – Invalid signature']);
});
