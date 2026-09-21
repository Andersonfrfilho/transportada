/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceAttachmentAppendFingerprint,
  buildOccurrenceAttachmentCreateFingerprint,
  buildOccurrenceAttachmentObjectKey,
  buildOccurrenceThumbnailObjectKey,
  OCCURRENCE_ATTACHMENT_APPEND_OPERATION,
  OCCURRENCE_ATTACHMENT_CREATE_OPERATION,
  OCCURRENCE_ATTACHMENT_LIMIT,
  OCCURRENCE_ATTACHMENT_RETENTION_YEARS,
  OCCURRENCE_PHOTO_MAX_BYTES,
  OCCURRENCE_THUMBNAIL_MAX_BYTES,
  resolveOccurrenceAttachmentRetentionUntil,
} from '../../src/trips/domain/occurrence-attachment.policy.js'

/**
 * Spec 161 T2 (RF3/D13). A política pura de anexo, miniatura e retenção da foto da ocorrência de
 * galpão — sem banco, sem HTTP.
 */
describe('política de anexo da ocorrência de galpão (spec 161 T2)', () => {
  test('o teto é cinco, o mesmo do CHECK duplicado no banco (T1)', () => {
    expect(OCCURRENCE_ATTACHMENT_LIMIT).toBe(5)
  })

  test('os dois tetos de bytes são os declarados na spec (RF3/D13)', () => {
    expect(OCCURRENCE_PHOTO_MAX_BYTES).toBe(512 * 1024)
    expect(OCCURRENCE_THUMBNAIL_MAX_BYTES).toBe(128 * 1024)
  })

  test('retention_until = created_at + 5 anos, para o original', () => {
    const createdAt = new Date('2026-09-21T12:00:00.000Z')
    const retentionUntil = resolveOccurrenceAttachmentRetentionUntil(createdAt)

    expect(OCCURRENCE_ATTACHMENT_RETENTION_YEARS).toBe(5)
    expect(retentionUntil.toISOString()).toBe('2031-09-21T12:00:00.000Z')
  })

  test('retention_until é a mesma conta para a miniatura — as duas vencem juntas', () => {
    const createdAt = new Date('2026-01-31T08:15:30.000Z')

    const originalRetentionUntil = resolveOccurrenceAttachmentRetentionUntil(createdAt)
    const thumbnailRetentionUntil = resolveOccurrenceAttachmentRetentionUntil(createdAt)

    expect(thumbnailRetentionUntil.toISOString()).toBe(originalRetentionUntil.toISOString())
    expect(thumbnailRetentionUntil.getUTCFullYear() - createdAt.getUTCFullYear()).toBe(5)
  })

  test('preserva o dia e a hora, inclusive atravessando 29 de fevereiro', () => {
    const createdAt = new Date('2024-02-29T03:00:00.000Z')
    const retentionUntil = resolveOccurrenceAttachmentRetentionUntil(createdAt)

    // setUTCFullYear em 29/fev + 5 anos cai em 2029, que não é bissexto: vira 1º de março.
    expect(retentionUntil.toISOString()).toBe('2029-03-01T03:00:00.000Z')
  })

  test('a chave do original não carrega nome, CNPJ, número de nota nem PII — só ids opacos', () => {
    const key = buildOccurrenceAttachmentObjectKey({
      companyId: 'a1a1a1a1-0000-4000-8000-000000000001',
      objectId: 'c3c3c3c3-0000-4000-8000-000000000003',
      occurrenceId: 'b2b2b2b2-0000-4000-8000-000000000002',
    })

    expect(key).toBe(
      'tenants/a1a1a1a1-0000-4000-8000-000000000001/trip-occurrence-attachments/b2b2b2b2-0000-4000-8000-000000000002/c3c3c3c3-0000-4000-8000-000000000003',
    )
    assertNoPersonalIdentifiers(key)
  })

  test('a chave da miniatura também não carrega PII e fica ao lado do original', () => {
    const key = buildOccurrenceThumbnailObjectKey({
      companyId: 'a1a1a1a1-0000-4000-8000-000000000001',
      objectId: 'c3c3c3c3-0000-4000-8000-000000000003',
      occurrenceId: 'b2b2b2b2-0000-4000-8000-000000000002',
    })

    expect(
      key.startsWith('tenants/a1a1a1a1-0000-4000-8000-000000000001/trip-occurrence-attachments/'),
    ).toBe(true)
    expect(key).not.toBe(
      buildOccurrenceAttachmentObjectKey({
        companyId: 'a1a1a1a1-0000-4000-8000-000000000001',
        objectId: 'c3c3c3c3-0000-4000-8000-000000000003',
        occurrenceId: 'b2b2b2b2-0000-4000-8000-000000000002',
      }),
    )
    assertNoPersonalIdentifiers(key)
  })

  test('a impressão de criação muda com o conteúdo (tipo, nota, código do produto, foto)', () => {
    const base = {
      attachmentSha256: 'a'.repeat(64),
      note: 'caixa violada',
      occurrenceTypeId: 'item_avariado',
      productCode: 'SKU-1',
    }

    const fingerprint = buildOccurrenceAttachmentCreateFingerprint(base)

    expect(buildOccurrenceAttachmentCreateFingerprint({ ...base, note: 'outra nota' })).not.toBe(
      fingerprint,
    )
    expect(
      buildOccurrenceAttachmentCreateFingerprint({ ...base, attachmentSha256: 'b'.repeat(64) }),
    ).not.toBe(fingerprint)
    expect(buildOccurrenceAttachmentCreateFingerprint(base)).toBe(fingerprint)
  })

  test('produtoCode ausente não colide com productCode vazio — null explícito', () => {
    const withoutProductCode = buildOccurrenceAttachmentCreateFingerprint({
      attachmentSha256: 'a'.repeat(64),
      note: 'caixa violada',
      occurrenceTypeId: 'item_avariado',
    })
    const withNullProductCode = buildOccurrenceAttachmentCreateFingerprint({
      attachmentSha256: 'a'.repeat(64),
      note: 'caixa violada',
      occurrenceTypeId: 'item_avariado',
      productCode: null,
    })

    expect(withoutProductCode).toBe(withNullProductCode)
  })

  test('a impressão do anexo adicional é do sha256 do original, nunca da miniatura', () => {
    const fingerprint = buildOccurrenceAttachmentAppendFingerprint({
      attachmentSha256: 'c'.repeat(64),
      occurrenceId: 'b2b2b2b2-0000-4000-8000-000000000002',
    })

    expect(
      buildOccurrenceAttachmentAppendFingerprint({
        attachmentSha256: 'c'.repeat(64),
        occurrenceId: 'other-occurrence',
      }),
    ).not.toBe(fingerprint)
    expect(
      buildOccurrenceAttachmentAppendFingerprint({
        attachmentSha256: 'd'.repeat(64),
        occurrenceId: 'b2b2b2b2-0000-4000-8000-000000000002',
      }),
    ).not.toBe(fingerprint)
  })

  test('as operações de criação e de anexo adicional são distintas', () => {
    expect(OCCURRENCE_ATTACHMENT_CREATE_OPERATION).toBe('separation.document.occurrence')
    expect(OCCURRENCE_ATTACHMENT_APPEND_OPERATION).toBe('separation.document.occurrence-attachment')
    expect(OCCURRENCE_ATTACHMENT_CREATE_OPERATION).not.toBe(OCCURRENCE_ATTACHMENT_APPEND_OPERATION)
  })
})

const PII_PATTERNS = [
  /nota/i,
  /nf-?e/i,
  /cliente/i,
  /cpf/i,
  /cnpj/i,
  /nome/i,
  /driver/i,
  /motorista/i,
]

function assertNoPersonalIdentifiers(key: string): void {
  for (const pattern of PII_PATTERNS) {
    expect(pattern.test(key)).toBe(false)
  }
}
