/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143, T004: prova que a `mailauth` roda sob o Bun para verificar DKIM, com mensagens
 * inteiramente sintéticas — chave RSA de teste gerada em memória, nada de dado real (ADR-0063 §3).
 */
import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { dkimSign } from 'mailauth'

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
})
