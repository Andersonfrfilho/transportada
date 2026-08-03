/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { createCompanyLogoUseCase } from '../../src/companies/application/company-logo.use-case.js'
import { COMPANY_LOGO_MAX_BYTES } from '../../src/database/company-logo.schema.js'
import {
  CompanyLogoNotFoundError,
  CompanyLogoTooLargeError,
  CompanyLogoUnsupportedFormatError,
} from '../../src/companies/domain/company-logo.error.js'
import { detectCompanyLogoMimeType } from '../../src/companies/domain/company-logo.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  CompanyLogoRepositoryFixture,
  GIF_BYTES,
  JPEG_BYTES,
  PNG_BYTES,
  UPDATED_AT,
} from '../fixtures/company-logo.fixture'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture'

const CONTEXT = COMPANY_CONTEXT as CompanyContext

describe('company logo policy contract', () => {
  test('classifica pela assinatura do arquivo, não pelo que o cliente declarou', () => {
    expect(detectCompanyLogoMimeType(PNG_BYTES)).toBe('image/png')
    expect(detectCompanyLogoMimeType(JPEG_BYTES)).toBe('image/jpeg')
    expect(detectCompanyLogoMimeType(GIF_BYTES)).toBeNull()
    expect(detectCompanyLogoMimeType(new Uint8Array([0x89]))).toBeNull()
    expect(detectCompanyLogoMimeType(new Uint8Array())).toBeNull()
  })
})

describe('company logo use case contract', () => {
  test('grava o logo no tenant autenticado com o digest do conteúdo', async () => {
    const repository = new CompanyLogoRepositoryFixture()

    const metadata = await createCompanyLogoUseCase({ repository }).replace({
      bytes: PNG_BYTES,
      context: CONTEXT,
    })

    expect(metadata).toEqual({
      byteSize: PNG_BYTES.byteLength,
      mimeType: 'image/png',
      sha256: createHash('sha256').update(PNG_BYTES).digest('hex'),
      updatedAt: UPDATED_AT,
    })
    expect(repository.saveCalls[0]?.companyId).toBe(CONTEXT.companyId)
    expect(repository.saveCalls[0]?.contentBase64).toBe(PNG_BYTES.toString('base64'))
  })

  test('substituir troca a imagem sem criar uma segunda linha para a empresa', async () => {
    const repository = new CompanyLogoRepositoryFixture()
    const useCase = createCompanyLogoUseCase({ repository })

    await useCase.replace({ bytes: PNG_BYTES, context: CONTEXT })
    await useCase.replace({ bytes: JPEG_BYTES, context: CONTEXT })

    expect(repository.saveCalls).toHaveLength(2)
    expect(repository.stored?.mimeType).toBe('image/jpeg')
    expect(repository.stored?.bytes).toEqual(JPEG_BYTES)
  })

  test('formato não suportado é recusado antes de chegar ao repositório', async () => {
    const repository = new CompanyLogoRepositoryFixture()

    expect(() =>
      createCompanyLogoUseCase({ repository }).replace({ bytes: GIF_BYTES, context: CONTEXT }),
    ).toThrow(CompanyLogoUnsupportedFormatError)
    expect(repository.saveCalls).toHaveLength(0)
  })

  test('imagem acima do limite é recusada antes de chegar ao repositório', async () => {
    const repository = new CompanyLogoRepositoryFixture()
    const oversized = Buffer.concat([
      PNG_BYTES,
      Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 1 - PNG_BYTES.byteLength),
    ])

    expect(() =>
      createCompanyLogoUseCase({ repository }).replace({ bytes: oversized, context: CONTEXT }),
    ).toThrow(CompanyLogoTooLargeError)
    expect(repository.saveCalls).toHaveLength(0)
  })

  test('buscar ou remover sem logo cadastrado devolve não encontrado', async () => {
    const repository = new CompanyLogoRepositoryFixture()
    const useCase = createCompanyLogoUseCase({ repository })

    expect(useCase.find({ context: CONTEXT })).rejects.toThrow(CompanyLogoNotFoundError)
    expect(useCase.remove({ context: CONTEXT })).rejects.toThrow(CompanyLogoNotFoundError)
  })

  test('remover apaga o logo da empresa autenticada', async () => {
    const repository = new CompanyLogoRepositoryFixture()
    const useCase = createCompanyLogoUseCase({ repository })
    await useCase.replace({ bytes: PNG_BYTES, context: CONTEXT })

    await useCase.remove({ context: CONTEXT })

    expect(repository.removeCalls).toEqual([{ companyId: CONTEXT.companyId }])
    expect(repository.stored).toBeNull()
  })
})
