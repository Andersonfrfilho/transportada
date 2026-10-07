/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7c (segunda revisão de segurança, NOVO-1): o `From` que o ramo da prévia lê tem de ser o MESMO
 * que a `mailauth` alinha ao `d=` da assinatura. `From: <logistica"@evil.example>"@transportadora.example>`
 * era lido por nós como `logistica@transportadora.example` (as aspas saíam da string inteira antes do `<…>`) e
 * pela `mailauth` como `logistica"@evil.example` — alinhado com a chave do atacante. Duas camadas: o leitor
 * exige o endereço LITERAL no fim do valor, e o intake só aceita quando o `From` lido pela `mailauth` é o mesmo.
 */
import { generateKeyPairSync } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { dkimSign } from 'mailauth'

import { readSingleMailboxAddress } from '../../src/cargo-preview-email/domain/mailbox-address.policy.js'
import { createDkimVerifierGateway } from '../../src/contractor-mail/infrastructure/dkim-verifier.gateway.js'
import { buildMime, gmailForwardText } from './mime.fixture.js'
import { CONTRACTOR_ID, FORWARDER, ORIGINAL, runIntake } from './intake.harness.js'

const SELECTOR = 'teste'
const ATTACKER_DOMAIN = 'evil.example'
const FORWARDER_DOMAIN = 'transportadora.example'
const POC_FROM = `<equipe"@${ATTACKER_DOMAIN}>"@${FORWARDER_DOMAIN}>`

function generateKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 1024,
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'pem', type: 'spki' },
  })
}

function txtRecord(publicKey: string): string {
  const body = publicKey.replace(/-----(BEGIN|END) PUBLIC KEY-----|\s+/gu, '')
  return `v=DKIM1; k=rsa; p=${body}`
}

async function signedForward(input: { readonly from: string; readonly signingDomain: string }) {
  const { privateKey, publicKey } = generateKeyPair()
  const message = buildMime({
    attachments: [{ fileName: 'FR-06-10.xlsm' }],
    from: input.from,
    text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
  })
  const { signatures } = await dkimSign(Buffer.from(message), {
    privateKey,
    selector: SELECTOR,
    signatureData: [{ privateKey, selector: SELECTOR, signingDomain: input.signingDomain }],
    signingDomain: input.signingDomain,
  })
  const dkimVerifier = createDkimVerifierGateway({
    resolveDns: async (name) => {
      if (name !== `${SELECTOR}._domainkey.${input.signingDomain}`) throw new Error('sem registro')
      return [[txtRecord(publicKey)]]
    },
  })
  return { dkimVerifier, raw: signatures + message }
}

describe('o leitor de um único endereço exige o endereço literal no fim (spec 237 T4.7c)', () => {
  test.each([
    ['o PoC do revisor: aspas que escondem um segundo <…>', POC_FROM],
    ['aspas dentro do <…> com endereço de outro domínio', `<a"@${ATTACKER_DOMAIN}>"@t.example>`],
    ['nome e depois aspas dentro do <…>', `Ana <a"@${ATTACKER_DOMAIN}>"@t.example>`],
    ['texto depois do endereço entre aspas', `Ana <a@t.example>"@${ATTACKER_DOMAIN}"`],
    ['comentário com outro endereço', `a@t.example (b@${ATTACKER_DOMAIN})`],
    ['grupo', `grupo: a@t.example;`],
    ['lista de endereços', `a@t.example, b@${ATTACKER_DOMAIN}`],
    ['lista de caixas com <>', `Ana <a@t.example>, Bia <b@${ATTACKER_DOMAIN}>`],
  ])('recusa %s', (_name, value) => {
    expect(readSingleMailboxAddress(value)).toBeUndefined()
  })

  test.each([
    [
      'nome entre aspas com aspas escapadas e outro <…> dentro',
      '"Ana \\" <m@evil.example> \\"" <ana@t.example>',
    ],
    ['nome entre aspas com vírgula', '"Silva, João" <ana@t.example>'],
    ['endereço simples', 'ana@t.example'],
  ])('lê %s', (_name, value) => {
    expect(readSingleMailboxAddress(value)).toBe('ana@t.example')
  })

  test('nome de exibição com vírgula SEM aspas (Outlook corporativo) é um endereço só', () => {
    expect(readSingleMailboxAddress('Silva, João <ana@t.example>')).toBe('ana@t.example')
  })

  test('mas a lista de endereços de verdade continua recusada', () => {
    expect(readSingleMailboxAddress('ana@t.example, bia@t.example')).toBeUndefined()
    expect(readSingleMailboxAddress('Silva, João <ana@t.example>, <bia@t.example>')).toBeUndefined()
    expect(readSingleMailboxAddress('ana@t.example, Bia <bia@t.example>')).toBeUndefined()
  })
})

describe('o From do PoC nunca vira o encaminhador permitido (spec 237 T4.7c, NOVO-1)', () => {
  test('a mailauth lê outro From que o nosso leitor, e o ataque era "aligned"', async () => {
    const { dkimVerifier, raw } = await signedForward({
      from: POC_FROM,
      signingDomain: ATTACKER_DOMAIN,
    })
    const verification = await dkimVerifier.verifyWithHeaderFrom(Buffer.from(raw))
    expect(verification.alignment).toBe('aligned')
    expect(verification.headerFrom).toEqual([`equipe"@${ATTACKER_DOMAIN}`])
  })

  const endToEndCases: ReadonlyArray<
    readonly [string, string, 'FORWARDER_NOT_ALLOWED' | 'MIME_UNREADABLE']
  > = [
    ['o From do Resend limpo', `Equipe <${FORWARDER}>`, 'MIME_UNREADABLE'],
    ['o From do Resend igual ao cabeçalho literal', POC_FROM, 'FORWARDER_NOT_ALLOWED'],
    [
      'o From do Resend já sem os <>',
      `equipe"@${ATTACKER_DOMAIN}>"@${FORWARDER_DOMAIN}`,
      'FORWARDER_NOT_ALLOWED',
    ],
  ]

  test.each(endToEndCases)(
    'de ponta a ponta, com %s: recusa e não cria prévia',
    async (_name, resendFrom, reason) => {
      const { dkimVerifier, raw } = await signedForward({
        from: POC_FROM,
        signingDomain: ATTACKER_DOMAIN,
      })
      const run = runIntake({ dkimVerifier, rawEmail: raw, received: { from: resendFrom } })
      expect(await run.result).toEqual({ contractorId: CONTRACTOR_ID, kind: 'rejected', reason })
      expect(run.calls.created).toEqual([])
      expect(run.calls.stored).toEqual([])
    },
  )

  test.each([
    ['o cabeçalho completo', `Equipe <${FORWARDER}>`],
    ['só o endereço', FORWARDER],
  ])(
    'o encaminhador legítimo, assinado pelo próprio domínio, continua aceito (%s)',
    async (_n, resendFrom) => {
      const { dkimVerifier, raw } = await signedForward({
        from: `Equipe <${FORWARDER}>`,
        signingDomain: FORWARDER_DOMAIN,
      })
      const run = runIntake({ dkimVerifier, rawEmail: raw, received: { from: resendFrom } })
      expect(await run.result).toMatchObject({ dkimResult: 'aligned', kind: 'accepted' })
      expect(run.calls.created).toHaveLength(1)
    },
  )
})

describe('o From lido pela mailauth tem de ser o do encaminhador (spec 237 T4.7c, NOVO-1b)', () => {
  const mismatch = {
    contractorId: CONTRACTOR_ID,
    kind: 'rejected',
    reason: 'FORWARDER_FROM_MISMATCH',
  } as const

  test.each([
    ['outro endereço', ['mallory@evil.example']],
    ['nenhum endereço', []],
    ['dois endereços, um deles o do encaminhador', [FORWARDER, 'mallory@evil.example']],
    ['o mesmo endereço duas vezes (dois cabeçalhos From)', [FORWARDER, FORWARDER]],
  ])('%s: recusa FORWARDER_FROM_MISMATCH e grava só o código', async (_name, headerFrom) => {
    const run = runIntake({ headerFrom })
    expect(await run.result).toEqual(mismatch)
    expect(run.calls.created).toEqual([])
    expect(run.calls.stored).toEqual([])
    expect(run.calls.rejections).toHaveLength(1)
    expect(run.calls.rejections[0]).toMatchObject({
      dkimResult: 'aligned',
      reason: 'FORWARDER_FROM_MISMATCH',
    })
  })

  test('a caixa não importa: a mailauth devolve o endereço como veio', async () => {
    const run = runIntake({ headerFrom: [FORWARDER.toUpperCase()] })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
  })

  test('dois cabeçalhos From no MIME não têm dono: MIME_UNREADABLE, nunca aceito', async () => {
    const rawEmail = buildMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      extraHeaders: ['From: mallory@evil.example'],
      from: `Equipe <${FORWARDER}>`,
      text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
    })
    const run = runIntake({ headerFrom: [FORWARDER, 'mallory@evil.example'], rawEmail })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'MIME_UNREADABLE' })
  })

  test('From com comentário no MIME não é um endereço: MIME_UNREADABLE', async () => {
    const rawEmail = buildMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      from: `${FORWARDER} (mallory@evil.example)`,
      text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
    })
    const run = runIntake({ rawEmail })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'MIME_UNREADABLE' })
  })
})

describe('assinatura de domínio alheio com o DNS mudo não repete a entrega (spec 237 T4.7d)', () => {
  test('a mensagem é recusada como DKIM não alinhado na primeira entrega, sem lançar', async () => {
    const { privateKey } = generateKeyPair()
    const message = buildMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      from: `Equipe <${FORWARDER}>`,
      text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
    })
    const { signatures } = await dkimSign(Buffer.from(message), {
      privateKey,
      selector: SELECTOR,
      signatureData: [{ privateKey, selector: SELECTOR, signingDomain: ATTACKER_DOMAIN }],
      signingDomain: ATTACKER_DOMAIN,
    })
    const dkimVerifier = createDkimVerifierGateway({
      resolveDns: async () => {
        throw new Error('DNS do atacante mudo')
      },
    })
    const run = runIntake({
      dkimVerifier,
      isLastAttempt: false,
      rawEmail: signatures + message,
    })

    expect(await run.result).toEqual({
      contractorId: CONTRACTOR_ID,
      kind: 'rejected',
      reason: 'FORWARDER_DKIM_NOT_ALIGNED',
    })
  })
})
