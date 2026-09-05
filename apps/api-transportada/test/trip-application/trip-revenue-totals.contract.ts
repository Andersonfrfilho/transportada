/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readTripRevenueTotals } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import type { TripRevenueTotalsPort } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import type {
  ApplicableFreightRule,
  TripValuationDocument,
} from '../../src/trips/application/read-trip-valuation.use-case.js'

const COMPANY_ID = 'empresa-1'

const RULE: ApplicableFreightRule = {
  freightRuleId: 'regra-1',
  freightRuleVersionId: 'versao-1',
  maximumAmount: '',
  minimumAmount: '',
  percentage: '0.100000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: '',
  version: '1',
}

function documentOf(overrides: Partial<TripValuationDocument> = {}): TripValuationDocument {
  return {
    destinationCityCode: '3543402',
    destinationState: 'SP',
    issuedAt: '2026-08-10T06:00:00.000Z',
    measuredAmount: null,
    nfeDocumentId: 'nota-1',
    nfeTotalAmount: '1000.0000',
    senderTaxId: '11222333000181',
    tripDocumentId: 'vinculo-1',
    ...overrides,
  }
}

type Asked = { readonly keys: string[] }

function portOf(input: {
  readonly asked: Asked
  readonly documents: ReadonlyMap<string, readonly TripValuationDocument[]>
  readonly rule?: ApplicableFreightRule | null
}): TripRevenueTotalsPort {
  return {
    findApplicableRule: (query) => {
      input.asked.keys.push(
        [query.senderTaxId, query.destinationCityCode, query.issuedAt].join('|'),
      )

      return Promise.resolve(input.rule === undefined ? RULE : input.rule)
    },
    readDocumentsByTrip: () => Promise.resolve(input.documents),
  }
}

describe('os valores da linha de /trips', () => {
  test('prevê a receita pela parametrização, sem emitir CT-e nenhum', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({ asked, documents: new Map([['viagem-1', [documentOf()]]]) }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')).toEqual({
      documentsTotal: '1000.0000',
      revenueSource: 'estimated',
      revenueTotal: '100.0000',
    })
  })

  /** ADR-0061 D1: o CT-e autorizado é receita realizada, e ela vence a previsão. */
  test('usa o valor cobrado quando o CT-e já foi autorizado', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({
        asked,
        documents: new Map([['viagem-1', [documentOf({ measuredAmount: '250.0000' })]]]),
      }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')?.revenueTotal).toBe('250.0000')
    expect(amounts.get('viagem-1')?.revenueSource).toBe('measured')
    /** Linha medida não consulta regra: o número já existe. */
    expect(asked.keys).toEqual([])
  })

  /**
   * ⚠️ **Uma linha prevista torna o total previsão.** Chamar de medido um total com previsão dentro
   * é a mentira que a D1 da 061 existe para impedir — e na tela é a diferença entre um número em que
   * se decide e um número que se confere.
   */
  test('uma nota sem CT-e torna a viagem inteira previsão', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({
        asked,
        documents: new Map([
          [
            'viagem-1',
            [
              documentOf({ measuredAmount: '250.0000', tripDocumentId: 'a' }),
              documentOf({ tripDocumentId: 'b' }),
            ],
          ],
        ]),
      }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')?.revenueSource).toBe('estimated')
    expect(amounts.get('viagem-1')?.revenueTotal).toBe('350.0000')
  })

  /**
   * ⚠️ **A economia que faz esta função existir.** Seis notas da mesma transportadora para a mesma
   * cidade no mesmo dia são **uma** consulta de regra, não seis. Sem a memoização a coluna custaria
   * uma ida ao banco por nota da página inteira, que é o N+1 que a auditoria do `code-standart.md`
   * §15 reprova.
   */
  test('pergunta a regra uma vez por chave, não uma vez por nota', async () => {
    const asked: Asked = { keys: [] }
    const documents = [
      documentOf({ tripDocumentId: 'a' }),
      documentOf({ tripDocumentId: 'b' }),
      documentOf({ tripDocumentId: 'c', destinationCityCode: '3550308' }),
    ]

    await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({
        asked,
        documents: new Map([
          ['viagem-1', documents.slice(0, 2)],
          ['viagem-2', documents.slice(2)],
        ]),
      }),
      tripIds: ['viagem-1', 'viagem-2'],
    })

    expect(asked.keys).toHaveLength(2)
  })

  /** Sem regra cadastrada a receita é ausência declarada, nunca zero disfarçado de resposta. */
  test('sem regra aplicável a viagem sai como ausente', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({ asked, documents: new Map([['viagem-1', [documentOf()]]]), rule: null }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')?.revenueSource).toBe('missing')
  })

  /**
   * ⚠️ **Viagem sem nota e viagem com notas de valor desconhecido não podem dizer a mesma coisa.**
   * Zero no total das notas seria "esta carga não vale nada"; `null` é "ninguém sabe", que é o que
   * precisa de alguém olhando.
   */
  test('total das notas é nulo quando nenhuma nota tem valor, nunca zero', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({
        asked,
        documents: new Map([['viagem-1', [documentOf({ nfeTotalAmount: null })]]]),
      }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')?.documentsTotal).toBeNull()
  })

  test('viagem sem nota nenhuma responde zero de receita e nada de carga', async () => {
    const asked: Asked = { keys: [] }
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: portOf({ asked, documents: new Map() }),
      tripIds: ['viagem-1'],
    })

    expect(amounts.get('viagem-1')).toEqual({
      documentsTotal: null,
      revenueSource: 'missing',
      revenueTotal: '0.0000',
    })
  })

  test('página vazia não toca o banco', async () => {
    const asked: Asked = { keys: [] }
    let read = 0
    const amounts = await readTripRevenueTotals({
      companyId: COMPANY_ID,
      repository: {
        findApplicableRule: () => Promise.resolve(RULE),
        readDocumentsByTrip: () => {
          read += 1
          return Promise.resolve(new Map())
        },
      },
      tripIds: [],
    })

    expect(read).toBe(0)
    expect(amounts.size).toBe(0)
    expect(asked.keys).toEqual([])
  })
})
