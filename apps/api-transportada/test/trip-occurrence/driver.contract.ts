/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  TripDocumentNotReachableError,
  TripFieldReportKeyReusedError,
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrenceUploadNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import {
  createFieldReportState,
  createFieldReportUnitOfWork,
} from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-0000000000aa'
const UPLOAD = '00000000-0000-4000-8000-0000000000bb'

const PRODUTOS = [{ code: 'ZG-4410', description: 'CAIXA DE PARAFUSOS' }]

function readPort(
  overrides: {
    readonly active?: boolean
    /** Spec 179 T203: ausente é `undefined`, o mesmo "sem a coluna" que uma leitura legada devolve. */
    readonly attachmentMode?: 'off' | 'optional' | 'required'
    readonly reachable?: boolean
    readonly stage?: 'delivery' | 'separation'
    readonly typeFound?: boolean
    /** Spec 179 T203 (RF2b): `false` simula referência que não existe, não é da empresa ou da viagem. */
    readonly uploadConfirmed?: boolean
  } = {},
) {
  return {
    async findConfirmedUpload() {
      return overrides.uploadConfirmed === false ? null : { id: UPLOAD }
    },
    async findOccurrenceType() {
      if (overrides.typeFound === false) return null
      return {
        active: overrides.active ?? true,
        allowsMultipleItems: true,
        ...(overrides.attachmentMode === undefined
          ? {}
          : { attachmentMode: overrides.attachmentMode }),
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        id: TIPO,
        name: 'Recusa parcial',
        notifies: false,
        stage: overrides.stage ?? ('delivery' as const),
      }
    },
    async findReachableDocument() {
      return overrides.reachable === false
        ? null
        : { tripId: '00000000-0000-4000-8000-000000000011' }
    },
    async listDocumentProducts() {
      return PRODUTOS
    },
  }
}

function registrar(
  overrides: Parameters<typeof readPort>[0] = {},
  input: {
    readonly attachmentObjectId?: string
    readonly idempotencyKey?: string
    readonly note?: string
    readonly productCode?: string
  } = {},
) {
  const state = createFieldReportState({
    documents: new Map([
      [
        DOCUMENT,
        { separationStatus: 'pending', stopId: null, tripId: '', tripStatus: 'on_delivery_route' },
      ],
    ]),
  })
  const unitOfWork = createFieldReportUnitOfWork(state)

  return {
    result: registerDriverOccurrence({
      actorUserId: ACTOR,
      attachmentObjectId: input.attachmentObjectId,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: input.idempotencyKey ?? IDEMPOTENCY_KEY,
      note: input.note ?? '',
      occurrenceTypeId: TIPO,
      productCode: input.productCode ?? '',
      repository: readPort(overrides),
      unitOfWork,
    }),
    state,
  }
}

describe('o motorista registra ocorrência pelo celular (spec 079)', () => {
  /**
   * ⚠️ **Quatro barreiras, uma resposta.** Tipo inexistente, tipo aposentado, tipo de galpão e nota
   * fora da viagem dele respondem **igual** — inalcançável. Distinguir as quatro diria a quem tenta
   * qual delas encontrou, e três dessas respostas contam algo sobre o cadastro de outra empresa.
   */
  test('tipo inexistente é inalcançável', async () => {
    expect(await registrar({ typeFound: false }).result.catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('tipo aposentado é inalcançável', async () => {
    expect(await registrar({ active: false }).result.catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  /** O motorista não separou a carga: tipo de galpão não é dele, mesmo cadastrado e ativo. */
  test('tipo de galpão é inalcançável', async () => {
    expect(await registrar({ stage: 'separation' }).result.catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('nota fora da viagem dele é inalcançável', async () => {
    expect(await registrar({ reachable: false }).result.catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('registra o tipo de rua na nota que ele está levando', async () => {
    const saved = await registrar().result

    expect(saved.typeName).toBe('Recusa parcial')
    expect(saved.stage).toBe('delivery')
    expect(saved.productCode).toBe('')
  })

  /** Ele aponta o item quando o cliente recusou só parte — e o item tem de estar na nota. */
  test('aponta o produto quando ele está na nota', async () => {
    expect((await registrar({}, { productCode: 'ZG-4410' }).result).productCode).toBe('ZG-4410')
  })

  test('produto fora da nota é inalcançável', async () => {
    expect(
      await registrar({}, { productCode: 'NAO-EXISTE' }).result.catch((e: unknown) => e),
    ).toBeInstanceOf(TripDocumentNotReachableError)
  })

  /**
   * Spec 179 T200 (RF13): a rota não tinha chave de idempotência — o reenvio da fila offline
   * duplicava a ocorrência. O reenvio da mesma chave devolve **o mesmo registro**, sem gravar de
   * novo.
   */
  test('a mesma chave reenviada devolve a mesma ocorrência, sem gravar duas vezes', async () => {
    const { result: first, state } = registrar()
    const saved = await first

    const replay = await registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: IDEMPOTENCY_KEY,
      note: '',
      occurrenceTypeId: TIPO,
      productCode: '',
      repository: readPort(),
      unitOfWork: createFieldReportUnitOfWork(state),
    })

    expect(replay.id).toBe(saved.id)
    expect(state.calls.filter((call) => call.startsWith('saveDocumentOccurrence'))).toHaveLength(1)
  })

  test('a mesma chave usada por outro ator é recusada, não reaproveitada', async () => {
    const { state } = registrar()
    await registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: IDEMPOTENCY_KEY,
      note: '',
      occurrenceTypeId: TIPO,
      productCode: '',
      repository: readPort(),
      unitOfWork: createFieldReportUnitOfWork(state),
    }).catch(() => {})

    const other = registerDriverOccurrence({
      actorUserId: '00000000-0000-4000-8000-000000000099',
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: IDEMPOTENCY_KEY,
      note: '',
      occurrenceTypeId: TIPO,
      productCode: '',
      repository: readPort(),
      unitOfWork: createFieldReportUnitOfWork(state),
    })

    expect(await other.catch((e: unknown) => e)).toBeInstanceOf(TripFieldReportKeyReusedError)
  })
})

/**
 * Spec 179 T203 (RF3/CA02/CA03/CA07/CA08): a exigência é do tipo (`attachmentMode`), nunca do nome
 * que a empresa deu a ele — `duplicacao.md` registra o erro de tentar adivinhar pelo nome.
 */
describe('a recusa não sai sem prova quando o tipo exige (spec 179 T203)', () => {
  test('tipo required sem anexo é recusado, mesmo com o motivo escrito', async () => {
    expect(
      await registrar(
        { attachmentMode: 'required' },
        { note: 'Cliente recusou o volume' },
      ).result.catch((e: unknown) => e),
    ).toBeInstanceOf(TripOccurrenceAttachmentRequiredError)
  })

  test('tipo required sem motivo escrito é recusado, mesmo com o anexo', async () => {
    expect(
      await registrar({ attachmentMode: 'required' }, { attachmentObjectId: UPLOAD }).result.catch(
        (e: unknown) => e,
      ),
    ).toBeInstanceOf(TripOccurrenceNoteRequiredError)
  })

  test('tipo required com anexo e motivo é aceito, e o objeto confirmado é o que é gravado', async () => {
    const { result, state } = registrar(
      { attachmentMode: 'required' },
      { attachmentObjectId: UPLOAD, note: 'Cliente recusou o volume' },
    )
    const saved = await result

    expect(saved.note).toBe('Cliente recusou o volume')
    expect(state.calls).toContain(`saveDocumentOccurrence:${DOCUMENT}:${UPLOAD}`)
  })

  /** RF2b: a referência não some em silêncio — o mesmo erro de qualquer upload inalcançável. */
  test('anexo que não é desta empresa/viagem é recusado, mesmo em tipo required', async () => {
    expect(
      await registrar(
        { attachmentMode: 'required', uploadConfirmed: false },
        { attachmentObjectId: UPLOAD, note: 'Cliente recusou o volume' },
      ).result.catch((e: unknown) => e),
    ).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
  })

  /** P5/CA07: quem não marcou continua podendo registrar sem foto e sem motivo. */
  test('tipo optional continua aceitando sem anexo e sem motivo', async () => {
    const { result, state } = registrar({ attachmentMode: 'optional' })
    const saved = await result

    expect(saved.stage).toBe('delivery')
    expect(state.calls).toContain(`saveDocumentOccurrence:${DOCUMENT}:none`)
  })

  /** CA08: ocorrência de tipo sem a coluna preenchida (dado legado) continua válida — vira `off`. */
  test('tipo sem attachmentMode na leitura continua aceitando sem anexo e sem motivo', async () => {
    const saved = await registrar().result

    expect(saved.stage).toBe('delivery')
  })

  test('tipo optional grava o anexo quando o motorista manda um, mesmo sem exigir', async () => {
    const { result, state } = registrar(
      { attachmentMode: 'optional' },
      { attachmentObjectId: UPLOAD },
    )
    await result

    expect(state.calls).toContain(`saveDocumentOccurrence:${DOCUMENT}:${UPLOAD}`)
  })
})
