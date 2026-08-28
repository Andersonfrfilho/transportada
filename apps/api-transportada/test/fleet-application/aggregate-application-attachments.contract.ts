/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateApplicationAttachmentUseCase } from '../../src/fleet/application/aggregate-application-attachment.use-case.js'
import { AggregateDocumentInvalidUploadError } from '../../src/fleet/domain/aggregate-document.error.js'
import { createAggregateApplicationsUseCase } from '../../src/fleet/application/aggregate-applications.use-case.js'
import { FakeAggregateApplicationRepository } from '../fixtures/aggregate-applications.fixture.js'

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
   *
   * A asserção é a **forma exata**, não "não contém onze dígitos": a chave é feita de dois UUIDs, e
   * UUID aleatório contém onze dígitos seguidos de vez em quando. A versão anterior deste teste
   * passava local e falhou no CI — teste que depende de sorte reprova sozinho, mais cedo ou mais
   * tarde, e ensina a ignorar o vermelho.
   */
  test('a chave do objeto é empresa, tipo e rascunho — nada mais', async () => {
    const { stored, useCase } = buildUseCase()

    const result = await useCase.uploadDraft({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      type: 'cnh',
    })

    expect(stored[0]?.key).toBe(
      `tenants/${COMPANY_ID}/aggregate-application-attachments/cnh/${result.draftId}`,
    )
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

describe('anexo de candidatura — vínculo no envio', () => {
  function buildSubmitUseCase() {
    const repository = new FakeAggregateApplicationRepository()
    const useCase = createAggregateApplicationsUseCase({
      companyGroupRepository: {
        listGroupUnits: async () => [
          {
            city: 'Franca',
            cnpj: '11222333000181',
            companyId: COMPANY_ID,
            complement: '',
            district: 'Centro',
            number: '1',
            phone: '1133334444',
            postalCode: '14400000',
            state: 'SP',
            street: 'Rua Um',
            tradeName: 'Sede',
          },
        ],
      },
      landingCompanyId: COMPANY_ID,
      repository,
    })
    return { repository, useCase }
  }

  const submission = {
    companyId: COMPANY_ID,
    declaredData: {},
    email: 'fulano@example.test',
    name: 'Fulano de Tal',
    phone: '11999999999',
    taxId: '12345678909',
  } as const

  /**
   * O submit responde `202` invariável para não ser sonda de documento existente. Recusar um
   * `draftId` desconhecido com `400` devolveria a mesma sonda, agora para identificador de rascunho:
   * quem tentasse aos milhares descobriria quais existem. Rascunho de outra empresa, inexistente ou
   * já vinculado é **ignorado em silêncio** — quem filtra é o `where` do repositório, e a resposta
   * não muda.
   */
  test('os rascunhos declarados são passados ao repositório com a empresa do envio', async () => {
    const { repository, useCase } = buildSubmitUseCase()
    const draftIds = [crypto.randomUUID(), crypto.randomUUID()]

    await useCase.submit({ ...submission, attachmentDraftIds: draftIds })

    expect(repository.linkAttachmentDraftsCalls).toEqual([
      { applicationId: repository.rows[0]?.id ?? '', companyId: COMPANY_ID, draftIds },
    ])
  })

  test('sem rascunho declarado, o vínculo não é chamado', async () => {
    const { repository, useCase } = buildSubmitUseCase()

    await useCase.submit(submission)

    expect(repository.linkAttachmentDraftsCalls).toEqual([])
  })

  /** Reenvio atualiza a candidatura que já existe — os anexos novos vão para ela, não para outra. */
  test('no reenvio, os rascunhos vão para a candidatura existente', async () => {
    const { repository, useCase } = buildSubmitUseCase()
    await useCase.submit(submission)
    const applicationId = repository.rows[0]?.id ?? ''
    const draftIds = [crypto.randomUUID()]

    await useCase.submit({ ...submission, attachmentDraftIds: draftIds })

    expect(repository.rows).toHaveLength(1)
    expect(repository.linkAttachmentDraftsCalls).toEqual([
      { applicationId, companyId: COMPANY_ID, draftIds },
    ])
  })
})
