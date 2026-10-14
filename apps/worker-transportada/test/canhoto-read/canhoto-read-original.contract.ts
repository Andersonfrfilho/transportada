/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T008: a fila da rotina `trip.canhoto.read` lê o **original** quando ele existe e deixa para
 * o trilho do comprovante o que ainda está `received`/`processing`. O plano contra o Postgres de
 * verdade está em `integration/canhoto-read-queue.integration.ts`; aqui, a forma da consulta e a
 * leitura de uma imagem degradada contra o original.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

import { createCanhotoImageReader } from '../../src/canhoto-read/application/canhoto-image-reader.service.js'
import type { PendingCanhotoProof } from '../../src/canhoto-read/application/canhoto-read-queue.port.js'
import { buildPendingCanhotoProofsQuery } from '../../src/canhoto-read/infrastructure/drizzle-canhoto-read-queue.repository.js'
import { createThreadedCanhotoBarcodeDecoder } from '../../src/canhoto-read/infrastructure/threaded-canhoto-barcode.decoder.js'
import { createStorageAttachmentReaderGateway } from '../../src/aggregate-attachment/infrastructure/storage-attachment-reader.gateway.js'
import { processDeliveryProofImage } from '../../src/delivery-proof-processing/infrastructure/delivery-proof-image.processing.js'
import { buildCanhotoPhoto, CANHOTO_PHOTO_ACCESS_KEY } from '../fixtures/canhoto-photo.fixture.js'

const dialect = new PgDialect()

function renderedQuery(): string {
  return dialect
    .sqlToQuery(buildPendingCanhotoProofsQuery({ excludeProofIds: [], limit: 40 }))
    .sql.replace(/\s+/gu, ' ')
}

describe('fila da leitura do canhoto com o original (spec 265 T008)', () => {
  test('lê o objeto do original quando ele existe, senão o da linha', () => {
    expect(renderedQuery()).toContain(
      'on o."id" = coalesce(p."original_object_id", p."object_id") and o."company_id" = p."company_id"',
    )
  })

  test('deixa para o trilho o que ainda está received ou processing', () => {
    const sql = renderedQuery()

    expect(sql).toContain(
      `(p."processing_state" is null or p."processing_state" in ('ready', 'processing_failed'))`,
    )
    expect(sql).not.toContain(`'received'`)
  })

  test('os três predicados do índice parcial seguem literais (nada de parâmetro)', () => {
    const sql = renderedQuery()

    expect(sql).toContain(`p."canhoto_review" = 'pending'`)
    expect(sql).toContain('p."canhoto_read_source" is null')
    expect(sql).toContain('p."canhoto_read_attempted_at" is null')
  })
})

describe('leitura do canhoto contra o original (spec 265 T008)', () => {
  const degradedProof = (bytes: Uint8Array): PendingCanhotoProof => ({
    bucket: 'bucket',
    companyId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    mimeType: 'image/jpeg',
    objectKey: 'key',
    proofId: crypto.randomUUID(),
    sizeBytes: bytes.byteLength,
    tripId: crypto.randomUUID(),
  })

  /**
   * O motivo da spec: o código de barras de 4 px por módulo, reduzido a 2000 px e recomprimido em
   * qualidade baixa no aparelho, perde o fio; o original o tem inteiro.
   */
  test('a imagem degradada não lê, o original lê: é por isso que a leitura é sobre o original', async () => {
    const original = await buildCanhotoPhoto({
      format: 'jpeg',
      hasBarcode: true,
      heightPixels: 4032,
      moduleWidthPixels: 2,
      widthPixels: 3024,
    })
    const degraded = await degrade(original)
    const read = async (bytes: Uint8Array) => {
      const reader = createCanhotoImageReader({
        decoder: createThreadedCanhotoBarcodeDecoder(),
        objectReader: createStorageAttachmentReaderGateway({
          storage: {
            getObjectStream: async () =>
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes)
                  controller.close()
                },
              }),
          },
        }),
      })
      const result = await reader.read(degradedProof(bytes))
      return result.kind === 'read' ? result.text : null
    }

    expect(await read(original)).toBe(CANHOTO_PHOTO_ACCESS_KEY)
    expect(await read(degraded)).not.toBe(CANHOTO_PHOTO_ACCESS_KEY)
  }, 180_000)
})

/** A miniatura de 320 px como "imagem degradada": o módulo de 2 px vira 0,2 px, e nenhuma barra sobrevive. */
async function degrade(original: Uint8Array): Promise<Uint8Array> {
  const result = await processDeliveryProofImage(
    { bytes: original, mediaType: 'image/jpeg', readBarcode: false, withThumbnail: true },
    undefined,
  )
  if (result.kind !== 'processed' || result.thumbnail === null) throw new Error('fixture failed')
  return result.thumbnail.bytes
}
