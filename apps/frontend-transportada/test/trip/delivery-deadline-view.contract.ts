/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1: o selo do prazo de entrega. O rótulo de cada estado (com singular e plural), a ausência de
 * número quando os dias de atraso são zero, a data de vencimento formatada SEM passar por `new Date(texto)`
 * (a saída é a mesma em qualquer fuso do processo) e a paridade pt-BR/en das chaves novas.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { TripDocumentDeliveryDeadline } from '@/modules/trip/shared/trip.types'
import {
  formatDeliveryDeadlineDate,
  resolveDeliveryDeadlineView,
} from '@/modules/trip/shared/tripDeliveryDeadlineView.service'

const DUE_ON = '2026-10-15'

type ViewCase = Readonly<{
  count: number | undefined
  deadline: TripDocumentDeliveryDeadline
  labelKey: string
  name: string
  tone: string
}>

const VIEW_CASES: readonly ViewCase[] = [
  {
    count: 2,
    deadline: { businessDaysRemaining: 2, dueOn: DUE_ON, state: 'on_time' },
    labelKey: 'deliveryDeadline.label.onTime',
    name: 'no prazo, com dois dias úteis',
    tone: 'neutral',
  },
  {
    count: 1,
    deadline: { businessDaysRemaining: 1, dueOn: DUE_ON, state: 'on_time' },
    labelKey: 'deliveryDeadline.label.onTime',
    name: 'no prazo, com um dia útil',
    tone: 'neutral',
  },
  {
    count: undefined,
    deadline: { dueOn: DUE_ON, state: 'due_today' },
    labelKey: 'deliveryDeadline.label.dueToday',
    name: 'vence hoje',
    tone: 'warning',
  },
  {
    count: 1,
    deadline: { businessDaysLate: 1, dueOn: DUE_ON, state: 'overdue' },
    labelKey: 'deliveryDeadline.label.overdueWithDays',
    name: 'vencida há um dia útil',
    tone: 'alert',
  },
  {
    count: 3,
    deadline: { businessDaysLate: 3, dueOn: DUE_ON, state: 'overdue' },
    labelKey: 'deliveryDeadline.label.overdueWithDays',
    name: 'vencida há três dias úteis',
    tone: 'alert',
  },
  {
    count: undefined,
    deadline: { businessDaysLate: 0, dueOn: DUE_ON, state: 'overdue' },
    labelKey: 'deliveryDeadline.label.overdue',
    name: 'vencida com zero dia útil (fim de semana logo depois): sem número',
    tone: 'alert',
  },
  {
    count: undefined,
    deadline: { deliveredOn: DUE_ON, dueOn: DUE_ON, state: 'delivered_on_time' },
    labelKey: 'deliveryDeadline.label.deliveredOnTime',
    name: 'entregue no prazo',
    tone: 'success',
  },
  {
    count: 2,
    deadline: {
      businessDaysLate: 2,
      deliveredOn: '2026-10-19',
      dueOn: DUE_ON,
      state: 'delivered_late',
    },
    labelKey: 'deliveryDeadline.label.deliveredLateWithDays',
    name: 'entregue com dois dias úteis de atraso',
    tone: 'warning',
  },
  {
    count: undefined,
    deadline: {
      businessDaysLate: 0,
      deliveredOn: '2026-10-17',
      dueOn: DUE_ON,
      state: 'delivered_late',
    },
    labelKey: 'deliveryDeadline.label.deliveredLate',
    name: 'entregue fora do prazo com zero dia útil: sem número',
    tone: 'warning',
  },
]

describe('o rótulo do selo do prazo de entrega (spec 236 RF6)', () => {
  for (const viewCase of VIEW_CASES) {
    it(`${viewCase.name}: chave, número e tom`, () => {
      const view = resolveDeliveryDeadlineView(viewCase.deadline)

      expect(view.labelKey).toBe(viewCase.labelKey)
      expect(view.count).toBe(viewCase.count)
      expect(view.tone).toBe(viewCase.tone)
      expect(view.state).toBe(viewCase.deadline.state)
      expect(view.dueOn).toBe(DUE_ON)
    })
  }

  it('o número zero nunca chega ao rótulo: "0 dias" não existe', () => {
    for (const viewCase of VIEW_CASES) {
      expect(resolveDeliveryDeadlineView(viewCase.deadline).count).not.toBe(0)
    }
  })
})

describe('a data de vencimento é uma data civil (spec 236 RF5/RF6)', () => {
  it('pt-BR escreve dia, mês e ano; en escreve mês, dia e ano', () => {
    expect(formatDeliveryDeadlineDate({ language: 'pt-BR', value: '2026-10-15' })).toBe(
      '15/10/2026',
    )
    expect(formatDeliveryDeadlineDate({ language: 'en', value: '2026-10-15' })).toBe('10/15/2026')
    expect(formatDeliveryDeadlineDate({ language: 'pt-BR', value: '2026-01-01' })).toBe(
      '01/01/2026',
    )
    expect(formatDeliveryDeadlineDate({ language: 'pt-BR', value: '2026-12-31' })).toBe(
      '31/12/2026',
    )
  })

  const FORMAT_SCRIPT = `
    import { formatDeliveryDeadlineDate } from ${JSON.stringify(
      new URL('../../src/modules/trip/shared/tripDeliveryDeadlineView.service.ts', import.meta.url)
        .pathname,
    )}
    const dates = ['2026-10-15', '2026-01-01', '2026-12-31', '2026-03-29', '2026-11-01']
    process.stdout.write(JSON.stringify(dates.map((value) => [
      formatDeliveryDeadlineDate({ language: 'pt-BR', value }),
      formatDeliveryDeadlineDate({ language: 'en', value }),
    ])))
  `

  function formatUnderTimeZone(timeZone: string): string {
    const result = Bun.spawnSync(['bun', '-e', FORMAT_SCRIPT], {
      env: { ...process.env, TZ: timeZone },
      stderr: 'pipe',
      stdout: 'pipe',
    })
    if (result.exitCode !== 0) throw new Error(result.stderr.toString())
    return result.stdout.toString()
  }

  it('a saída é a mesma com o processo em São Paulo, em Kiritimati (+14) e em Pago Pago (-11)', () => {
    const saoPaulo = formatUnderTimeZone('America/Sao_Paulo')
    const kiritimati = formatUnderTimeZone('Pacific/Kiritimati')
    const pagoPago = formatUnderTimeZone('Pacific/Pago_Pago')

    expect(JSON.parse(saoPaulo)[0]).toEqual(['15/10/2026', '10/15/2026'])
    expect(kiritimati).toBe(saoPaulo)
    expect(pagoPago).toBe(saoPaulo)
  })
})

type LocaleNode = { [key: string]: LocaleNode | string }

function readLocale(file: string): LocaleNode {
  return JSON.parse(
    readFileSync(new URL(`../../src/modules/trip/locales/${file}`, import.meta.url), 'utf8'),
  ) as LocaleNode
}

function flattenKeys(node: LocaleNode | string, prefix: string): readonly string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node).flatMap(([key, child]) => flattenKeys(child, `${prefix}.${key}`))
}

describe('os textos do prazo de entrega nos dois idiomas (spec 236 RF6)', () => {
  const portuguese = readLocale('trip.locale.json')
  const english = readLocale('trip.en.locale.json')

  for (const block of ['deliveryDeadline', 'deadlineFilter']) {
    it(`o bloco ${block} existe e tem as mesmas chaves em pt-BR e em en`, () => {
      const portugueseNode = portuguese[block]
      const englishNode = english[block]
      if (portugueseNode === undefined || englishNode === undefined) {
        throw new Error(`BLOCK_MISSING:${block}`)
      }
      const portugueseKeys = flattenKeys(portugueseNode, block)
      const englishKeys = flattenKeys(englishNode, block)

      expect(portugueseKeys.length).toBeGreaterThan(0)
      expect([...portugueseKeys].sort()).toEqual([...englishKeys].sort())
    })
  }

  it('cada rótulo que o selo resolve existe nos dois idiomas, com singular e plural quando leva número', () => {
    const labels = (locale: LocaleNode): LocaleNode => {
      const block = locale['deliveryDeadline']
      const label = typeof block === 'object' ? block['label'] : undefined
      if (label === undefined || typeof label === 'string') throw new Error('LABEL_BLOCK_MISSING')
      return label
    }

    for (const locale of [portuguese, english]) {
      const keys = Object.keys(labels(locale))
      for (const viewCase of VIEW_CASES) {
        const name = viewCase.labelKey.split('.').at(-1) ?? ''
        if (viewCase.count === undefined) expect(keys).toContain(name)
        else {
          expect(keys).toContain(`${name}_one`)
          expect(keys).toContain(`${name}_other`)
        }
      }
    }
  })
})
