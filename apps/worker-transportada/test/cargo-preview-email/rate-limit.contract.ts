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
import { COMPANY_ID, CONTRACTOR_ID, PROVIDER_EMAIL_ID, runIntake } from './intake.harness.js'

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

  test('100 recusas anteriores ao DKIM também fecham a janela, com o mesmo rastro', async () => {
    const run = runIntake({ recentIntakes: { unauthenticated: 100 } })
    expect(await run.result).toEqual({ contractorId: CONTRACTOR_ID, kind: 'rate_limited' })
    expect(run.calls.downloads).toEqual([])
    expect(run.calls.rateLimited).toHaveLength(1)
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
