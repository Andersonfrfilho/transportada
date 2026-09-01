/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { listAttachmentDivergences } from '@/modules/fleet/shared/attachmentDivergence.service'
import type {
  AggregateApplication,
  AggregateApplicationAttachment,
} from '@/modules/fleet/shared/aggregateApplicationClient.service'

function buildApplication(
  overrides: Readonly<{ company?: Record<string, unknown>; taxId?: string }> = {},
): AggregateApplication {
  return {
    companyId: 'c',
    createdAt: '',
    declaredData: { company: overrides.company ?? {} },
    driverId: null,
    duplicateDriverId: null,
    email: '',
    id: 'a',
    latestSubmission: null,
    name: '',
    phone: '',
    rejectionReason: '',
    resubmittedAt: null,
    reviewedAt: null,
    status: 'pending',
    taxId: overrides.taxId ?? '',
    updatedAt: '',
  }
}

function buildAttachment(
  extractedFields: AggregateApplicationAttachment['extractedFields'],
): AggregateApplicationAttachment {
  return {
    extractedFields,
    id: 'x',
    rejectionReason: '',
    status: 'pending',
    taxId: '',
    type: 'ccmei',
  }
}

describe('divergência do anexo contra a candidatura', () => {
  test('CNPJ diferente do declarado é sinalizado', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication({ taxId: '11222333000181' }),
      attachment: buildAttachment({ cnpj: '30213061000106' }),
    })

    expect(divergences).toEqual([
      { declared: '11222333000181', field: 'cnpj', read: '30213061000106' },
    ])
  })

  /** Máscara é do teclado: comparar com ponto e barra acusaria divergência em documento correto. */
  test('o mesmo CNPJ com e sem máscara não diverge', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication({ taxId: '30.213.061/0001-06' }),
      attachment: buildAttachment({ cnpj: '30213061000106' }),
    })

    expect(divergences).toEqual([])
  })

  test('campo que a leitura não achou não é divergência', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication({ taxId: '11222333000181' }),
      attachment: buildAttachment({ cnpj: null }),
    })

    expect(divergences).toEqual([])
  })

  test('campo que ninguém declarou não é divergência', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication(),
      attachment: buildAttachment({ cnpj: '30213061000106' }),
    })

    expect(divergences).toEqual([])
  })

  /** Sem leitura do servidor não há conferência — e isso é estado próprio, não "confere". */
  test('anexo sem extração não produz divergência nenhuma', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication({ taxId: '11222333000181' }),
      attachment: buildAttachment(null),
    })

    expect(divergences).toEqual([])
  })

  test('razão social e nome fantasia também são conferidos', () => {
    const divergences = listAttachmentDivergences({
      application: buildApplication({
        company: { legalName: 'OUTRA EMPRESA LTDA', tradeName: 'OUTRA' },
      }),
      attachment: buildAttachment({ legalName: 'FULANO DE TAL 123', tradeName: 'NEX IT' }),
    })

    expect(divergences.map((divergence) => divergence.field).sort()).toEqual([
      'legalName',
      'tradeName',
    ])
  })
})
