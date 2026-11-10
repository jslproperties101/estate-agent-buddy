// Batch 7c (9 Nov 2026): LHDN MyInvois document signing for UBL 2.1 JSON, version 1.1, as LHDN's SDK page "Signature"
// describes it (https://sdk.myinvois.hasil.gov.my/signature/). Plain TypeScript with WebCrypto only, so the same code runs
// in the Supabase function (Deno) and in the unit tests (Node). The company certificate and its private key come from the
// function's secrets; nothing here keeps or logs them.
//
// Steps (LHDN numbering):
//  1  remove UBLExtensions and Signature from the invoice, set the version to 1.1, minify (JSON.stringify)
//  2  DocDigest      = base64(SHA-256(those bytes))
//  3  SignatureValue = base64(RSA-SHA256 signature of those bytes, PKCS#1 v1.5)
//  4  CertDigest     = base64(SHA-256(certificate, DER))
//  5  SignedProperties: signing time (UTC, seconds), certificate digest, issuer name and serial number
//  6  PropsDigest    = base64(SHA-256(minified {"Target":"signature","SignedProperties":[...]}))
//  7  put UBLExtensions (the XAdES signature) and Signature into the invoice; the submission hash is hex SHA-256 of the
//     final minified text, and the document is sent as base64 of that text.

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0));
const sha256 = async (u: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', u as BufferSource));
export const textBase64 = (s: string) => b64(enc.encode(s));
export const sha256Hex = async (s: string) => [...await sha256(enc.encode(s))].map(x => x.toString(16).padStart(2, '0')).join('');

// ---------- a little DER (only what a certificate and a key need) ----------
interface Tlv { tag: number; start: number; len: number; end: number; body: Uint8Array }
function tlv(b: Uint8Array, at: number): Tlv {
  const tag = b[at];
  let len = b[at + 1], p = at + 2;
  if (len & 0x80) { const n = len & 0x7f; if (n < 1 || n > 4) throw new Error('bad DER length'); len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[p++]; }
  if (p + len > b.length) throw new Error('DER runs past the end');
  return { tag, start: at, len, end: p + len, body: b.subarray(p, p + len) };
}
function children(t: Tlv): Tlv[] { const out: Tlv[] = []; let p = 0; while (p < t.body.length) { const c = tlv(t.body, p); out.push(c); p = c.end; } return out; }
function oid(u: Uint8Array): string {
  const out = [Math.floor(u[0] / 40), u[0] % 40]; let v = 0;
  for (let i = 1; i < u.length; i++) { v = v * 128 + (u[i] & 0x7f); if (!(u[i] & 0x80)) { out.push(v); v = 0; } }
  return out.join('.');
}
const NAMES: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.7': 'L', '2.5.4.8': 'S', '2.5.4.5': 'SERIALNUMBER',
  '2.5.4.97': 'OID.2.5.4.97', '1.2.840.113549.1.9.1': 'E',
};
function str(t: Tlv): string {
  if (t.tag === 0x1e) { let s = ''; for (let i = 0; i + 1 < t.body.length; i += 2) s += String.fromCharCode(t.body[i] * 256 + t.body[i + 1]); return s; }  // BMPString
  return new TextDecoder().decode(t.body);
}
/** A distinguished name as LHDN writes it: most specific first ("CN=..., O=..., C=MY"). */
function dn(name: Tlv): string {
  const parts: string[] = [];
  for (const set of children(name)) for (const atv of children(set)) {
    const [o, val] = children(atv);
    parts.push(`${NAMES[oid(o.body)] ?? `OID.${oid(o.body)}`}=${str(val)}`);
  }
  return parts.reverse().join(', ');
}
export interface CertInfo { der: Uint8Array; base64: string; issuer: string; subject: string; serial: string; subjectFields: Record<string, string> }
export function pemBody(pem: string, label: string): Uint8Array {
  const m = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`).exec(pem);
  if (!m) throw new Error(`no ${label} in the secret`);
  return unb64(m[1]);
}
export function readCert(pemOrDer: string | Uint8Array): CertInfo {
  const der = typeof pemOrDer === 'string' ? pemBody(pemOrDer, 'CERTIFICATE') : pemOrDer;
  const cert = tlv(der, 0);
  const tbs = children(cert)[0];
  const f = children(tbs);
  const i = f[0].tag === 0xa0 ? 1 : 0;                       // [0] version is optional
  const serialBytes = f[i].body;
  let serial = 0n; for (const x of serialBytes) serial = serial * 256n + BigInt(x);
  const issuer = dn(f[i + 2]), subject = dn(f[i + 4]);
  const subjectFields: Record<string, string> = {};
  for (const set of children(f[i + 4])) for (const atv of children(set)) { const [o, v] = children(atv); subjectFields[NAMES[oid(o.body)] ?? oid(o.body)] = str(v); }
  return { der, base64: b64(der), issuer, subject, serial: serial.toString(), subjectFields };
}

// ---------- the private key ----------
function derLen(n: number): number[] { if (n < 128) return [n]; const b: number[] = []; while (n) { b.unshift(n & 0xff); n >>= 8; } return [0x80 | b.length, ...b]; }
const derOf = (tag: number, body: Uint8Array) => new Uint8Array([tag, ...derLen(body.length), ...body]);
/** PKCS#1 ("RSA PRIVATE KEY") wrapped as PKCS#8, which WebCrypto reads. */
function pkcs1to8(pkcs1: Uint8Array): Uint8Array {
  const alg = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const body = new Uint8Array([0x02, 0x01, 0x00, ...alg, ...derOf(0x04, pkcs1)]);
  return derOf(0x30, body);
}
export async function importKey(pem: string): Promise<CryptoKey> {
  const der = /BEGIN RSA PRIVATE KEY/.test(pem) ? pkcs1to8(pemBody(pem, 'RSA PRIVATE KEY')) : pemBody(pem, 'PRIVATE KEY');
  return crypto.subtle.importKey('pkcs8', der as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

// ---------- signing ----------
const v = (x: string, a: Record<string, string> = {}) => [{ _: x, ...a }];
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
// deno-lint-ignore no-explicit-any
type J = any;
/** Signing time as LHDN shows it: UTC, whole seconds. */
export const signingTime = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The document as it is hashed and signed: version 1.1, without UBLExtensions and Signature, as minified text. */
export function unsignedText(doc: J): string {
  const d = structuredClone(doc);
  const inv = d?.Invoice?.[0];
  if (!inv) throw new Error('not a UBL JSON invoice');
  delete inv.UBLExtensions; delete inv.Signature;
  if (inv.InvoiceTypeCode?.[0]) inv.InvoiceTypeCode[0].listVersionID = '1.1';
  return JSON.stringify(d);
}

export interface Signed { text: string; base64: string; hash: string; docDigest: string; signature: string; propsDigest: string; certDigest: string }
export async function signDocument(doc: J, key: CryptoKey, cert: CertInfo, nowMs: number): Promise<Signed> {
  const plain = unsignedText(doc);
  const bytes = enc.encode(plain);
  const docDigest = b64(await sha256(bytes));
  const signature = b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, bytes)));
  const certDigest = b64(await sha256(cert.der));
  const SignedProperties = [{
    Id: 'id-xades-signed-props',
    SignedSignatureProperties: [{
      SigningTime: v(signingTime(nowMs)),
      SigningCertificate: [{ Cert: [{
        CertDigest: [{ DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: v(certDigest) }],
        IssuerSerial: [{ X509IssuerName: v(cert.issuer), X509SerialNumber: v(cert.serial) }],
      }] }],
    }],
  }];
  const propsDigest = b64(await sha256(enc.encode(JSON.stringify({ Target: 'signature', SignedProperties }))));
  const out = JSON.parse(plain);
  const inv = out.Invoice[0];
  inv.UBLExtensions = [{ UBLExtension: [{
    ExtensionURI: v('urn:oasis:names:specification:ubl:dsig:enveloped:xades'),
    ExtensionContent: [{ UBLDocumentSignatures: [{ SignatureInformation: [{
      ID: v('urn:oasis:names:specification:ubl:signature:1'),
      ReferencedSignatureID: v('urn:oasis:names:specification:ubl:signature:Invoice'),
      Signature: [{
        Id: 'signature',
        Object: [{ QualifyingProperties: [{ Target: 'signature', SignedProperties }] }],
        KeyInfo: [{ X509Data: [{
          X509Certificate: v(cert.base64), X509SubjectName: v(cert.subject),
          X509IssuerSerial: [{ X509IssuerName: v(cert.issuer), X509SerialNumber: v(cert.serial) }],
        }] }],
        SignatureValue: v(signature),
        SignedInfo: [{
          SignatureMethod: [{ _: '', Algorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256' }],
          Reference: [
            { Type: 'http://uri.etsi.org/01903/v1.3.2#SignedProperties', URI: '#id-xades-signed-props', DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: v(propsDigest) },
            { Type: '', URI: '', DigestMethod: [{ _: '', Algorithm: SHA256 }], DigestValue: v(docDigest) },
          ],
        }],
      }],
    }] }] }],
  }] }];
  inv.Signature = [{ ID: v('urn:oasis:names:specification:ubl:signature:Invoice'), SignatureMethod: v('urn:oasis:names:specification:ubl:dsig:enveloped:xades') }];
  const text = JSON.stringify(out);
  return { text, base64: textBase64(text), hash: await sha256Hex(text), docDigest, signature, propsDigest, certDigest };
}

/** What LHDN requires of the company certificate's subject (the SDK's certificate rules), checked before any submission. */
export function certProblems(cert: CertInfo, supplierTin: string): string[] {
  const s = cert.subjectFields, out: string[] = [];
  for (const k of ['CN', 'C', 'O']) if (!s[k]) out.push(`certificate subject has no ${k}`);
  const orgId = s['OID.2.5.4.97'] ?? s['2.5.4.97'];
  if (!orgId) out.push('certificate subject has no organizationIdentifier (the TIN)');
  else if (supplierTin && orgId !== supplierTin) out.push('certificate TIN does not match MYINVOIS_SUPPLIER_TIN');
  if (!s.SERIALNUMBER) out.push('certificate subject has no serialNumber (the business registration number)');
  return out;
}
