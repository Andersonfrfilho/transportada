/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Escrito antes do código: o registro aceita `productCodes` (lista) ao lado de `productCode`, a
 * coluna antiga continua sendo escrita com o primeiro item, e os itens vão para a tabela de junção
 * na mesma transação da ocorrência.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import type {
  SeparationOccurrenceSaveInput,
  SeparationOccurrenceUnitOfWork,
} from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import type { RemovableObjectStoragePort } from '../../src/trips/application/stored-object-cleanup.service.js'
import { parseRegisterOccurrenceMultipartRequest } from '../../src/trips/presentation/occurrence.schema.js'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000017'
const TRIP_ID = '00000000-0000-4000-8000-000000000011'
const ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000f'
const OCCURRENCE_ID = '00000000-0000-4000-8000-0000000000c1'

const PRODUTOS = [
  { code: 'ZG-4410', description: 'Parafuso sextavado' },
  { code: 'ZG-4411', description: 'Porca' },
]

function multipart(input: {
  readonly fields?: Record<string, string>
  readonly productCodes?: readonly string[]
}): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields ?? {})) form.set(key, value)
  for (const code of input.productCodes ?? []) form.append('productCodes', code)
  form.append('file', new File([JPEG], 'ocorrencia.jpg', { type: 'image/jpeg' }))
  return new Request('http://localhost/trips/x', { body: form, method: 'POST' })
}

describe('o parser multipart lê a lista de itens', () => {
  test('productCodes repetido vira lista, na ordem em que veio', async () => {
    const parsed = await parseRegisterOccurrenceMultipartRequest(
      multipart({ fields: { occurrenceTypeId: TIPO }, productCodes: ['ZG-4411', 'ZG-4410'] }),
    )

    expect(parsed.productCodes).toEqual(['ZG-4411', 'ZG-4410'])
    expect(parsed.productCode).toBe('')
  })

  test('sem productCodes, a lista é vazia e o contrato antigo segue igual', async () => {
    const parsed = await parseRegisterOccurrenceMultipartRequest(
      multipart({ fields: { occurrenceTypeId: TIPO, productCode: 'ZG-4410' } }),
    )

    expect(parsed.productCodes).toEqual([])
    expect(parsed.productCode).toBe('ZG-4410')
  })

  /** Limpar a entrada vazia aqui esconderia o engano de quem marcou; a recusa vem com nome. */
  test('o parser não limpa entrada vazia nem repetida — quem recusa é a política', async () => {
    const parsed = await parseRegisterOccurrenceMultipartRequest(
      multipart({ fields: { occurrenceTypeId: TIPO }, productCodes: ['ZG-4410', 'ZG-4410', ''] }),
    )

    expect(parsed.productCodes).toEqual(['ZG-4410', 'ZG-4410', ''])
  })
})

type SaveCall = SeparationOccurrenceSaveInput | undefined

function registrar(input: {
  readonly productCode?: string
  readonly productCodes?: readonly string[]
  readonly seen: {
    save: SaveCall
    templateProductCodes: readonly string[] | undefined
  }
}) {
  return registerTripOccurrence({
    actorUserId: ACTOR_USER_ID,
    attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
    companyId: COMPANY_ID,
    documentId: DOCUMENT_ID,
    note: 'caixa violada',
    occurredOn: '21/09/2026',
    occurrenceTypeId: TIPO,
    productCode: input.productCode ?? '',
    ...(input.productCodes === undefined ? {} : { productCodes: input.productCodes }),
    repository: {
      async findOccurrenceType() {
        return {
          active: true,
          allowsMultipleItems: true,
          emailBody: 'Itens: {{item}}',
          emailSubject: 'Ocorrência',
          emailTemplateKey: null,
          id: TIPO,
          name: 'Item avariado',
          notifies: false,
          stage: 'separation' as const,
        }
      },
      async listDocumentProducts() {
        return PRODUTOS
      },
      async listOccurrences() {
        return []
      },
      async readTemplateValues(query) {
        input.seen.templateProductCodes = query.productCodes
        return {
          contractorName: '',
          documentLabel: '',
          driverName: '',
          itemCode: '',
          itemLabel: 'Parafuso sextavado, Porca',
          itemQuantity: '',
          note: '',
          occurredOn: '',
          recipientName: '',
          stopLabel: '',
          totalValue: '',
        }
      },
      async saveOccurrence(saved) {
        input.seen.save = {
          actorUserId: saved.actorUserId,
          companyId: saved.companyId,
          documentId: saved.documentId,
          items: saved.items,
          note: saved.note,
          occurrenceTypeId: saved.occurrenceTypeId,
          productCode: saved.productCode,
          productCodes: saved.productCodes,
          stage: saved.stage,
          tripId: saved.tripId,
          typeName: saved.typeName,
        }
        return {
          attachments: [{ id: '00000000-0000-4000-8000-0000000000a1', position: 1 }],
          createdAt: '2026-09-21T12:00:00.000Z',
          id: OCCURRENCE_ID,
          note: saved.note,
          occurrenceTypeId: TIPO,
          productCode: saved.productCode,
          stage: saved.stage,
          typeName: saved.typeName,
        }
      },
    },
    tripId: TRIP_ID,
  })
}

type Seen = {
  save: SaveCall
  templateProductCodes: readonly string[] | undefined
}

function buildSeen(): Seen {
  return { save: undefined, templateProductCodes: undefined }
}

async function statusOf(operation: Promise<unknown>): Promise<number | undefined> {
  try {
    await operation
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.status : -1
  }
}

async function codeOf(operation: Promise<unknown>): Promise<string> {
  try {
    await operation
  } catch (error) {
    return (error as { readonly code: string }).code
  }
  throw new Error('esperava recusa, e nada foi lançado')
}

describe('o registro grava vários itens e mantém a coluna antiga', () => {
  test('a coluna antiga leva o primeiro item, e a lista vai inteira', async () => {
    const seen = buildSeen()

    const registered = await registrar({ productCodes: ['ZG-4411', 'ZG-4410'], seen })

    expect(seen.save?.productCode).toBe('ZG-4411')
    expect(seen.save?.productCodes).toEqual(['ZG-4411', 'ZG-4410'])
    expect(registered.productCode).toBe('ZG-4411')
    expect(registered.productCodes).toEqual(['ZG-4411', 'ZG-4410'])
  })

  test('a nota inteira continua gravando coluna vazia e lista vazia', async () => {
    const seen = buildSeen()

    const registered = await registrar({ productCodes: [], seen })

    expect(seen.save?.productCode).toBe('')
    expect(seen.save?.productCodes).toEqual([])
    expect(registered.productCodes).toEqual([])
  })

  /** Ocorrência antiga e o fluxo do WhatsApp continuam mandando só `productCode`. */
  test('o contrato antigo segue valendo, e a lista devolvida tem o item', async () => {
    const seen = buildSeen()

    const registered = await registrar({ productCode: 'ZG-4410', seen })

    expect(seen.save?.productCode).toBe('ZG-4410')
    expect(seen.save?.productCodes).toEqual(['ZG-4410'])
    expect(registered.productCodes).toEqual(['ZG-4410'])
  })

  test('o e-mail pronto é montado com todos os itens', async () => {
    const seen = buildSeen()

    const registered = await registrar({ productCodes: ['ZG-4410', 'ZG-4411'], seen })

    expect(seen.templateProductCodes).toEqual(['ZG-4410', 'ZG-4411'])
    expect(registered.email?.body).toBe('Itens: Parafuso sextavado, Porca')
  })

  test('os dois campos juntos são 422, e nada é gravado', async () => {
    const seen = buildSeen()

    expect(
      await codeOf(registrar({ productCode: 'ZG-4410', productCodes: ['ZG-4411'], seen })),
    ).toBe('OCCURRENCE_PRODUCT_SELECTION_CONFLICT')
    expect(seen.save).toBeUndefined()
  })

  test('item repetido é 422, e nada é gravado', async () => {
    const seen = buildSeen()

    expect(await codeOf(registrar({ productCodes: ['ZG-4410', 'ZG-4410'], seen }))).toBe(
      'OCCURRENCE_PRODUCT_DUPLICATE',
    )
    expect(seen.save).toBeUndefined()
  })

  test('item que não existe na nota é 422, e nada é gravado', async () => {
    const seen = buildSeen()

    expect(await statusOf(registrar({ productCodes: ['ZG-4410', 'NAO-EXISTE'], seen }))).toBe(422)
    expect(seen.save).toBeUndefined()
  })
})

function buildFakeStorage(): RemovableObjectStoragePort {
  return {
    async remove() {},
    async store() {
      return { sha256: '0'.repeat(64) }
    },
  }
}

type SeenProducts = {
  products: { readonly occurrenceId: string; readonly productCodes: readonly string[] } | undefined
}

describe('os itens entram na mesma transação da ocorrência', () => {
  function buildUnitOfWork(seen: SeenProducts): SeparationOccurrenceUnitOfWork {
    return {
      execute<TResult>(
        operation: (transaction: {
          insertAttachment: () => Promise<{ id: string; position: number }>
          insertOccurrenceProducts: (input: {
            readonly companyId: string
            readonly occurrenceId: string
            readonly items: SeparationOccurrenceSaveInput['items']
          }) => Promise<void>
          insertStoredObject: () => Promise<void>
          saveOccurrence: (input: SeparationOccurrenceSaveInput) => Promise<{
            createdAt: string
            id: string
            note: string
            occurrenceTypeId: string
            productCode: string
            stage: SeparationOccurrenceSaveInput['stage']
            typeName: string
          }>
        }) => Promise<TResult>,
      ) {
        return operation({
          insertAttachment: async () => ({
            id: '00000000-0000-4000-8000-0000000000a1',
            position: 1,
          }),
          insertOccurrenceProducts: async (products) => {
            seen.products = {
              occurrenceId: products.occurrenceId,
              productCodes: products.items.map((item) => item.code),
            }
          },
          insertStoredObject: async () => undefined,
          saveOccurrence: async (saveInput) => ({
            createdAt: '2026-09-21T12:00:00.000Z',
            id: OCCURRENCE_ID,
            note: saveInput.note,
            occurrenceTypeId: saveInput.occurrenceTypeId,
            productCode: saveInput.productCode,
            stage: saveInput.stage,
            typeName: saveInput.typeName,
          }),
        })
      },
    } as SeparationOccurrenceUnitOfWork
  }

  function buildInput(productCodes: readonly string[]): SeparationOccurrenceSaveInput {
    return {
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      items: productCodes.map((code) => ({ code, quantity: null, unit: null })),
      note: '',
      occurrenceTypeId: TIPO,
      productCode: productCodes[0] ?? '',
      productCodes,
      stage: 'separation' as const,
      tripId: TRIP_ID,
      typeName: 'Item avariado',
    }
  }

  test('os itens são gravados para a ocorrência que acabou de nascer', async () => {
    const seen: SeenProducts = { products: undefined }

    await persistSeparationOccurrenceWithAttachment({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      input: buildInput(['ZG-4410', 'ZG-4411']),
      newObjectId: () => '00000000-0000-4000-8000-0000000000b1',
      now: () => new Date('2026-09-21T12:00:00.000Z'),
      storage: buildFakeStorage(),
      unitOfWork: buildUnitOfWork(seen),
    })

    expect(seen.products).toEqual({
      occurrenceId: OCCURRENCE_ID,
      productCodes: ['ZG-4410', 'ZG-4411'],
    })
  })

  /** A nota inteira não ganha linha nenhuma — e a chamada continua acontecendo, com lista vazia. */
  test('a nota inteira passa lista vazia', async () => {
    const seen: SeenProducts = { products: undefined }

    await persistSeparationOccurrenceWithAttachment({
      attachment: { bytes: JPEG, mimeType: 'image/jpeg' },
      input: buildInput([]),
      newObjectId: () => '00000000-0000-4000-8000-0000000000b1',
      now: () => new Date('2026-09-21T12:00:00.000Z'),
      storage: buildFakeStorage(),
      unitOfWork: buildUnitOfWork(seen),
    })

    expect(seen.products).toEqual({ occurrenceId: OCCURRENCE_ID, productCodes: [] })
  })
})
