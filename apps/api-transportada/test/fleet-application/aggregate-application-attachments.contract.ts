/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateApplicationAttachmentUseCase } from '../../src/fleet/application/aggregate-application-attachment.use-case.js'
import { AggregateDocumentInvalidUploadError } from '../../src/fleet/domain/aggregate-document.error.js'

const COMPANY_ID = crypto.randomUUID()
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0])

type StoredCall = Readonly<{ contentType: string; key: string }>

function buildUseCase() {
  const stored: StoredCall[] = []
  const drafts: Record<string, unknown>[] = []

  const useCase = createAggregateApplicationAttachmentUseCase({
    bucket: 'test-bucket',
    repository: {
      createDraft: async (input) => {
        drafts.push({ ...input })
        return { draftId: input.draftId, type: input.type }
      },
    },
    storage: {
      createSignedDownload: async () => new URL('https://example.test/object'),
      storeObject: async ({ contentType, key }) => {
        stored.push({ contentType, key })
      },
    },
  })

  return { drafts, stored, useCase }
}

describe('anexo de candidatura — envio anônimo', () => {
  test('grava o arquivo e devolve o identificador do rascunho', async () => {
    const { drafts, stored, useCase } = buildUseCase()

    const result = await useCase.uploadDraft({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      type: 'ccmei',
    })

    expect(result.draftId).toMatch(/^[0-9a-f-]{36}$/u)
    expect(result.type).toBe('ccmei')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.contentType).toBe('application/pdf')
    expect(drafts).toHaveLength(1)
  })

  /**
   * A chave do objeto **não** leva CPF nem CNPJ: quem envia é anônimo, e o documento dele ainda não
   * pertence a candidatura nenhuma. `security.md` §7 proíbe dado pessoal no nome da chave.
   */
  test('a chave do objeto não carrega dado pessoal', async () => {
    const { stored, useCase } = buildUseCase()

    await useCase.uploadDraft({ bytes: PDF_BYTES, companyId: COMPANY_ID, type: 'cnh' })

    expect(stored[0]?.key).toContain(`tenants/${COMPANY_ID}/`)
    expect(stored[0]?.key).not.toMatch(/\d{11}/u)
  })

  /** O tipo declarado vem do cliente; só a assinatura do arquivo decide o que é gravado. */
  test('a assinatura do arquivo manda sobre o tipo declarado', async () => {
    const { stored, useCase } = buildUseCase()

    await useCase.uploadDraft({ bytes: PNG_BYTES, companyId: COMPANY_ID, type: 'ccmei' })

    expect(stored[0]?.contentType).toBe('image/png')
  })

  test('arquivo que não é PDF nem imagem é recusado', async () => {
    const { useCase } = buildUseCase()

    await expect(
      useCase.uploadDraft({
        bytes: new Uint8Array([1, 2, 3, 4]),
        companyId: COMPANY_ID,
        type: 'ccmei',
      }),
    ).rejects.toBeInstanceOf(AggregateDocumentInvalidUploadError)
  })

  /** Nada é gravado no banco se o armazenamento falhar: rascunho sem arquivo é linha órfã. */
  test('falha ao armazenar não deixa rascunho no banco', async () => {
    const drafts: unknown[] = []
    const useCase = createAggregateApplicationAttachmentUseCase({
      bucket: 'test-bucket',
      repository: {
        createDraft: async (input) => {
          drafts.push(input)
          return { draftId: input.draftId, type: input.type }
        },
      },
      storage: {
        createSignedDownload: async () => new URL('https://example.test/object'),
        storeObject: async () => {
          throw new Error('bucket fora do ar')
        },
      },
    })

    await expect(
      useCase.uploadDraft({ bytes: PDF_BYTES, companyId: COMPANY_ID, type: 'ccmei' }),
    ).rejects.toThrow()
    expect(drafts).toEqual([])
  })
})
