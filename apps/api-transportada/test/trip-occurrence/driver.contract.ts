/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { TripDocumentNotReachableError, TripFieldReportKeyReusedError } from '../../src/trips/domain/trip.error.js'
import { createFieldReportState, createFieldReportUnitOfWork } from '../driver-trip/field-report.double.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const TIPO = '00000000-0000-4000-8000-0000000000e1'
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-0000000000aa'

const PRODUTOS = [{ code: 'ZG-4410', description: 'CAIXA DE PARAFUSOS' }]

function readPort(
  overrides: {
    readonly active?: boolean
    readonly reachable?: boolean
    readonly stage?: 'delivery' | 'separation'
    readonly typeFound?: boolean
  } = {},
) {
  return {
    async findOccurrenceType() {
      if (overrides.typeFound === false) return null
      return {
        active: overrides.active ?? true,
        allowsMultipleItems: true,
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
  input: { readonly idempotencyKey?: string; readonly productCode?: string } = {},
) {
  const state = createFieldReportState({
    documents: new Map([
      [DOCUMENT, { separationStatus: 'pending', stopId: null, tripId: '', tripStatus: 'on_delivery_route' }],
    ]),
  })
  const unitOfWork = createFieldReportUnitOfWork(state)

  return {
    result: registerDriverOccurrence({
      actorUserId: ACTOR,
      companyId: COMPANY,
      documentId: DOCUMENT,
      driverId: DRIVER,
      idempotencyKey: input.idempotencyKey ?? IDEMPOTENCY_KEY,
      note: '',
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
    expect(
      await registrar({ stage: 'separation' }).result.catch((e: unknown) => e),
    ).toBeInstanceOf(TripDocumentNotReachableError)
  })

  test('nota fora da viagem dele é inalcançável', async () => {
    expect(
      await registrar({ reachable: false }).result.catch((e: unknown) => e),
    ).toBeInstanceOf(TripDocumentNotReachableError)
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
