/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ATTACHMENT_FIELD_LABEL,
  listAttachmentDivergences,
} from '../../src/modules/fleet/shared/attachmentDivergence.service'
import type {
  AggregateApplication,
  AggregateApplicationAttachment,
} from '../../src/modules/fleet/shared/aggregateApplicationClient.service'

const APPLICATION = {
  companyId: 'c1',
  createdAt: '2026-09-01T00:00:00Z',
  declaredData: {
    driver: { licenseCategory: 'AD', licenseNumber: '01234567890' },
    vehicle: { brand: 'FIAT', model: 'FIORINO', modelYear: 2021, plate: 'GCQ8E47' },
  },
  driverId: null,
  duplicateDriverId: null,
  email: 'maria@example.com',
  id: 'a1',
  latestSubmission: null,
  name: 'Maria de Sousa',
  phone: '11999999999',
  rejectionReason: '',
  resubmittedAt: null,
  reviewedAt: null,
  status: 'pending',
  taxId: '11144477735',
  updatedAt: '2026-09-01T00:00:00Z',
} as const satisfies AggregateApplication

function attachmentWith(
  extractedFields: Readonly<Record<string, string | null>> | null,
): AggregateApplicationAttachment {
  return {
    extractedFields,
    id: 'att1',
    status: 'pending',
    type: 'cnh',
  } as AggregateApplicationAttachment
}

describe('os campos lidos da CNH chegam à revisão do operador', () => {
  test('todo campo que o OCR da CNH escreve tem rótulo, e nenhum é a chave crua', () => {
    for (const field of ['licenseCategory', 'licenseNumber', 'name']) {
      expect(ATTACHMENT_FIELD_LABEL[field]).toBeDefined()
      expect(ATTACHMENT_FIELD_LABEL[field]).not.toBe(field)
    }
  })

  test('CNH que diverge do declarado vira divergência com rótulo', () => {
    const divergences = listAttachmentDivergences({
      application: APPLICATION,
      attachment: attachmentWith({ licenseNumber: '09876543210', name: 'Maria de Sousa' }),
    })

    expect(divergences).toContainEqual({
      declared: '01234567890',
      field: 'licenseNumber',
      read: '09876543210',
    })
    // o nome bate, e o que bate não é divergência
    expect(divergences.map((divergence) => divergence.field)).not.toContain('name')
  })

  test('campo que a leitura não achou não é divergência', () => {
    const divergences = listAttachmentDivergences({
      application: APPLICATION,
      attachment: attachmentWith({ licenseCategory: null, licenseNumber: null, name: null }),
    })

    expect(divergences).toEqual([])
  })

  test('anexo sem leitura nenhuma não produz divergência', () => {
    expect(
      listAttachmentDivergences({ application: APPLICATION, attachment: attachmentWith(null) }),
    ).toEqual([])
  })

  /** Agregado que roda com veículo de terceiro é caso normal: aparece para o operador saber. */
  test('proprietário do CRLV diferente do candidato aparece como divergência, não como erro', () => {
    const divergences = listAttachmentDivergences({
      application: APPLICATION,
      attachment: attachmentWith({ ownerName: 'João Pereira', plate: 'GCQ8E47' }),
    })

    expect(divergences).toContainEqual({
      declared: 'Maria de Sousa',
      field: 'ownerName',
      read: 'João Pereira',
    })
    // a placa bate: leitura que confirma não vira aviso
    expect(divergences.map((divergence) => divergence.field)).not.toContain('plate')
  })

  test('a comparação é canônica: máscara não vira divergência', () => {
    const divergences = listAttachmentDivergences({
      application: APPLICATION,
      attachment: attachmentWith({ plate: 'GCQ-8E47' }),
    })

    expect(divergences.map((divergence) => divergence.field)).not.toContain('plate')
  })
})
