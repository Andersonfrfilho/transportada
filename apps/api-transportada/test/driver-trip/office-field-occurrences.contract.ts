/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3, D7 e aceite 10: a ocorrência em massa do escritório. Uma transação para o lote,
 * uma ocorrência por nota, um aviso por nota criada, e a idempotência do lote reconstruída pelas
 * reservas por nota (ressalvas A3 e B1). Dublê em memória; o Postgres fica na integração.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import type { ResolvedTripFieldTarget } from '../../src/trips/application/field-trip-target.types.js'
import type { FieldReportClaim } from '../../src/trips/application/driver-field-report.port.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  registerOfficeDocumentOccurrences,
  type OfficeOccurrenceAttachment,
  type OfficeOccurrenceBatchTransactionPort,
  type RegisterOfficeDocumentOccurrencesParams,
} from '../../src/trips/application/register-office-document-occurrences.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { listFieldOccurrenceTypes } from '../../src/trips/application/list-field-occurrence-types.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_ACTOR_USER_ID = '00000000-0000-4000-8000-00000000000a'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const TRIP_ID = '00000000-0000-4000-8000-000000000004'
const TYPE_ID = '00000000-0000-4000-8000-000000000005'
const DOCUMENTS = [
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000d2',
  '00000000-0000-4000-8000-0000000000d3',
] as const
const FOREIGN_DOCUMENT = '00000000-0000-4000-8000-0000000000f1'

const DELIVERY_TYPE: OccurrenceTypeRecord = {
  active: true,
  allowsMultipleItems: true,
  emailBody: '',
  emailSubject: '',
  emailTemplateKey: null,
  id: TYPE_ID,
  name: 'Cliente ausente',
  notifies: true,
  stage: 'delivery',
}

async function resolveTarget(): Promise<ResolvedTripFieldTarget> {
  return resolveFieldTripTarget({
    companyId: COMPANY_ID,
    repository: {
      findTripCrew: async () => ({
        drivers: [{ driverId: DRIVER_ID, position: 1 }],
        tripId: TRIP_ID,
        tripStatus: 'on_delivery_route',
      }),
    },
    target: { kind: 'trip', tripId: TRIP_ID },
  })
}

type SavedOccurrence = {
  readonly attachmentObjectId: string | null
  readonly authorship: { readonly channel: string; readonly onBehalfOfDriverId: string | null }
  readonly documentId: string
  readonly id: string
  readonly productCode: string
}

type World = {
  readonly attachmentUploads: { objectId: string }[]
  /** Spec 156 T15 M11: a trilha do lote, gravada na mesma transação. */
  readonly audits: { action: string; documentIds: readonly string[] }[]
  readonly claims: Map<string, { actorUserId: string; operation: string; resultId: string | null }>
  readonly notified: { documentId: string; tripId: string }[]
  occurrenceType: OccurrenceTypeRecord | null
  readonly reachable: Set<string>
  readonly saved: SavedOccurrence[]
}

function buildWorld(): World {
  return {
    attachmentUploads: [],
    audits: [],
    claims: new Map(),
    notified: [],
    occurrenceType: DELIVERY_TYPE,
    reachable: new Set(DOCUMENTS),
    saved: [],
  }
}

/** Tudo ou nada: a transação trabalha numa cópia e só publica no fim, como o Postgres faria. */
function unitOfWork(world: World): RegisterOfficeDocumentOccurrencesParams['unitOfWork'] {
  return {
    async execute(operation) {
      const claims = new Map(world.claims)
      const saved = [...world.saved]
      const attachmentUploads = [...world.attachmentUploads]
      const audits = [...world.audits]
      const transaction: OfficeOccurrenceBatchTransactionPort = {
        async claim(input): Promise<FieldReportClaim> {
          const existing = claims.get(input.idempotencyKey)
          if (existing !== undefined) return { ...existing, claimed: false }
          claims.set(input.idempotencyKey, {
            actorUserId: input.actorUserId,
            operation: input.operation,
            resultId: null,
          })
          return {
            actorUserId: input.actorUserId,
            claimed: true,
            operation: input.operation,
            resultId: null,
          }
        },
        async settle(input) {
          const existing = claims.get(input.idempotencyKey)
          if (existing !== undefined)
            claims.set(input.idempotencyKey, { ...existing, resultId: input.resultId })
        },
        async findOccurrenceType() {
          return world.occurrenceType
        },
        async findReachableDocumentIds(input) {
          return input.documentIds.filter((documentId) => world.reachable.has(documentId))
        },
        async saveDocumentOccurrence(input) {
          const id = crypto.randomUUID()
          saved.push({
            attachmentObjectId: input.attachmentObjectId ?? null,
            authorship: input.authorship,
            documentId: input.documentId,
            id,
            productCode: input.productCode,
          })
          return {
            createdAt: '2026-09-18T12:00:00.000Z',
            id,
            note: input.note,
            occurrenceTypeId: input.occurrenceTypeId,
            productCode: input.productCode,
            stage: input.stage,
            typeName: input.typeName,
          }
        },
        async findDocumentOccurrence(input) {
          const found = saved.find((occurrence) => occurrence.id === input.occurrenceId)
          return found === undefined ? null : { documentId: found.documentId, id: found.id }
        },
        async saveAttachmentObject(input) {
          attachmentUploads.push({ objectId: input.objectId })
        },
        async recordOfficeAudit(input) {
          audits.push({ action: input.action, documentIds: input.documentIds ?? [] })
        },
      }
      const result = await operation(transaction)
      world.attachmentUploads.splice(0, world.attachmentUploads.length, ...attachmentUploads)
      world.claims.clear()
      for (const [key, value] of claims) world.claims.set(key, value)
      world.saved.splice(0, world.saved.length, ...saved)
      world.audits.splice(0, world.audits.length, ...audits)
      return result
    },
  }
}

async function register(
  world: World,
  overrides: Partial<RegisterOfficeDocumentOccurrencesParams> = {},
) {
  return registerOfficeDocumentOccurrences({
    actorUserId: ACTOR_USER_ID,
    companyId: COMPANY_ID,
    documentIds: DOCUMENTS,
    idempotencyKey: 'lote-1',
    note: 'Portão fechado',
    notifications: {
      logger: { warn() {} },
      notifier: {
        async notify() {
          throw new Error('o caso de uso notifica pelo notifyOccurrence, com parâmetros')
        },
      },
      readLabels: async (input) => labelsFor(input.documentIds),
    },
    occurrenceTypeId: TYPE_ID,
    officeAudit: {
      action: 'trip_field_office.document_occurrences',
      correlationId: 'c-1',
      ipAddress: '203.0.113.7',
    },
    target: await resolveTarget(),
    unitOfWork: unitOfWork(world),
    ...overrides,
  })
}

function recordingNotifications(
  world: World,
): RegisterOfficeDocumentOccurrencesParams['notifications'] {
  return {
    logger: { warn() {} },
    notifier: {
      async notify(input) {
        world.notified.push({
          documentId: input.parameters.documentId,
          tripId: input.parameters.tripId,
        })
      },
    },
    readLabels: async (input) => labelsFor(input.documentIds),
  }
}

function labelsFor(documentIds: readonly string[]) {
  return new Map(
    documentIds.map((documentId) => [documentId, { documentLabel: 'NF 1', stopLabel: 'Centro' }]),
  )
}

let nextObjectId = 0

/** T7b: dublê do `attachment` — `store` nunca toca o `World` fora de `saveAttachmentObject`. */
function fakeAttachment(
  upload: { readonly bytes: Uint8Array; readonly mimeType: string } | null,
): OfficeOccurrenceAttachment {
  return {
    newObjectId: () => `object-${(nextObjectId += 1)}`,
    storage: {
      async remove() {},
      async store() {
        return { sha256: 'a'.repeat(64) }
      },
    },
    upload,
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error instanceof ApiError ? error.code : String(error)
  }
}

describe('ocorrência em massa do escritório (spec 156 D7, aceite 10)', () => {
  it('três notas gravam três ocorrências office, em nome do motorista, na ordem do pedido', async () => {
    const world = buildWorld()

    const result = await register(world, { notifications: recordingNotifications(world) })

    expect(result.items.map((item) => item.documentId)).toEqual([...DOCUMENTS])
    expect(world.saved).toHaveLength(3)
    for (const occurrence of world.saved) {
      expect(occurrence.authorship).toEqual({ channel: 'office', onBehalfOfDriverId: DRIVER_ID })
      expect(occurrence.productCode).toBe('')
    }
  })

  it('um aviso por nota, depois do commit', async () => {
    const world = buildWorld()

    await register(world, { notifications: recordingNotifications(world) })

    expect(world.notified.map((notice) => notice.documentId).toSorted()).toEqual(
      [...DOCUMENTS].toSorted(),
    )
    expect(world.notified.every((notice) => notice.tripId === TRIP_ID)).toBe(true)
  })

  it('tipo sem aviso ligado grava e não avisa', async () => {
    const world = buildWorld()
    world.occurrenceType = { ...DELIVERY_TYPE, notifies: false }

    await register(world, { notifications: recordingNotifications(world) })

    expect(world.saved).toHaveLength(3)
    expect(world.notified).toEqual([])
  })

  it('o aviso que falha não derruba o lote', async () => {
    const world = buildWorld()

    const result = await register(world, {
      notifications: {
        logger: { warn() {} },
        notifier: {
          async notify() {
            throw new Error('fila fora do ar')
          },
        },
        readLabels: async (input) => labelsFor(input.documentIds),
      },
    })

    expect(result.items).toHaveLength(3)
  })

  it('M10: os rótulos do lote saem de uma leitura só, com as N notas', async () => {
    const world = buildWorld()
    const reads: (readonly string[])[] = []

    await register(world, {
      notifications: {
        ...recordingNotifications(world),
        readLabels: async (input) => {
          reads.push(input.documentIds)
          return labelsFor(input.documentIds)
        },
      },
    })

    expect(reads).toEqual([[...DOCUMENTS]])
    expect(world.notified).toHaveLength(3)
  })

  it('M10: a leitura dos rótulos que falha depois do commit vira aviso no log, não erro', async () => {
    const world = buildWorld()
    const warnings: { event: string; meta: Record<string, unknown> | undefined }[] = []

    const result = await register(world, {
      notifications: {
        logger: { warn: (event, meta) => void warnings.push({ event, meta }) },
        notifier: recordingNotifications(world).notifier,
        readLabels: () => Promise.reject(new Error('pool esgotado')),
      },
    })

    expect(result.items).toHaveLength(3)
    expect(world.saved).toHaveLength(3)
    expect(warnings).toEqual([
      {
        event: 'trip_office_occurrences_notification_failed',
        meta: { companyId: COMPANY_ID, reason: 'pool esgotado', tripId: TRIP_ID },
      },
    ])
  })

  it('M11: a trilha do lote nasce na transação, com as notas, e o reenvio não grava outra', async () => {
    const world = buildWorld()

    await register(world)
    await register(world)

    expect(world.audits).toEqual([
      { action: 'trip_field_office.document_occurrences', documentIds: [...DOCUMENTS] },
    ])
  })

  it('o reenvio com a mesma chave devolve os mesmos ids e não avisa de novo', async () => {
    const world = buildWorld()
    const first = await register(world, { notifications: recordingNotifications(world) })
    world.notified.length = 0

    const second = await register(world, { notifications: recordingNotifications(world) })

    expect(second).toEqual(first)
    expect(world.saved).toHaveLength(3)
    expect(world.notified).toEqual([])
  })

  it('A3: o reenvio depois de o tipo ser aposentado devolve o mesmo resultado', async () => {
    const world = buildWorld()
    const first = await register(world)
    world.occurrenceType = { ...DELIVERY_TYPE, active: false }

    expect(await register(world)).toEqual(first)
  })

  it('a mesma chave com outro conteúdo responde 409 TRIP_FIELD_REPORT_KEY_REUSED', async () => {
    const world = buildWorld()
    await register(world)

    const code = await codeOf(register(world, { note: 'Outro texto' }))

    expect(code).toBe('TRIP_FIELD_REPORT_KEY_REUSED')
    expect(world.saved).toHaveLength(3)
  })

  it('a mesma chave de outro ator responde 409', async () => {
    const world = buildWorld()
    await register(world)

    expect(await codeOf(register(world, { actorUserId: OTHER_ACTOR_USER_ID }))).toBe(
      'TRIP_FIELD_REPORT_KEY_REUSED',
    )
  })

  it('B1: a chave de cada nota mora num espaço próprio, que o cliente não alcança', async () => {
    const world = buildWorld()
    await register(world)

    const keys = [...world.claims.keys()].filter((key) => key !== 'lote-1')
    expect(keys).toHaveLength(3)
    for (const key of keys) {
      expect(key).toMatch(/^batch:[0-9a-f]{64}:/u)
      expect(key).not.toContain('lote-1')
    }
    const itemOperations = new Set(
      keys
        .map((key) => world.claims.get(key)?.operation)
        .filter((operation) => operation !== undefined),
    )
    expect([...itemOperations]).toEqual(['office.document.occurrence-batch-item'])
  })

  it('uma nota fora da viagem: o lote não grava nada e a resposta lista as inalcançáveis', async () => {
    const world = buildWorld()

    let failure: unknown
    try {
      await register(world, { documentIds: [...DOCUMENTS, FOREIGN_DOCUMENT] })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).code).toBe('TRIP_DOCUMENT_NOT_REACHABLE')
    expect((failure as ApiError).status).toBe(409)
    expect((failure as ApiError).details).toEqual([
      { field: 'documentIds', message: FOREIGN_DOCUMENT },
    ])
    expect(world.saved).toEqual([])
    expect(world.claims.size).toBe(0)
  })

  it('L4: tipo de separação responde 422 OCCURRENCE_TYPE_NOT_FIELD, sem gravar', async () => {
    const world = buildWorld()
    world.occurrenceType = { ...DELIVERY_TYPE, stage: 'separation' }

    expect(await codeOf(register(world))).toBe('OCCURRENCE_TYPE_NOT_FIELD')
    expect(world.saved).toEqual([])
  })

  it('tipo aposentado ou inexistente também responde 422', async () => {
    const world = buildWorld()
    world.occurrenceType = { ...DELIVERY_TYPE, active: false }
    expect(await codeOf(register(world))).toBe('OCCURRENCE_TYPE_NOT_FIELD')

    world.occurrenceType = null
    expect(await codeOf(register(world))).toBe('OCCURRENCE_TYPE_NOT_FIELD')
  })
})

describe('T7b: o anexo opcional do lote (D7 §3.5)', () => {
  /** JPEG mínimo: a assinatura `FF D8 FF` que o escritório confere (spec 156 T15 seg B2). */
  const photo = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), mimeType: 'image/jpeg' }

  it('um objeto só, referenciado pelas N notas do lote', async () => {
    const world = buildWorld()

    await register(world, { attachment: fakeAttachment(photo) })

    expect(world.attachmentUploads).toHaveLength(1)
    const attachmentObjectIds = new Set(
      world.saved.map((occurrence) => occurrence.attachmentObjectId),
    )
    expect(attachmentObjectIds.size).toBe(1)
    expect([...attachmentObjectIds][0]).not.toBeNull()
  })

  it('lote sem foto grava attachmentObjectId nulo, e não chama o armazenamento', async () => {
    const world = buildWorld()

    await register(world)

    expect(world.attachmentUploads).toEqual([])
    expect(world.saved.every((occurrence) => occurrence.attachmentObjectId === null)).toBe(true)
  })

  it('reenvio da mesma chave e da mesma foto não reenvia nem duplica o objeto', async () => {
    const world = buildWorld()
    await register(world, { attachment: fakeAttachment(photo) })

    await register(world, { attachment: fakeAttachment(photo) })

    expect(world.attachmentUploads).toHaveLength(1)
  })

  it('a mesma chave com outra foto responde 409 TRIP_FIELD_REPORT_KEY_REUSED', async () => {
    const world = buildWorld()
    await register(world, { attachment: fakeAttachment(photo) })

    const outroArquivo = {
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]),
      mimeType: 'image/jpeg',
    }
    const code = await codeOf(register(world, { attachment: fakeAttachment(outroArquivo) }))

    expect(code).toBe('TRIP_FIELD_REPORT_KEY_REUSED')
    expect(world.attachmentUploads).toHaveLength(1)
  })

  it('foto grande demais responde 422 sem gastar a chave de idempotência', async () => {
    const world = buildWorld()
    const oversized = { bytes: new Uint8Array(2_000_001), mimeType: 'image/jpeg' }

    const code = await codeOf(register(world, { attachment: fakeAttachment(oversized) }))

    expect(code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(world.claims.size).toBe(0)
    expect(world.attachmentUploads).toEqual([])
  })

  it('tipo de arquivo não suportado responde 422', async () => {
    const world = buildWorld()
    const pdf = { bytes: new Uint8Array([1]), mimeType: 'application/pdf' }

    expect(await codeOf(register(world, { attachment: fakeAttachment(pdf) }))).toBe(
      'TRIP_DELIVERY_PROOF_UNSUPPORTED_TYPE',
    )
  })

  it('T15 órfão: o lote que desfaz depois do upload apaga a foto do bucket e relança', async () => {
    const world = buildWorld()
    const stored: string[] = []
    const removed: string[] = []
    const base = unitOfWork(world)
    const failing: RegisterOfficeDocumentOccurrencesParams['unitOfWork'] = {
      execute: (operation) =>
        base.execute((transaction) =>
          operation({
            ...transaction,
            saveDocumentOccurrence: () => Promise.reject(new Error('CONNECTION_LOST')),
          }),
        ),
    }

    await expect(
      register(world, {
        attachment: {
          ...fakeAttachment(photo),
          storage: {
            remove: async (input) => void removed.push(input.objectKey),
            store: async (input) => {
              stored.push(input.objectKey)
              return { sha256: 'a'.repeat(64) }
            },
          },
        },
        unitOfWork: failing,
      }),
    ).rejects.toThrow('CONNECTION_LOST')

    expect(stored).toHaveLength(1)
    expect(removed).toEqual(stored)
  })

  it('lote inalcançável não sobe a foto (upload só depois de tipo e alcance validarem)', async () => {
    const world = buildWorld()

    await expect(
      register(world, {
        attachment: fakeAttachment(photo),
        documentIds: [...DOCUMENTS, FOREIGN_DOCUMENT],
      }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(world.attachmentUploads).toEqual([])
  })
})

describe('os tipos de ocorrência do escritório (L2)', () => {
  it('só id e nome dos tipos ativos de rua', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY_ID,
      repository: {
        listOccurrenceTypes: async () => [
          DELIVERY_TYPE,
          { ...DELIVERY_TYPE, id: 'aposentado', active: false },
          { ...DELIVERY_TYPE, id: 'galpao', name: 'Item faltante', stage: 'separation' },
        ],
      },
    })

    expect(types).toEqual([{ id: TYPE_ID, name: 'Cliente ausente' }])
  })
})
