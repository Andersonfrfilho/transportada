/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1 (P2): o filtro "vencidas / vencem hoje" da lista de notas da viagem. Roda no cliente (o prazo
 * depende do calendário), é de seleção múltipla, não reordena nada e mora na URL.
 */
import { describe, expect, it } from 'bun:test'

import type { TripDocumentDetail } from '@/modules/trip/shared/trip.types'
import {
  countDocumentsByDeliveryDeadline,
  filterDocumentsByDeliveryDeadline,
  hasAnyDeliveryDeadline,
  parseDeliveryDeadlineFilter,
  resolveDeliveryDeadlineFilterValue,
  serializeDeliveryDeadlineFilter,
} from '@/modules/trip/shared/tripDeliveryDeadlineFilter.service'

const DUE_ON = '2026-10-15'

function documentWith(id: string, deliveryDeadline?: TripDocumentDetail['deliveryDeadline']) {
  return {
    id,
    ...(deliveryDeadline === undefined ? {} : { deliveryDeadline }),
  } as unknown as TripDocumentDetail
}

const DOCUMENTS = [
  documentWith('on-time', { businessDaysRemaining: 2, dueOn: DUE_ON, state: 'on_time' }),
  documentWith('late', { businessDaysLate: 1, dueOn: DUE_ON, state: 'overdue' }),
  documentWith('absent'),
  documentWith('today', { dueOn: DUE_ON, state: 'due_today' }),
  documentWith('delivered-late', {
    businessDaysLate: 2,
    deliveredOn: '2026-10-19',
    dueOn: DUE_ON,
    state: 'delivered_late',
  }),
  documentWith('null', null),
  documentWith('delivered', { deliveredOn: DUE_ON, dueOn: DUE_ON, state: 'delivered_on_time' }),
  documentWith('late-two', { businessDaysLate: 0, dueOn: DUE_ON, state: 'overdue' }),
]

function idsOf(documents: readonly TripDocumentDetail[]): readonly string[] {
  return documents.map((document) => document.id)
}

describe('a categoria do filtro de cada nota (spec 236 P2)', () => {
  it('cada estado cai na sua categoria; entregue no prazo e com atraso são "Entregues"', () => {
    const categories = Object.fromEntries(
      DOCUMENTS.map((document) => [document.id, resolveDeliveryDeadlineFilterValue(document)]),
    )

    expect(categories).toEqual({
      absent: 'none',
      delivered: 'delivered',
      'delivered-late': 'delivered',
      late: 'overdue',
      'late-two': 'overdue',
      null: 'none',
      'on-time': 'on_time',
      today: 'due_today',
    })
  })
})

describe('o filtro múltiplo (spec 236 P2)', () => {
  it('sem seleção devolve todas as notas, na mesma ordem', () => {
    expect(idsOf(filterDocumentsByDeliveryDeadline({ documents: DOCUMENTS, values: [] }))).toEqual(
      idsOf(DOCUMENTS),
    )
  })

  it('uma categoria devolve só as dela', () => {
    expect(
      idsOf(filterDocumentsByDeliveryDeadline({ documents: DOCUMENTS, values: ['overdue'] })),
    ).toEqual(['late', 'late-two'])
  })

  it('duas categorias somam (união), e não só a primeira', () => {
    expect(
      idsOf(
        filterDocumentsByDeliveryDeadline({
          documents: DOCUMENTS,
          values: ['overdue', 'due_today'],
        }),
      ),
    ).toEqual(['late', 'today', 'late-two'])
  })

  it('"Sem prazo" pega a nota com prazo nulo e a nota sem o campo (API antiga)', () => {
    expect(
      idsOf(filterDocumentsByDeliveryDeadline({ documents: DOCUMENTS, values: ['none'] })),
    ).toEqual(['absent', 'null'])
  })

  it('a ordem das notas é a original, qualquer que seja a ordem da seleção', () => {
    const forward = filterDocumentsByDeliveryDeadline({
      documents: DOCUMENTS,
      values: ['delivered', 'on_time', 'overdue'],
    })
    const backward = filterDocumentsByDeliveryDeadline({
      documents: DOCUMENTS,
      values: ['overdue', 'on_time', 'delivered'],
    })

    expect(idsOf(forward)).toEqual(['on-time', 'late', 'delivered-late', 'delivered', 'late-two'])
    expect(idsOf(backward)).toEqual(idsOf(forward))
  })

  it('a conta de cada categoria soma o total de notas', () => {
    const counts = countDocumentsByDeliveryDeadline(DOCUMENTS)

    expect(counts).toEqual({ delivered: 2, due_today: 1, none: 2, on_time: 1, overdue: 2 })
    expect(Object.values(counts).reduce((total, count) => total + count, 0)).toBe(DOCUMENTS.length)
  })
})

describe('quando o filtro é oferecido (spec 236 P3)', () => {
  it('só com alguma nota que tenha prazo: tudo nulo ou ausente não ganha filtro', () => {
    expect(hasAnyDeliveryDeadline([documentWith('a'), documentWith('b', null)])).toBe(false)
    expect(hasAnyDeliveryDeadline([])).toBe(false)
    expect(hasAnyDeliveryDeadline(DOCUMENTS)).toBe(true)
  })
})

describe('o filtro na URL (spec 236 P2)', () => {
  it('lê as categorias na ordem canônica e sem repetir', () => {
    expect(parseDeliveryDeadlineFilter('?deadline=due_today,overdue,overdue')).toEqual([
      'overdue',
      'due_today',
    ])
  })

  it('URL inventada não quebra a tela: categoria desconhecida é ignorada', () => {
    expect(parseDeliveryDeadlineFilter('?deadline=inventada,none,')).toEqual(['none'])
    expect(parseDeliveryDeadlineFilter('?deadline=')).toEqual([])
    expect(parseDeliveryDeadlineFilter('')).toEqual([])
  })

  it('escreve a lista e preserva os outros parâmetros', () => {
    expect(
      serializeDeliveryDeadlineFilter({ search: '?tab=notas', values: ['due_today', 'overdue'] }),
    ).toBe('?tab=notas&deadline=overdue%2Cdue_today')
  })

  it('sem seleção tira o parâmetro; sem mais nada, a URL fica sem interrogação', () => {
    expect(serializeDeliveryDeadlineFilter({ search: '?deadline=overdue', values: [] })).toBe('')
    expect(
      serializeDeliveryDeadlineFilter({ search: '?tab=notas&deadline=none', values: [] }),
    ).toBe('?tab=notas')
  })

  it('o que se escreve se lê de volta', () => {
    const search = serializeDeliveryDeadlineFilter({
      search: '',
      values: ['overdue', 'due_today', 'none'],
    })

    expect(parseDeliveryDeadlineFilter(search)).toEqual(['overdue', 'due_today', 'none'])
  })
})
