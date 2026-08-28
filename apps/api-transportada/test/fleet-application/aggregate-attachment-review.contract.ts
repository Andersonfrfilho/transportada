/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateApplicationAttachmentReviewUseCase } from '../../src/fleet/application/aggregate-application-attachment-review.use-case.js'

const COMPANY_ID = crypto.randomUUID()
const APPLICATION_ID = crypto.randomUUID()
const REVIEWER_ID = crypto.randomUUID()

function buildUseCase(
  attachment: Readonly<{ id: string; status: string; taxId: string; type: string }> | null = {
    id: crypto.randomUUID(),
    status: 'pending',
    taxId: '12345678909',
    type: 'cnh',
  },
) {
  const promoted: unknown[] = []
  const reviewed: unknown[] = []

  const useCase = createAggregateApplicationAttachmentReviewUseCase({
    repository: {
      findForReview: async () => attachment,
      listByApplication: async () => (attachment === null ? [] : [attachment]),
      promoteToAggregateDocument: async (input) => {
        promoted.push(input)
      },
      review: async (input) => {
        reviewed.push(input)
        return attachment === null ? null : { ...attachment, status: input.decision }
      },
    },
  })

  return { promoted, reviewed, useCase }
}

const context = { companyId: COMPANY_ID, userId: REVIEWER_ID }

describe('revisão do anexo de candidatura', () => {
  test('aprovar registra a decisão e quem decidiu', async () => {
    const { reviewed, useCase } = buildUseCase()

    await useCase.review({
      attachmentId: crypto.randomUUID(),
      context,
      decision: 'approved',
      rejectionReason: '',
    })

    expect(reviewed).toHaveLength(1)
  })

  /** Recusa sem motivo deixa o agregado sem saber o que corrigir — o CHECK do banco também proíbe. */
  test('reprovar sem motivo é recusado', async () => {
    const { reviewed, useCase } = buildUseCase()

    await expect(
      useCase.review({
        attachmentId: crypto.randomUUID(),
        context,
        decision: 'rejected',
        rejectionReason: '   ',
      }),
    ).rejects.toThrow()
    expect(reviewed).toEqual([])
  })

  /** CNH e CRLV existem em `aggregate_documents`: aprovar promove, e a conta não os pede de novo. */
  test('aprovar CNH promove o anexo a documento da conta', async () => {
    const { promoted, useCase } = buildUseCase({
      id: crypto.randomUUID(),
      status: 'pending',
      taxId: '12345678909',
      type: 'cnh',
    })

    await useCase.review({
      attachmentId: crypto.randomUUID(),
      context,
      decision: 'approved',
      rejectionReason: '',
    })

    expect(promoted).toHaveLength(1)
  })

  /**
   * O CCMEI **não** é promovido: `aggregate_documents` lista "os tipos exigidos" de todo agregado, e
   * acrescentar o CCMEI ali faria o portal cobrar certificado de MEI de todo motorista — inclusive
   * de quem não é. Ele é prova da empresa, e fica como anexo da candidatura.
   */
  test('aprovar CCMEI não o promove a documento da conta', async () => {
    const { promoted, useCase } = buildUseCase({
      id: crypto.randomUUID(),
      status: 'pending',
      taxId: '12345678909',
      type: 'ccmei',
    })

    await useCase.review({
      attachmentId: crypto.randomUUID(),
      context,
      decision: 'approved',
      rejectionReason: '',
    })

    expect(promoted).toEqual([])
  })

  test('reprovar não promove nada', async () => {
    const { promoted, useCase } = buildUseCase()

    await useCase.review({
      attachmentId: crypto.randomUUID(),
      context,
      decision: 'rejected',
      rejectionReason: 'Documento ilegível',
    })

    expect(promoted).toEqual([])
  })

  /** Anexo de outra empresa é ausência, e ausência é `null` — nunca uma decisão gravada. */
  test('anexo que o tenant não possui não é revisado', async () => {
    const { reviewed, useCase } = buildUseCase(null)

    await expect(
      useCase.review({
        attachmentId: crypto.randomUUID(),
        context,
        decision: 'approved',
        rejectionReason: '',
      }),
    ).rejects.toThrow()
    expect(reviewed).toEqual([])
  })

  test('lista os anexos da candidatura', async () => {
    const { useCase } = buildUseCase()

    const list = await useCase.list({ applicationId: APPLICATION_ID, context })

    expect(list).toHaveLength(1)
  })
})

describe('rotas de revisão do anexo', () => {
  /**
   * Bater na URL não distingue rota registrada de caminho inexistente aqui: rota autenticada
   * responde `401` nos dois casos, e foi por isso que o defeito da rota **pública** só apareceu
   * calibrando contra outras rotas anônimas. Para as autenticadas, o que resta é conferir o que a
   * fábrica declara — e o lint garante que ela é usada, porque fábrica importada e não espalhada
   * vira import morto.
   */
  test('declara listar, revisar e baixar, todas sob fleet.manage', async () => {
    const { createAggregateApplicationAttachmentReviewRoutes } = await import(
      '../../src/fleet/presentation/aggregate-application-attachment-review.routes.js'
    )

    const routes = createAggregateApplicationAttachmentReviewRoutes({
      attachmentReview: {
        list: async () => [],
        review: async () => ({ id: '', status: 'approved', taxId: '', type: 'cnh' }),
      },
      createSignedDownload: async () => new URL('https://example.test/o'),
      findDownloadLocation: async () => null,
    })

    expect(routes.map((route) => `${route.method} ${route.pathname}`)).toEqual([
      'GET /aggregate-applications/:applicationId/attachments',
      'POST /aggregate-applications/:applicationId/attachments/:attachmentId/review',
      'GET /aggregate-applications/:applicationId/attachments/:attachmentId/download',
    ])
    expect(routes.every((route) => route.policy?.permission === 'fleet.manage')).toBe(true)
  })
})
