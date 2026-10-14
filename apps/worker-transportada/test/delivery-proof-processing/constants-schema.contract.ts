/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265: as cópias por valor da API — as réguas (212/213/220), os estados e as colunas — presas por
 * número. O worker não importa código de outra app; se um lado muda e o outro não, é aqui que quebra.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  DELIVERY_PROOF_PROCESSING_STATES,
  deliveryProofOutbox,
  deliveryProofProcessingProofs,
} from '../../src/database/delivery-proof-processing.schema.js'
import {
  DELIVERY_PROOF_PROCESSING_ERROR_CODES,
  DELIVERY_PROOF_PROCESSING_EVENT_TYPE,
  PROOF_MAX_PIXELS,
  PROOF_OBJECT_PURPOSE,
  PROOF_ORIGINAL_MAX_BYTES,
  PROOF_REDUCED_MAX_BYTES,
  PROOF_REDUCED_MAX_SIDE,
  PROOF_REDUCED_TARGET_BYTES,
  PROOF_THUMBNAIL_MAX_BYTES,
  PROOF_THUMBNAIL_MAX_SIDE,
  PROOF_THUMBNAIL_OBJECT_PURPOSE,
  PROOF_THUMBNAIL_START_QUALITY,
  PROOF_THUMBNAIL_TARGET_BYTES,
} from '../../src/delivery-proof-processing/domain/delivery-proof-processing.constant.js'

describe('constantes do tratamento do comprovante (cópia da API e do aparelho)', () => {
  test('a régua da 212: 2000 px, alvo ~900 KiB, teto de 960 KiB', () => {
    expect(PROOF_REDUCED_MAX_SIDE).toBe(2000)
    expect(PROOF_REDUCED_TARGET_BYTES).toBe(900 * 1024)
    expect(PROOF_REDUCED_MAX_BYTES).toBe(960 * 1024)
  })

  test('a miniatura da 213/220 RF17: 320 px, qualidade 0,7, alvo 60 KiB, teto 128 KiB', () => {
    expect(PROOF_THUMBNAIL_MAX_SIDE).toBe(320)
    expect(PROOF_THUMBNAIL_START_QUALITY).toBe(70)
    expect(PROOF_THUMBNAIL_TARGET_BYTES).toBe(60 * 1024)
    expect(PROOF_THUMBNAIL_MAX_BYTES).toBe(128 * 1024)
  })

  test('o teto do original é o da API (12 MiB) e o de pixels cobre a câmera de 48 MP binada', () => {
    expect(PROOF_ORIGINAL_MAX_BYTES).toBe(12 * 1024 * 1024)
    expect(PROOF_MAX_PIXELS).toBeGreaterThanOrEqual(12_000_000)
    expect(PROOF_MAX_PIXELS).toBeLessThanOrEqual(50_000_000)
  })

  test('os propósitos dos objetos são os da API', () => {
    expect(PROOF_OBJECT_PURPOSE).toBe('delivery_proof')
    expect(PROOF_THUMBNAIL_OBJECT_PURPOSE).toBe('trip_delivery_proof_thumbnail')
  })

  test('o tipo do evento é o que o relay publica, e o código de erro cabe na coluna varchar(64)', () => {
    expect(DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED).toBe(
      'transportada.delivery-proof.processing.requested',
    )
    for (const code of Object.values(DELIVERY_PROOF_PROCESSING_ERROR_CODES)) {
      expect(code).toMatch(/^[A-Z_]+$/u)
      expect(code.length).toBeLessThanOrEqual(64)
    }
  })
})

describe('schema Drizzle copiado da API (spec 265)', () => {
  test('os estados são os do CHECK da API', () => {
    expect(DELIVERY_PROOF_PROCESSING_STATES).toEqual([
      'received',
      'processing',
      'ready',
      'processing_failed',
    ])
  })

  test('delivery_proof_outbox tem as colunas da API, na ordem', () => {
    const config = getTableConfig(deliveryProofOutbox)
    expect(config.name).toBe('delivery_proof_outbox')
    expect(config.columns.map((column) => column.name)).toEqual([
      'id',
      'event_id',
      'company_id',
      'proof_id',
      'event_type',
      'event_version',
      'correlation_id',
      'payload',
      'attempt',
      'claim_owner',
      'claim_expires_at',
      'next_attempt_at',
      'published_at',
      'created_at',
      'updated_at',
    ])
  })

  test('trip_delivery_proofs: as colunas do tratamento existem com o tipo e o tamanho da API', () => {
    const config = getTableConfig(deliveryProofProcessingProofs)
    expect(config.name).toBe('trip_delivery_proofs')
    const byName = new Map(config.columns.map((column) => [column.name, column]))
    // ⚠️ A API declarou `varchar(16)` e 'processing_failed' tem 17 caracteres (defeito relatado no PR da
    // fase API): o comprimento fica de fora até a migration corretiva, e o tipo continua preso.
    expect(byName.get('processing_state')?.getSQLType()).toStartWith('varchar(')
    expect(byName.get('original_object_id')?.getSQLType()).toBe('uuid')
    expect(byName.get('processing_error')?.getSQLType()).toBe('varchar(64)')
    for (const name of ['processing_state', 'original_object_id', 'processing_error']) {
      expect(byName.get(name)?.notNull).toBe(false)
    }
    expect(byName.get('object_id')?.notNull).toBe(true)
    expect(byName.get('thumbnail_object_id')?.notNull).toBe(false)
  })
})
