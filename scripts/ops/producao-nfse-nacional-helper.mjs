// Roda DENTRO do container do worker (cwd = /app/apps/worker-transportada) OU com DIST apontando para o build.
// Emite UMA NFS-e de teste no Sistema Nacional, SOMENTE no ambiente de PRODUCAO RESTRITA (tpAmb=2).
// Nunca imprime certificado, senha ou chave privada. Imprime so linhas __RESULT__.
import { gzipSync, gunzipSync } from 'node:zlib'
import { createRequire } from 'node:module'

const baseRequire = createRequire(
  process.env.REQUIRE_FROM ?? '/app/apps/worker-transportada/package.json',
)
// node-forge e xml-crypto sao dependencias do fiscal-provider: resolve a partir dele quando nao estao hoisted
function load(name) {
  try {
    return baseRequire(name)
  } catch {
    const fiscalEntry = baseRequire.resolve('@adatechnology/fiscal-provider')
    return createRequire(fiscalEntry)(name)
  }
}
const forge = load('node-forge')
const { SignedXml } = load('xml-crypto')

const SEFIN_RESTRITA = 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional'
const out = (k, v) => console.log(`__RESULT__ ${k}=${v}`)
const trim = (s, n = 4000) => (s.length > n ? `${s.slice(0, n)}...[cortado ${s.length - n}]` : s)

// ---------- dados do teste (nota 7 de 25/11/2026 como molde) ----------
const PRESTADOR_CNPJ = '61156864000191'
const COD_MUN_RP = '3543402'
const SERIE = process.env.DPS_SERIE ?? '1'
const sig256 = (process.env.SIG_ALGO ?? 'sha256') === 'sha256'

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const pad = (v, n) => String(v).padStart(n, '0')

// Variantes do leiaute (a NT 009 moveu finNFSe para infDPS; a ordem exata nao foi confirmada):
//  A = finNFSe depois de tpEmit e fora do IBSCBS · B = finNFSe depois de cLocEmi e fora do IBSCBS · C = depois de tpEmit e tambem no IBSCBS
function buildDps({ nDps, now, variant }) {
  const id = `DPS${COD_MUN_RP}2${PRESTADOR_CNPJ}${pad(SERIE, 5)}${pad(nDps, 15)}`
  const offset = '-03:00'
  const local = new Date(now.getTime() - 3 * 3600_000)
  const iso = local.toISOString().slice(0, 19)
  const dhEmi = `${iso}${offset}`
  const dCompet = iso.slice(0, 10)
  const valor = process.env.VALOR ?? '1.00'
  const xml =
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infDPS Id="${id}">` +
    `<tpAmb>2</tpAmb><dhEmi>${dhEmi}</dhEmi><verAplic>TransportAdA-teste</verAplic>` +
    `<serie>${SERIE}</serie><nDPS>${nDps}</nDPS><dCompet>${dCompet}</dCompet><tpEmit>1</tpEmit>${variant === 'B' ? '' : '<finNFSe>0</finNFSe>'}<cLocEmi>${COD_MUN_RP}</cLocEmi>${variant === 'B' ? '<finNFSe>0</finNFSe>' : ''}` +
    `<prest><CNPJ>${PRESTADOR_CNPJ}</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>` +
    `<toma><CNPJ>05868574001090</CNPJ><xNome>COMERCIAL ZARAGOZA IMP EXP LTDA</xNome>` +
    `<end><endNac><cMun>3554102</cMun><CEP>12091000</CEP></endNac><xLgr>AVENIDA DOM PEDRO I</xLgr><nro>6707</nro><xBairro>JARDIM BARONESA</xBairro></end></toma>` +
    `<indDest>0</indDest><serv><locPrest><cLocPrestacao>${COD_MUN_RP}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>160201</cTribNac><cNBS>105011900</cNBS><xDescServ>${esc('TESTE HOMOLOGACAO - Prestacao de servico de transporte rodoviario de cargas em Ribeirao Preto')}</xDescServ></cServ></serv>` +
    `<valores><vServPrest><vServ>${valor}</vServ></vServPrest>` +
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTribSN>4.50</pTotTribSN></totTrib></trib></valores>` +
    `<IBSCBS>${variant === 'C' ? '<finNFSe>0</finNFSe>' : ''}<indFinal>0</indFinal><cIndOp>070101</cIndOp>` +
    `<valores><trib><CST>000</CST><cClassTrib>000001</cClassTrib></trib></valores></IBSCBS>` +
    `</infDPS></DPS>`
  return { id, xml }
}

function signDps(xml, keyPem, certPem) {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: sig256
      ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
      : 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  })
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    digestAlgorithm: sig256
      ? 'http://www.w3.org/2001/04/xmlenc#sha256'
      : 'http://www.w3.org/2000/09/xmldsig#sha1',
  })
  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' },
  })
  return sig.getSignedXml()
}

function extractPem(pfxBase64, password) {
  const der = forge.util.decode64(pfxBase64)
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password)
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? []
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const key = keyBags[0]?.key
  if (key === undefined || certBags.length === 0) throw new Error('PFX_SEM_CHAVE_OU_CERT')
  // cert folha = o que casa com a chave
  const pub = forge.pki.publicKeyToPem(key)
  const leaf =
    certBags.find((b) => forge.pki.publicKeyToPem(b.cert.publicKey) === pub) ?? certBags[0]
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(leaf.cert),
    chainPem: certBags.map((b) => forge.pki.certificateToPem(b.cert)).join(''),
    cert: leaf.cert,
  }
}

export async function run({ pfxBase64, password, post }) {
  const { keyPem, certPem, cert } = extractPem(pfxBase64, password)
  const subject = cert.subject.getField('CN')?.value ?? ''
  out('certificado_cn', subject)
  out(
    'certificado_validade',
    `${cert.validity.notBefore.toISOString()} ate ${cert.validity.notAfter.toISOString()}`,
  )
  const now = new Date()
  const variants = (process.env.VARIANTS ?? 'A').split(',')
  let last
  for (const [i, variant] of variants.entries()) {
    const nDps = String((BigInt(now.getTime()) + BigInt(i)) % 1000000000000000n || 1n)
    const { id, xml } = buildDps({ nDps, now, variant })
    const signed = `<?xml version="1.0" encoding="UTF-8"?>${signDps(xml, keyPem, certPem)}`
    last = signed
    out(`variante_${variant}_dps_id`, id)
    if (process.env.DRY_RUN === '1') {
      out(`variante_${variant}`, `dry_run bytes=${Buffer.byteLength(signed)}`)
      continue
    }
    const body = JSON.stringify({
      dpsXmlGZipB64: gzipSync(Buffer.from(signed, 'utf8')).toString('base64'),
    })
    const res = await post({ url: `${SEFIN_RESTRITA}/nfse`, body, keyPem, certPem })
    out(`variante_${variant}_http`, res.status)
    let json
    try {
      json = JSON.parse(res.text)
    } catch {
      out(`variante_${variant}_corpo`, trim(res.text))
      break
    }
    if (json.nfseXmlGZipB64 !== undefined) {
      out('chaveAcesso', json.chaveAcesso ?? '')
      out('idDps', json.idDps ?? '')
      out('alertas', trim(JSON.stringify(json.alertas ?? [])))
      out(
        'nfse_xml',
        trim(gunzipSync(Buffer.from(json.nfseXmlGZipB64, 'base64')).toString('utf8'), 8000),
      )
      break
    }
    const { nfseXmlGZipB64: _omit, ...rest } = json
    out(`variante_${variant}_resposta`, trim(JSON.stringify(rest.erros ?? rest.erro ?? rest)))
    // so segue para a proxima variante enquanto o erro for de esquema (E1235)
    if (!JSON.stringify(rest).includes('E1235')) break
  }
  return last
}

// ---------- execucao real ----------
if (process.env.NFSE_SELFTEST !== '1') {
  // O container so tem dist/main.js empacotado: sem imports de dist/*, SQL cru e chaveiro lido do ambiente.
  const { createDrizzleProvider } = await import('@adatechnology/drizzle-provider')
  const { createSecretEnvelopeProvider } = await import('@adatechnology/secret-envelope')
  const { sql } = await import('drizzle-orm')
  const asRows = (r) => (Array.isArray(r) ? r : (r?.rows ?? []))

  const keys = Object.fromEntries(
    Object.entries(JSON.parse(process.env.ENCRYPTION_KEYRING_JSON ?? '{}')).map(([k, v]) => [
      k,
      Uint8Array.from(Buffer.from(String(v), 'base64')),
    ]),
  )
  const envelopeProvider = createSecretEnvelopeProvider({
    activeKeyId: process.env.ENCRYPTION_ACTIVE_KEY_ID,
    keys,
  })
  const database = createDrizzleProvider({
    connection: { connection: { TimeZone: 'UTC' }, url: process.env.DATABASE_URL },
  })
  let exitCode = 0
  try {
    const profiles = asRows(
      await database.db.execute(
        sql`select company_id as "companyId", cnpj from company_fiscal_profiles`,
      ),
    )
    const wanted = process.env.COMPANY_ID
    const mine = profiles.filter((p) =>
      wanted ? p.companyId === wanted : String(p.cnpj).replace(/\D/g, '') === PRESTADOR_CNPJ,
    )
    if (mine.length !== 1) {
      out(
        'erro',
        `empresa_ambigua perfis=${profiles.length} candidatas=${mine.length} (defina COMPANY_ID)`,
      )
      process.exit(3)
    }
    const companyId = mine[0].companyId
    const cnpj = String(mine[0].cnpj).replace(/\D/g, '')
    out('empresa_cnpj', cnpj)
    if (cnpj !== PRESTADOR_CNPJ) {
      out('erro', 'empresa_nao_e_o_prestador')
      process.exit(4)
    }
    const certs = asRows(
      await database.db.execute(sql`
        select id, secret_envelope as "secretEnvelope", validated_cnpj as "validatedCnpj", purpose
        from digital_certificates
        where company_id = ${companyId}::uuid and status = 'active' and purpose = 'cte'
        order by created_at desc, version desc limit 1`),
    )
    if (certs.length === 0 || certs[0].secretEnvelope === null) {
      out('erro', 'certificado_cte_ativo_nao_encontrado')
      process.exit(5)
    }
    const cert = certs[0]
    out('certificado_cnpj_validado', String(cert.validatedCnpj))
    const aad = new TextEncoder().encode(`transportada:certificate:v1:${companyId}:${cert.id}:cte`)
    const envelope =
      typeof cert.secretEnvelope === 'string'
        ? JSON.parse(cert.secretEnvelope)
        : cert.secretEnvelope
    const plaintext = await envelopeProvider.decrypt({ additionalAuthenticatedData: aad, envelope })
    const secret = JSON.parse(new TextDecoder().decode(plaintext))
    plaintext.fill(0)

    const post = async ({ url, body, keyPem, certPem }) => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body,
        tls: { key: keyPem, cert: certPem },
      })
      return { status: r.status, text: await r.text() }
    }
    await run({ pfxBase64: secret.certificateBase64, password: secret.password, post })
  } catch (error) {
    out(
      'lancou',
      String(error?.message ?? error)
        .replace(/\s+/g, ' ')
        .slice(0, 300),
    )
    exitCode = 1
  } finally {
    await database.close?.()
  }
  process.exit(exitCode)
}
