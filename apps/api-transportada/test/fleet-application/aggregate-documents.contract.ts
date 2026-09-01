/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateDocumentUseCase } from '../../src/fleet/application/aggregate-document.use-case.js'
import { AggregateDocumentInvalidUploadError } from '../../src/fleet/domain/aggregate-document.error.js'
import {
  FakeAggregateDocumentRepository,
  FakeAggregateDocumentStorage,
} from '../fixtures/aggregate-documents.fixture.js'

const COMPANY_ID = crypto.randomUUID()
const TAX_ID = '12345678901'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
/** PNG mínimo válido (assinatura + resto arbitrário) — imagem é o que vai para o OCR. */
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0])

function buildUseCase() {
  const repository = new FakeAggregateDocumentRepository()
  const storage = new FakeAggregateDocumentStorage()
  const useCase = createAggregateDocumentUseCase({ bucket: 'test-bucket', repository, storage })
  return { repository, storage, useCase }
}

describe('aggregate document use case', () => {
  test('lists both required document types even when nothing was uploaded yet', async () => {
    const { useCase } = buildUseCase()

    const list = await useCase.list({ companyId: COMPANY_ID, taxId: TAX_ID })

    expect(list).toEqual([
      { document: null, type: 'cnh' },
      { document: null, type: 'crlv' },
    ])
  })

  test('rejects an upload whose bytes do not match a known file signature', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.upload({
        bytes: new Uint8Array([1, 2, 3]),
        companyId: COMPANY_ID,
        taxId: TAX_ID,
        type: 'cnh',
      }),
    ).rejects.toBeInstanceOf(AggregateDocumentInvalidUploadError)
  })

  test('rejects an empty upload', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.upload({
        bytes: new Uint8Array(0),
        companyId: COMPANY_ID,
        taxId: TAX_ID,
        type: 'cnh',
      }),
    ).rejects.toBeInstanceOf(AggregateDocumentInvalidUploadError)
  })

  test('stores a valid PDF and marks it pending', async () => {
    const { storage, useCase } = buildUseCase()

    const document = await useCase.upload({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(document.status).toBe('pending')
    expect(document.type).toBe('cnh')
    expect(storage.storeCalls).toHaveLength(1)
    expect(storage.storeCalls[0]?.key).toContain(TAX_ID)
    expect(storage.storeCalls[0]?.key).toContain('cnh')
  })

  test('a resend replaces the previous document for the same type, not adds a second one', async () => {
    const { useCase } = buildUseCase()
    await useCase.upload({ bytes: PDF_BYTES, companyId: COMPANY_ID, taxId: TAX_ID, type: 'cnh' })
    await useCase.upload({ bytes: PDF_BYTES, companyId: COMPANY_ID, taxId: TAX_ID, type: 'cnh' })

    const list = await useCase.list({ companyId: COMPANY_ID, taxId: TAX_ID })

    expect(list.find((item) => item.type === 'cnh')?.document).not.toBeNull()
    expect(list.filter((item) => item.type === 'cnh')).toHaveLength(1)
  })

  test('without OCR configured, upload never extracts nor auto-approves', async () => {
    const { useCase } = buildUseCase()

    const result = await useCase.upload({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(result.extracted).toBeNull()
    expect(result.status).toBe('pending')
  })

  test('with OCR configured and a high-confidence match, the document auto-approves', async () => {
    const repository = new FakeAggregateDocumentRepository()
    repository.declaredFieldsByTaxId.set(TAX_ID, {
      licenseCategory: 'AE',
      licenseNumber: '12345678901',
      name: 'Fulano De Tal',
      plate: null,
      renavam: null,
    })
    const storage = new FakeAggregateDocumentStorage()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: {
        extractText: async () => 'NOME: FULANO DE TAL\nN HABILITACAO 12345678901\nCAT. HAB. AE',
      },
      repository,
      storage,
    })

    const result = await useCase.upload({
      bytes: PNG_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(result.status).toBe('approved')
    expect(result.extracted).not.toBeNull()
  })

  /**
   * Cartão CNPJ, RNTRC e CRLV-e digital chegam em PDF com camada de texto. Antes o host desviava
   * todo PDF antes de tentar ler, e esses documentos passavam sem conferência nenhuma.
   */
  test('extracts from a PDF instead of skipping it', async () => {
    const repository = new FakeAggregateDocumentRepository()
    repository.declaredFieldsByTaxId.set(TAX_ID, {
      licenseCategory: null,
      licenseNumber: null,
      name: null,
      plate: 'DFJ2208',
      renavam: '00761638261',
    })
    const storage = new FakeAggregateDocumentStorage()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: { extractText: async () => 'PLACA DFJ2208 CODIGO RENAVAM 00761638261' },
      repository,
      storage,
    })

    const result = await useCase.upload({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'crlv',
    })

    expect(result.extracted).not.toBeNull()
  })

  /** Texto vazio é ausência, e ausência não é extração: CNH-e em PDF é imagem embutida. */
  test('treats empty text as no extraction at all', async () => {
    const repository = new FakeAggregateDocumentRepository()
    const storage = new FakeAggregateDocumentStorage()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: { extractText: async () => '   \n  ' },
      repository,
      storage,
    })

    const result = await useCase.upload({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'crlv',
    })

    expect(result.extracted).toBeNull()
  })

  test('with OCR configured but a low-confidence match, the document stays pending', async () => {
    const repository = new FakeAggregateDocumentRepository()
    repository.declaredFieldsByTaxId.set(TAX_ID, {
      licenseCategory: 'B',
      licenseNumber: '99999999999',
      name: 'Outro Nome',
      plate: null,
      renavam: null,
    })
    const storage = new FakeAggregateDocumentStorage()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: {
        extractText: async () => 'NOME: FULANO DE TAL\nN HABILITACAO 12345678901\nCAT. HAB. AE',
      },
      repository,
      storage,
    })

    const result = await useCase.upload({
      bytes: PNG_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(result.status).toBe('pending')
    expect(result.extracted).not.toBeNull()
  })

  /**
   * Sem gravar, a divergência só existia no instante do upload: o operador abre a fila minutos
   * depois e não tem com o que comparar. É o que fazia a revisão ser um sim/não no escuro.
   */
  test('what the OCR read is stored, so the review that comes later can compare', async () => {
    const repository = new FakeAggregateDocumentRepository()
    repository.declaredFieldsByTaxId.set(TAX_ID, {
      licenseCategory: 'B',
      licenseNumber: '99999999999',
      name: 'Outro Nome',
      plate: null,
      renavam: null,
    })
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: {
        extractText: async () => 'NOME: FULANO DE TAL\nN HABILITACAO 12345678901\nCAT. HAB. AE',
      },
      repository,
      storage: new FakeAggregateDocumentStorage(),
    })

    const uploaded = await useCase.upload({
      bytes: PNG_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(repository.extractedByDocumentId.get(uploaded.id)).toEqual({
      licenseCategory: 'AE',
      licenseNumber: '12345678901',
      name: 'Fulano De Tal',
    })

    const [forReview] = await repository.listPendingByCompany({ companyId: COMPANY_ID })
    expect(forReview?.hasExtraction).toBe(true)
    expect(forReview?.divergences.map((item) => item.field).sort()).toEqual([
      'licenseCategory',
      'licenseNumber',
      'name',
    ])
  })

  /** "Nada divergiu" e "não deu para conferir" são coisas diferentes para quem aprova. */
  test('a document with no reading is listed as unverified, not as divergence-free', async () => {
    const repository = new FakeAggregateDocumentRepository()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      repository,
      storage: new FakeAggregateDocumentStorage(),
    })

    await useCase.upload({
      bytes: PNG_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    const [forReview] = await repository.listPendingByCompany({ companyId: COMPANY_ID })
    expect(forReview?.hasExtraction).toBe(false)
    expect(forReview?.divergences).toEqual([])
  })

  test('an OCR failure never blocks the upload — it just falls back to no extraction', async () => {
    const repository = new FakeAggregateDocumentRepository()
    const storage = new FakeAggregateDocumentStorage()
    const useCase = createAggregateDocumentUseCase({
      bucket: 'test-bucket',
      ocr: {
        extractText: async () => {
          throw new Error('ocr service unreachable')
        },
      },
      repository,
      storage,
    })

    const result = await useCase.upload({
      bytes: PNG_BYTES,
      companyId: COMPANY_ID,
      taxId: TAX_ID,
      type: 'cnh',
    })

    expect(result.status).toBe('pending')
    expect(result.extracted).toBeNull()
  })
})
