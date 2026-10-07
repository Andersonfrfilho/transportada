/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143, T004: prova que a `mailauth` roda sob o Bun para verificar DKIM, com mensagens
 * inteiramente sintéticas — chave RSA de teste gerada em memória, nada de dado real (ADR-0063 §3).
 */
import { createHash, generateKeyPairSync } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { dkimSign } from 'mailauth'

import { resolveDkimAlignment } from '../../src/contractor-mail/domain/dkim-alignment.policy.js'
import { createDkimVerifierGateway } from '../../src/contractor-mail/infrastructure/dkim-verifier.gateway.js'

const SELECTOR = 'teste'

function generateTestKeyPair(): { readonly privateKey: string; readonly publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 1024,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  return { privateKey, publicKey }
}

function dkimTxtRecord(publicKey: string): string {
  const body = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '')

  return `v=DKIM1; k=rsa; p=${body}`
}

function buildSyntheticMessage(input: { readonly from: string; readonly body: string }): string {
  return [
    `From: ${input.from}`,
    'To: operador@transportada.com.br',
    'Subject: taxa de entrega',
    'Date: Sun, 13 Sep 2026 12:00:00 +0000',
    '',
    input.body,
    '',
  ].join('\r\n')
}

async function signSyntheticMessage(input: {
  readonly message: string
  readonly signingDomain: string
  readonly privateKey: string
}): Promise<string> {
  const { signatures } = await dkimSign(Buffer.from(input.message), {
    // O topo satisfaz o `.d.ts` da mailauth; quem a implementação realmente lê é `signatureData`.
    signingDomain: input.signingDomain,
    selector: SELECTOR,
    privateKey: input.privateKey,
    signatureData: [
      { signingDomain: input.signingDomain, selector: SELECTOR, privateKey: input.privateKey },
    ],
  })

  return signatures + input.message
}

async function signSyntheticMessageWithMany(input: {
  readonly message: string
  readonly signers: readonly [
    { readonly signingDomain: string; readonly privateKey: string },
    ...Array<{ readonly signingDomain: string; readonly privateKey: string }>,
  ]
}): Promise<string> {
  const { signatures } = await dkimSign(Buffer.from(input.message), {
    // O topo satisfaz o `.d.ts` da mailauth; quem a implementação realmente lê é `signatureData`.
    signingDomain: input.signers[0].signingDomain,
    selector: SELECTOR,
    privateKey: input.signers[0].privateKey,
    signatureData: input.signers.map((signer) => ({
      signingDomain: signer.signingDomain,
      selector: SELECTOR,
      privateKey: signer.privateKey,
    })),
  })

  return signatures + input.message
}

function dnsRecordsFor(
  records: Readonly<Record<string, string>>,
): (name: string, recordType: string) => Promise<string[][]> {
  return async (name, recordType) => {
    if (recordType !== 'TXT') throw new Error(`tipo de registro inesperado: ${recordType}`)
    const record = records[name]
    if (record === undefined) throw new Error(`registro DNS inesperado: ${name}`)
    return [[record]]
  }
}

describe('a mailauth verifica DKIM sob o Bun', () => {
  test('assinada pelo domínio do From: aligned', async () => {
    const domain = 'contratante.com.br'
    const { privateKey, publicKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${domain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessage({ message, signingDomain: domain, privateKey })

    const gateway = createDkimVerifierGateway({
      resolveDns: dnsRecordsFor({ [`${SELECTOR}._domainkey.${domain}`]: dkimTxtRecord(publicKey) }),
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('aligned')
  })

  test('assinada por outro domínio (d= diferente): not_aligned', async () => {
    const fromDomain = 'contratante.com.br'
    const signingDomain = 'outro-provedor.com'
    const { privateKey, publicKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${fromDomain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessage({ message, signingDomain, privateKey })

    const gateway = createDkimVerifierGateway({
      resolveDns: dnsRecordsFor({
        [`${SELECTOR}._domainkey.${signingDomain}`]: dkimTxtRecord(publicKey),
      }),
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('not_aligned')
  })

  test('corpo adulterado depois de assinar: not_aligned (mailauth classifica como neutral, "body hash did not verify")', async () => {
    const domain = 'contratante.com.br'
    const { privateKey, publicKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${domain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessage({ message, signingDomain: domain, privateKey })
    const tampered = signed.replace('APROVADO', 'RECUSADO')

    const gateway = createDkimVerifierGateway({
      resolveDns: dnsRecordsFor({ [`${SELECTOR}._domainkey.${domain}`]: dkimTxtRecord(publicKey) }),
    })

    expect(await gateway.verify(Buffer.from(tampered))).toBe('not_aligned')
  })

  test('sem assinatura: absent', async () => {
    const message = buildSyntheticMessage({
      from: 'financeiro@contratante.com.br',
      body: 'APROVADO',
    })

    const gateway = createDkimVerifierGateway({
      resolveDns: async () => {
        throw new Error('não deveria consultar DNS sem assinatura')
      },
    })

    expect(await gateway.verify(Buffer.from(message))).toBe('absent')
  })

  test('o resolvedor de DNS lança: unverifiable', async () => {
    const domain = 'contratante.com.br'
    const { privateKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${domain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessage({ message, signingDomain: domain, privateKey })

    const gateway = createDkimVerifierGateway({
      resolveDns: async () => {
        throw new Error('DNS fora do ar')
      },
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('unverifiable')
  })

  test('o resolvedor de DNS demora além do prazo: unverifiable', async () => {
    const domain = 'contratante.com.br'
    const { privateKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${domain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessage({ message, signingDomain: domain, privateKey })

    const gateway = createDkimVerifierGateway({
      dnsTimeoutMs: 20,
      resolveDns: () => new Promise(() => {}),
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('unverifiable')
  })

  test('duas assinaturas: uma de outro domínio (pass, não alinhada) e a do From sem veredito (DNS fora do ar) — unverifiable, não not_aligned', async () => {
    const fromDomain = 'contratante.com.br'
    const otherDomain = 'outro-provedor.com'
    const { privateKey: fromPrivateKey } = generateTestKeyPair()
    const { privateKey: otherPrivateKey, publicKey: otherPublicKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${fromDomain}`, body: 'APROVADO' })
    const signed = await signSyntheticMessageWithMany({
      message,
      signers: [
        { signingDomain: otherDomain, privateKey: otherPrivateKey },
        { signingDomain: fromDomain, privateKey: fromPrivateKey },
      ],
    })

    const gateway = createDkimVerifierGateway({
      resolveDns: async (name) => {
        if (name === `${SELECTOR}._domainkey.${otherDomain}`) {
          return [[dkimTxtRecord(otherPublicKey)]]
        }
        // O domínio do From é o que decidiria — e é justamente ele que não deu para verificar.
        throw new Error('DNS fora do ar')
      },
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('unverifiable')
  })

  test('assinatura com l= (corpo só em parte coberto): not_aligned, mesmo que o hash confira', async () => {
    const domain = 'contratante.com.br'
    const { privateKey, publicKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({ from: `financeiro@${domain}`, body: 'APROVADO' })
    const { signatures } = await dkimSign(Buffer.from(message), {
      privateKey,
      selector: SELECTOR,
      signatureData: [{ maxBodyLength: 4, privateKey, selector: SELECTOR, signingDomain: domain }],
      signingDomain: domain,
    })
    const gateway = createDkimVerifierGateway({
      resolveDns: dnsRecordsFor({ [`${SELECTOR}._domainkey.${domain}`]: dkimTxtRecord(publicKey) }),
    })

    expect(await gateway.verify(Buffer.from(signatures + message))).toBe('not_aligned')
  })
})

describe('a política de alinhamento com assinatura de corpo limitado (spec 237 T4.7a)', () => {
  const aligned = { status: { aligned: 'contratante.com.br', result: 'pass' } }

  test('l= nunca conta como alinhada, e o resultado vira not_aligned', () => {
    expect(resolveDkimAlignment([{ ...aligned, canonBodyLengthLimited: true }])).toBe('not_aligned')
  })

  test('uma assinatura inteira alinhada ao lado de uma com l= ainda alinha', () => {
    expect(
      resolveDkimAlignment([
        { ...aligned, canonBodyLengthLimited: true },
        { ...aligned, canonBodyLengthLimited: false },
      ]),
    ).toBe('aligned')
  })

  test('sem o campo, a assinatura alinhada segue valendo (mensagens que a mailauth não marca)', () => {
    expect(resolveDkimAlignment([aligned])).toBe('aligned')
  })
})

describe('o prazo total da verificação de DKIM (spec 237 T4.7c, NOVO-3)', () => {
  /** O `bh=` certo para o corpo, senão a `mailauth` desiste antes de consultar o DNS. */
  const BODY = 'corpo\r\n'
  const bodyHash = createHash('sha256').update(BODY).digest('base64')
  const fakeSignatures = (count: number) =>
    Array.from(
      { length: count },
      (_, index) =>
        `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=e${index}.example; s=a; h=from; bh=${bodyHash}; b=YQ==`,
    ).join('\r\n')
  const message = (count: number) =>
    Buffer.from(`${fakeSignatures(count)}\r\nFrom: a@b.example\r\n\r\n${BODY}`)

  test('DNS que nunca responde: termina no prazo como unverifiable, sem esperar cada consulta em série', async () => {
    let calls = 0
    const gateway = createDkimVerifierGateway({
      deadlineMs: 300,
      dnsTimeoutMs: 150,
      resolveDns: () => {
        calls += 1
        return new Promise<string[][]>(() => undefined)
      },
    })
    const startedAt = performance.now()
    const result = await gateway.verifyWithHeaderFrom(message(8))
    const elapsed = performance.now() - startedAt

    expect(result).toEqual({ alignment: 'unverifiable', headerFrom: [] })
    expect(elapsed).toBeGreaterThanOrEqual(250)
    expect(elapsed).toBeLessThan(800)
    expect(calls).toBeGreaterThan(0)
  })

  test('depois do prazo nenhuma consulta nova sai: o laço da mailauth acaba rápido', async () => {
    let calls = 0
    const gateway = createDkimVerifierGateway({
      deadlineMs: 200,
      dnsTimeoutMs: 100,
      resolveDns: () => {
        calls += 1
        return new Promise<string[][]>(() => undefined)
      },
    })
    await gateway.verify(message(8))
    const callsAtDeadline = calls
    expect(callsAtDeadline).toBeLessThanOrEqual(3)
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(calls).toBe(callsAtDeadline)
  })

  test('o verify da conversa também respeita o prazo', async () => {
    const gateway = createDkimVerifierGateway({
      deadlineMs: 200,
      dnsTimeoutMs: 150,
      resolveDns: () => new Promise<string[][]>(() => undefined),
    })
    const startedAt = performance.now()
    expect(await gateway.verify(message(8))).toBe('unverifiable')
    expect(performance.now() - startedAt).toBeLessThan(700)
  })

  test('antes do prazo, nada muda: a assinatura alinhada segue aligned e devolve o From da mailauth', async () => {
    const domain = 'contratante.com.br'
    const { privateKey, publicKey } = generateTestKeyPair()
    const signed = await signSyntheticMessage({
      message: buildSyntheticMessage({ body: 'APROVADO', from: `financeiro@${domain}` }),
      privateKey,
      signingDomain: domain,
    })
    const gateway = createDkimVerifierGateway({
      deadlineMs: 5_000,
      resolveDns: dnsRecordsFor({ [`${SELECTOR}._domainkey.${domain}`]: dkimTxtRecord(publicKey) }),
    })

    expect(await gateway.verifyWithHeaderFrom(Buffer.from(signed))).toEqual({
      alignment: 'aligned',
      headerFrom: [`financeiro@${domain}`],
    })
  })

  test('o prazo padrão cabe em 15 segundos', async () => {
    const { DKIM_VERIFICATION_DEADLINE_MS } = await import(
      '../../src/contractor-mail/infrastructure/dkim-verifier.gateway.js'
    )
    expect(DKIM_VERIFICATION_DEADLINE_MS).toBe(15_000)
  })
})

describe('só a falha transitória de assinatura ALINHADA vale como "sem veredito" (spec 237 T4.7d)', () => {
  test('temperror de assinatura que a mailauth já sabe não alinhada (d= de outro domínio): not_aligned', () => {
    expect(resolveDkimAlignment([{ status: { aligned: false, result: 'temperror' } }])).toBe(
      'not_aligned',
    )
    expect(resolveDkimAlignment([{ status: { result: 'temperror' } }])).toBe('not_aligned')
  })

  test('temperror de assinatura alinhada ao From continua unverifiable (a entrega repete)', () => {
    expect(
      resolveDkimAlignment([{ status: { aligned: 'contratante.com.br', result: 'temperror' } }]),
    ).toBe('unverifiable')
  })

  test('uma assinatura alheia sem veredito ao lado de uma alinhada que passou: aligned', () => {
    expect(
      resolveDkimAlignment([
        { status: { aligned: false, result: 'temperror' } },
        { status: { aligned: 'contratante.com.br', result: 'pass' } },
      ]),
    ).toBe('aligned')
  })

  test('assinatura de domínio alheio com o DNS dele fora do ar: not_aligned, sem repetir', async () => {
    const { privateKey } = generateTestKeyPair()
    const message = buildSyntheticMessage({
      body: 'APROVADO',
      from: 'financeiro@contratante.com.br',
    })
    const signed = await signSyntheticMessage({
      message,
      privateKey,
      signingDomain: 'atacante.example',
    })
    const gateway = createDkimVerifierGateway({
      resolveDns: async () => {
        throw new Error('DNS do atacante mudo')
      },
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('not_aligned')
  })

  test('a do domínio do From com o DNS fora do ar segue unverifiable, mesmo ao lado de uma alheia', async () => {
    const fromDomain = 'contratante.com.br'
    const { privateKey: fromKey } = generateTestKeyPair()
    const { privateKey: otherKey } = generateTestKeyPair()
    const signed = await signSyntheticMessageWithMany({
      message: buildSyntheticMessage({ body: 'APROVADO', from: `financeiro@${fromDomain}` }),
      signers: [
        { privateKey: otherKey, signingDomain: 'atacante.example' },
        { privateKey: fromKey, signingDomain: fromDomain },
      ],
    })
    const gateway = createDkimVerifierGateway({
      resolveDns: async () => {
        throw new Error('DNS fora do ar')
      },
    })

    expect(await gateway.verify(Buffer.from(signed))).toBe('unverifiable')
  })
})
