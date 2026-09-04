/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import { TripDocumentNotReachableError } from '../../src/trips/domain/trip.error.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const DOCUMENT = '00000000-0000-4000-8000-000000000017'
const DRIVER = '00000000-0000-4000-8000-00000000000d'
const ACTOR = '00000000-0000-4000-8000-00000000000f'
const TIPO = '00000000-0000-4000-8000-0000000000e1'

const PRODUTOS = [{ code: 'ZG-4410', description: 'CAIXA DE PARAFUSOS' }]

function repository(
  overrides: {
    readonly active?: boolean
    readonly reachable?: boolean
    readonly stage?: 'delivery' | 'separation'
    readonly typeFound?: boolean
  } = {},
) {
  const calls: object[] = []
  return {
    calls,
    port: {
      async findOccurrenceType(query: object) {
        calls.push(query)
        if (overrides.typeFound === false) return null
        return {
          active: overrides.active ?? true,
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
      async saveOccurrence(saved: { readonly productCode: string; readonly typeName: string }) {
        return {
          createdAt: '2026-09-03T12:00:00.000Z',
          id: '00000000-0000-4000-8000-0000000000d1',
          note: '',
          occurrenceTypeId: TIPO,
          productCode: saved.productCode,
          stage: 'delivery' as const,
          typeName: saved.typeName,
        }
      },
    },
  }
}

function registrar(
  overrides: Parameters<typeof repository>[0] = {},
  input: { readonly productCode?: string } = {},
) {
  return registerDriverOccurrence({
    actorUserId: ACTOR,
    companyId: COMPANY,
    documentId: DOCUMENT,
    driverId: DRIVER,
    note: '',
    occurrenceTypeId: TIPO,
    productCode: input.productCode ?? '',
    repository: repository(overrides).port,
  })
}

describe('o motorista registra ocorrência pelo celular (spec 079)', () => {
  /**
   * ⚠️ **Quatro barreiras, uma resposta.** Tipo inexistente, tipo aposentado, tipo de galpão e nota
   * fora da viagem dele respondem **igual** — inalcançável. Distinguir as quatro diria a quem tenta
   * qual delas encontrou, e três dessas respostas contam algo sobre o cadastro de outra empresa.
   */
  test('tipo inexistente é inalcançável', async () => {
    expect(await registrar({ typeFound: false }).catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('tipo aposentado é inalcançável', async () => {
    expect(await registrar({ active: false }).catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  /** O motorista não separou a carga: tipo de galpão não é dele, mesmo cadastrado e ativo. */
  test('tipo de galpão é inalcançável', async () => {
    expect(await registrar({ stage: 'separation' }).catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('nota fora da viagem dele é inalcançável', async () => {
    expect(await registrar({ reachable: false }).catch((e: unknown) => e)).toBeInstanceOf(
      TripDocumentNotReachableError,
    )
  })

  test('registra o tipo de rua na nota que ele está levando', async () => {
    const saved = await registrar()

    expect(saved.typeName).toBe('Recusa parcial')
    expect(saved.stage).toBe('delivery')
    expect(saved.productCode).toBe('')
  })

  /** Ele aponta o item quando o cliente recusou só parte — e o item tem de estar na nota. */
  test('aponta o produto quando ele está na nota', async () => {
    expect((await registrar({}, { productCode: 'ZG-4410' })).productCode).toBe('ZG-4410')
  })

  test('produto fora da nota é inalcançável', async () => {
    expect(
      await registrar({}, { productCode: 'NAO-EXISTE' }).catch((e: unknown) => e),
    ).toBeInstanceOf(TripDocumentNotReachableError)
  })
})
