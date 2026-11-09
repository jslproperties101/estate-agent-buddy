// Supabase Edge Function: AI Buddy POS → LHDN MyInvois (sandbox first). Batch 7c (9 Nov 2026): documents are signed as
// version 1.1 with the company certificate (LHDN's XAdES signature for UBL JSON). The logic is in handler.ts.
// The LHDN credentials and the certificate stay here as secrets and never go into the app. Set them in the Supabase
// dashboard (Edge Functions → Secrets) of the TEST project; never paste them into chat or commit them:
//   MYINVOIS_ENV=preprod                         preprod = sandbox; prod only after the owner approves going live
//   MYINVOIS_CLIENT_ID, MYINVOIS_CLIENT_SECRET   the ERP client from the MyInvois sandbox portal
//   MYINVOIS_SUPPLIER_TIN=C2xxxxxxxxxx           only documents from this TIN are sent; must match the certificate
//   MYINVOIS_ALLOWED_USERS=<user id>[,<user id>] who may submit (Supabase Auth user ids); nobody until this is set
//   the certificate, either:
//     MYINVOIS_P12_BASE64 (the .p12 / .pfx file as base64) and MYINVOIS_P12_PASSWORD
//   or MYINVOIS_CERT_PEM and MYINVOIS_KEY_PEM (PEM text)
//   MYINVOIS_ALLOW_UNSIGNED_V10=true             optional, sandbox only: unsigned v1.0 when no certificate is set
//   supabase functions deploy myinvois
// Supabase checks the caller's sign-in token before this code runs; handler.ts then checks the caller is allowed.
// NOT TESTED AGAINST LHDN YET: the signature follows LHDN's SDK page and is tested with a self-made certificate only.
import { handleMyinvois } from './handler.ts';
import forge from 'npm:node-forge@1.3.1';

/** A .p12 / .pfx (base64) and its password → PEM certificate (the one with the private key) and PEM private key. */
async function p12(base64: string, password: string) {
  const der = forge.util.decode64(base64.replace(/\s+/g, ''));
  const p = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), password);
  const keyBag = (p.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0]
    ?? (p.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0];
  const certs = p.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (!keyBag?.key || !certs.length) throw new Error('the .p12 has no private key or certificate');
  const key = keyBag.key as forge.pki.rsa.PrivateKey;
  // the certificate whose public key matches the private key (a .p12 may also hold the issuing CA)
  const mine = certs.find(b => b.cert && (b.cert.publicKey as forge.pki.rsa.PublicKey).n.equals(key.n)) ?? certs[0];
  return { certPem: forge.pki.certificateToPem(mine.cert!), keyPem: forge.pki.privateKeyToPem(key) };
}

Deno.serve(req => handleMyinvois(req, { env: k => Deno.env.get(k) ?? '', fetch, now: () => Date.now(), p12 }));
