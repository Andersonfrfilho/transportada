/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a (revisão de segurança, achado 3): a janela de e-mails por contratante tem DOIS
 * contadores — os que passaram do DKIM do encaminhador (teto de 20) e os que ficaram antes dele (teto
 * mais alto, só para a tabela não virar alvo de inundação) —, é medida pelo relógio do banco, e o excesso
 * deixa UM rastro por janela em vez de sumir.
 */
import { describe, expect, test } from 'bun:test'

import { PREVIEW_EMAIL_INTAKE_RATE_LIMIT } from '../../src/cargo-preview-email/domain/cargo-preview-email.constant.js'
import { buildMime, buildOriginalMime, gmailForwardText } from './mime.fixture.js'
import {
  COMPANY_ID,
  CONTRACTOR_ID,
  FORWARDER,
  ORIGINAL,
  PROVIDER_EMAIL_ID,
  READY_PROFILE,
  runIntake,
} from './intake.harness.js'

describe('os tetos da janela de e-mails por contratante (spec 237 T4.7a)', () => {
  test('20 autenticados e 100 não autenticados, em 5 minutos', () => {
    expect(PREVIEW_EMAIL_INTAKE_RATE_LIMIT).toEqual({
      maxAuthenticated: 20,
      maxUnauthenticated: 100,
      windowSeconds: 300,
    })
  })
})

describe('a janela de e-mails por contratante (spec 237 T4.7a)', () => {
  test('consulta pelo relógio do banco: só empresa, contratante e a duração da janela', async () => {
    const run = runIntake()
    await run.result
    expect(run.calls.counts).toEqual([
      { companyId: COMPANY_ID, contractorId: CONTRACTOR_ID, windowSeconds: 300 },
    ])
  })

  test('20 e-mails que passaram do DKIM: ignora, deixa o rastro e não baixa nada', async () => {
    const run = runIntake({ recentIntakes: { authenticated: 20 } })
    expect(await run.result).toEqual({ contractorId: CONTRACTOR_ID, kind: 'rate_limited' })
    expect(run.calls.downloads).toEqual([])
    expect(run.calls.rejections).toEqual([])
    expect(run.calls.rateLimited).toEqual([
      {
        companyId: COMPANY_ID,
        contractorId: CONTRACTOR_ID,
        providerEmailId: PROVIDER_EMAIL_ID,
        receivedAt: new Date('2026-10-06T14:59:00.000Z'),
        windowSeconds: 300,
      },
    ])
  })

  test('100 recusas anteriores ao DKIM NÃO fecham a janela para o encaminhador legítimo (spec 237 T4.7c)', async () => {
    const run = runIntake({ recentIntakes: { unauthenticated: 100 } })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
    expect(run.calls.downloads).toHaveLength(1)
    expect(run.calls.created).toHaveLength(1)
    expect(run.calls.rateLimited).toEqual([])
  })

  test('recusas anteriores ao DKIM não consomem a janela dos aceitos', async () => {
    const run = runIntake({ recentIntakes: { authenticated: 0, unauthenticated: 99 } })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
    expect(run.calls.rateLimited).toEqual([])
  })

  test('19 autenticados ainda passam', async () => {
    const run = runIntake({ recentIntakes: { authenticated: 19 } })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
    expect(run.calls.rateLimited).toEqual([])
  })
})

describe('o contador de não autenticados para de GRAVAR, não de AVALIAR (spec 237 T4.7c, M2)', () => {
  const junkSender = { from: 'Intruso <intruso@evil.example>' }
  const saturated = { unauthenticated: 100 }

  test('encaminhador fora da lista, janela cheia: a recusa volta com o código, sem linha nova e com um rastro', async () => {
    const run = runIntake({ received: junkSender, recentIntakes: saturated })
    expect(await run.result).toEqual({
      contractorId: CONTRACTOR_ID,
      kind: 'rejected',
      reason: 'FORWARDER_NOT_ALLOWED',
    })
    expect(run.calls.rejections).toEqual([])
    expect(run.calls.rateLimited).toHaveLength(1)
    expect(run.calls.downloads).toEqual([])
  })

  test('janela com espaço: a mesma recusa grava a linha como sempre', async () => {
    const run = runIntake({ received: junkSender, recentIntakes: { unauthenticated: 99 } })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'FORWARDER_NOT_ALLOWED' })
    expect(run.calls.rejections).toHaveLength(1)
    expect(run.calls.rateLimited).toEqual([])
  })

  test('perfil sem a prévia ligada, janela cheia: também não grava', async () => {
    const run = runIntake({
      profiles: [{ ...READY_PROFILE, isPreviewReady: false }],
      recentIntakes: saturated,
    })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'PREVIEW_NOT_ENABLED' })
    expect(run.calls.rejections).toEqual([])
    expect(run.calls.rateLimited).toHaveLength(1)
  })

  test('DKIM que não alinha, janela cheia: sem linha nova (a recusa era anterior ao DKIM)', async () => {
    const run = runIntake({ dkim: 'not_aligned', recentIntakes: saturated })
    expect(await run.result).toMatchObject({
      kind: 'rejected',
      reason: 'FORWARDER_DKIM_NOT_ALIGNED',
    })
    expect(run.calls.rejections).toEqual([])
    expect(run.calls.rateLimited).toHaveLength(1)
  })

  test('recusa DEPOIS de o remetente original passar na lista conta nos autenticados e continua gravando', async () => {
    const run = runIntake({
      rawEmail: buildMime({
        attachments: [],
        from: `Equipe <${FORWARDER}>`,
        text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
      }),
      recentIntakes: saturated,
    })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'ATTACHMENT_MISSING' })
    expect(run.calls.rejections).toHaveLength(1)
    expect(run.calls.rateLimited).toEqual([])
  })
  test('20 autenticados e encaminhador fora da lista: a checagem barata continua gravando a recusa', async () => {
    const run = runIntake({ received: junkSender, recentIntakes: { authenticated: 20 } })
    expect(await run.result).toMatchObject({ kind: 'rejected', reason: 'FORWARDER_NOT_ALLOWED' })
    expect(run.calls.rejections).toHaveLength(1)
    expect(run.calls.downloads).toEqual([])
  })

  test('as duas janelas cheias e um encaminhador legítimo: o teto de autenticados fecha antes do download', async () => {
    const run = runIntake({ recentIntakes: { authenticated: 20, unauthenticated: 100 } })
    expect(await run.result).toEqual({ contractorId: CONTRACTOR_ID, kind: 'rate_limited' })
    expect(run.calls.downloads).toEqual([])
    expect(run.calls.dkimVerifications).toEqual([])
    expect(run.calls.rateLimited).toHaveLength(1)
  })
})

describe('o DKIM alinhado a quem NÃO prova o encaminhador não consome a janela de autenticados (spec 237 T4.7d, D-B e D-C)', () => {
  const forwardedFrom = (from: string) => gmailForwardText({ from })
  const withText = (text: string) =>
    buildMime({ attachments: [], from: `Equipe <${FORWARDER}>`, text })
  const twoForwards = buildMime({
    attachments: [],
    forwardedMessages: [
      buildOriginalMime({ from: `FR <${ORIGINAL}>` }),
      buildOriginalMime({ from: `FR <${ORIGINAL}>` }),
    ],
    from: `Equipe <${FORWARDER}>`,
  })
  const CASES = [
    [
      'MIME_UNREADABLE (dois From)',
      { rawEmail: buildMime({ extraHeaders: ['From: outro@x.example'], from: FORWARDER }) },
    ],
    ['FORWARDER_FROM_MISMATCH', { headerFrom: ['mallory@evil.example'] }],
    [
      'FORWARDER_NOT_ALLOWED (From do MIME alinhado a outro domínio)',
      {
        headerFrom: ['intruso@evil.example'],
        rawEmail: buildMime({ attachments: [], from: 'Intruso <intruso@evil.example>' }),
      },
    ],
    ['ORIGINAL_SENDER_MISSING (reenvio de mensagem assinada)', { rawEmail: withText('oi') }],
    ['ORIGINAL_SENDER_AMBIGUOUS', { rawEmail: twoForwards }],
    [
      'ORIGINAL_SENDER_NOT_ALLOWED',
      { rawEmail: withText(forwardedFrom('Outro <outro@alheio.example>')) },
    ],
  ] as const

  test.each(CASES)(
    '%s: com a janela de recusas cheia não grava linha, só o rastro',
    async (_name, options) => {
      const run = runIntake({ ...options, recentIntakes: { unauthenticated: 100 } })
      expect((await run.result).kind).toBe('rejected')
      expect(run.calls.rejections).toEqual([])
      expect(run.calls.rateLimited).toHaveLength(1)
    },
  )

  test.each(CASES)(
    '%s: com a janela de recusas com espaço grava a linha com o código',
    async (_name, options) => {
      const run = runIntake({ ...options, recentIntakes: { unauthenticated: 99 } })
      expect((await run.result).kind).toBe('rejected')
      expect(run.calls.rejections).toHaveLength(1)
      expect(run.calls.rateLimited).toEqual([])
    },
  )

  test('a recusa por DKIM não alinhado e a por teto de abertas seguem como antes', async () => {
    const notAligned = runIntake({ dkim: 'not_aligned', recentIntakes: { unauthenticated: 100 } })
    expect((await notAligned.result).kind).toBe('rejected')
    expect(notAligned.calls.rejections).toEqual([])
  })
})
