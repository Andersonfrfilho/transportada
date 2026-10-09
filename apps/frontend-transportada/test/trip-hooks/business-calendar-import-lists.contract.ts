/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2 (ADR-0100 §4): "Removidos pelo fornecedor" (`{ items, truncated }`) e "Feriados desligados" (lista
 * paginada como `/cities`) — desligar com confirmação, restaurar com o aviso de que a data volta na próxima execução
 * diária, paginar, e falhar dizendo o motivo. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildHoliday } from '../fixtures/businessCalendar.fixture'
import {
  buildImportStatus,
  buildSuppression,
  REMOVED_HOLIDAY_ID,
  SUPPRESSION_ID,
} from '../fixtures/holidayImport.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import { seedMunicipalities } from './businessCalendarForms.helper'
import {
  buttonIn,
  callsOf,
  click,
  endScenario,
  hasButtonIn,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import { waitFor } from './renderHook.helper'

const REMOVED = 'Removidos pelo fornecedor'
const SUPPRESSIONS = 'Feriados desligados'
const SUPPRESS_CALL = 'POST /holiday-imports/suppressions'

/** Datas longe no futuro e no passado: a tela compara com o relógio real, e a lista não pode envelhecer. */
const FUTURE_DAY = '2099-11-20'
const PAST_DAY = '2020-11-20'
const PAST_HOLIDAY_ID = '6f5cae40-3d9f-4ab2-87e8-9f4a1d3b2c53'

function removedItem() {
  return {
    holidayId: REMOVED_HOLIDAY_ID,
    holidayOn: FUTURE_DAY,
    ibgeCode: '3509502',
    name: 'Consciência Negra',
    scope: 'city' as const,
  }
}

function seedRemoved(truncated = false): void {
  businessCalendarDouble.holidays = [
    {
      ...buildHoliday({
        cityIbgeCode: '3509502',
        holidayOn: FUTURE_DAY,
        id: REMOVED_HOLIDAY_ID,
        name: 'Consciência Negra',
      }),
      origin: 'imported',
    },
  ]
  businessCalendarDouble.importStatus = buildImportStatus({
    removedByProvider: { items: [removedItem()], truncated },
  })
}

describe('removidos pelo fornecedor (spec 252 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('vazio: diz que nenhuma data foi removida', async () => {
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(REMOVED).textContent).toContain(
        'Nenhuma data foi removida pelo fornecedor.',
      ),
    )
    expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(0)
  })

  it('lista a data da própria empresa que o fornecedor deixou de listar, com a orientação', async () => {
    seedRemoved()
    seedMunicipalities()
    await mountPanel()

    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(1))
    const block = sectionOf(REMOVED).textContent ?? ''
    expect(block).toContain('Consciência Negra')
    expect(block).toContain('20/11/2099')
    expect(block).toContain('Cidade')
    expect(block).toContain('edite o nome ou o tipo na tabela')
    expect(block).not.toContain('Há mais datas removidas')
  })

  it('truncada: avisa que há mais datas do que cabem na lista', async () => {
    seedRemoved(true)
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(REMOVED).textContent).toContain('Há mais datas removidas do que cabem'),
    )
  })

  it('data que já passou fica listada, mas sem "Desligar": a API recusaria com 409 (D7)', async () => {
    seedRemoved()
    businessCalendarDouble.importStatus = buildImportStatus({
      removedByProvider: {
        items: [
          { ...removedItem(), holidayId: PAST_HOLIDAY_ID, holidayOn: PAST_DAY, name: 'Passada' },
          removedItem(),
        ],
        truncated: false,
      },
    })
    await mountPanel()

    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(2))
    expect(sectionOf(REMOVED).textContent).toContain('Passada')
    expect(sectionOf(REMOVED).textContent).toContain('20/11/2020')
    expect(hasButtonIn(sectionOf(REMOVED), 'Desligar Passada')).toBe(false)
    expect(hasButtonIn(sectionOf(REMOVED), 'Desligar Consciência Negra')).toBe(true)
  })

  it('"Desligar" pergunta antes; cancelar não chama a API', async () => {
    seedRemoved()
    await mountPanel()
    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(1))

    await click(buttonIn(sectionOf(REMOVED), 'Desligar Consciência Negra'))
    expect(sectionOf(REMOVED).textContent).toContain('Ela não volta nas próximas execuções.')
    await click(buttonIn(sectionOf(REMOVED), 'Cancelar'))

    expect(hasButtonIn(sectionOf(REMOVED), 'Desligar Consciência Negra')).toBe(true)
    expect(businessCalendarDouble.calls.some((call) => call.startsWith(SUPPRESS_CALL))).toBe(false)
  })

  it('confirmar desliga: sai de "removidos" e entra em "Feriados desligados"', async () => {
    seedRemoved()
    await mountPanel()
    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(1))
    await click(buttonIn(sectionOf(REMOVED), 'Desligar Consciência Negra'))

    await click(buttonIn(sectionOf(REMOVED), 'Sim, desligar'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `${SUPPRESS_CALL} {"holidayId":"${REMOVED_HOLIDAY_ID}","scope":"city"}`,
      ),
    )
    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(0))
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))
  })

  it('a falha ao desligar é dita no próprio bloco, e a data continua na lista', async () => {
    seedRemoved()
    await mountPanel()
    await waitFor(() => expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(1))
    businessCalendarDouble.failNext.set(
      SUPPRESS_CALL,
      new BusinessCalendarRequestError({ code: 'HOLIDAY_IMPORT_PAST_DATE', status: 409 }),
    )
    await click(buttonIn(sectionOf(REMOVED), 'Desligar Consciência Negra'))

    await click(buttonIn(sectionOf(REMOVED), 'Sim, desligar'))

    await waitFor(() =>
      expect(sectionOf(REMOVED).querySelector('[role="alert"]')?.textContent).toContain(
        'hoje em diante',
      ),
    )
    expect(sectionOf(REMOVED).querySelectorAll('li').length).toBe(1)
  })
})

describe('feriados desligados (spec 252 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('vazio: diz que nenhum feriado está desligado, e a dica explica a restauração', async () => {
    await mountPanel()

    await waitForText('Nenhum feriado desligado.')
    expect(sectionOf(SUPPRESSIONS).textContent).toContain(
      'próxima execução diária da rotina, não na hora',
    )
  })

  it('lista lugar (nome da cidade), data, escopo e quando foi desligado', async () => {
    businessCalendarDouble.suppressions = [buildSuppression()]
    seedMunicipalities()
    await mountPanel()

    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))
    await waitFor(() =>
      expect(rowsOf(sectionOf(SUPPRESSIONS))[0]?.textContent).toContain('Campinas'),
    )
    const row = rowsOf(sectionOf(SUPPRESSIONS))[0]?.textContent ?? ''
    expect(row).toContain('20/11/2026')
    expect(row).toContain('Cidade')
    expect(row).toContain('08/10/2026')
  })

  it('o estado aparece pela sigla e com o escopo "Estado"', async () => {
    businessCalendarDouble.suppressions = [
      buildSuppression({ holidayOn: '2026-12-19', ibgeCode: '41', scope: 'state' }),
    ]
    await mountPanel()

    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))
    const row = rowsOf(sectionOf(SUPPRESSIONS))[0]?.textContent ?? ''
    expect(row).toContain('PR')
    expect(row).toContain('Estado')
  })

  it('restaurar chama o DELETE, tira a linha e diz que a data volta na próxima execução diária', async () => {
    businessCalendarDouble.suppressions = [buildSuppression()]
    await mountPanel()
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))

    await click(buttonIn(sectionOf(SUPPRESSIONS), 'Restaurar o feriado de 3509502 em 20/11/2026'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `DELETE /holiday-imports/suppressions/${SUPPRESSION_ID}`,
      ),
    )
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(0))
    expect(sectionOf(SUPPRESSIONS).querySelector('[role="status"]')?.textContent).toContain(
      'Restaurado. A data volta na próxima execução diária da rotina.',
    )
  })

  it('a falha ao restaurar é dita e a linha continua', async () => {
    businessCalendarDouble.suppressions = [buildSuppression()]
    await mountPanel()
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))
    businessCalendarDouble.failNext.set(
      `DELETE /holiday-imports/suppressions/${SUPPRESSION_ID}`,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )

    await click(buttonIn(sectionOf(SUPPRESSIONS), 'Restaurar o feriado de 3509502 em 20/11/2026'))

    await waitFor(() =>
      expect(sectionOf(SUPPRESSIONS).querySelector('[role="alert"]')?.textContent).toContain(
        'indisponível',
      ),
    )
    expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1)
  })

  it('pagina de 20 em 20: a segunda página pede `page=2` e mostra o resto', async () => {
    businessCalendarDouble.suppressions = Array.from({ length: 25 }, (_, index) =>
      buildSuppression({
        holidayOn: `2026-12-${String(index + 1).padStart(2, '0')}`,
        id: `suppression-${String(index)}`,
      }),
    )
    await mountPanel()
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(20))
    expect(sectionOf(SUPPRESSIONS).textContent).toContain('Página 1 de 2')

    await click(buttonIn(sectionOf(SUPPRESSIONS), 'Próxima página'))

    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(5))
    expect(
      callsOf('GET /holiday-imports/suppressions?page=2&perPage=20', businessCalendarDouble.calls),
    ).toHaveLength(1)
    expect(sectionOf(SUPPRESSIONS).textContent).toContain('Página 2 de 2')
  })

  it('falha ao ler a lista: diz o motivo e "Tentar de novo" lê outra vez', async () => {
    businessCalendarDouble.suppressions = [buildSuppression()]
    businessCalendarDouble.failNext.set(
      'GET /holiday-imports/suppressions?page=1&perPage=20',
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(SUPPRESSIONS).querySelector('[role="alert"]')?.textContent).toContain(
        'indisponível',
      ),
    )
    await click(buttonIn(sectionOf(SUPPRESSIONS), 'Tentar de novo'))

    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS)).length).toBe(1))
  })

  it('sem `settings.manage` nenhuma rota de importação é chamada', async () => {
    await mountPanel(false)

    expect(callsOf('GET /holiday-imports', businessCalendarDouble.calls)).toEqual([])
    expect(document.querySelectorAll('h3').length).toBe(0)
  })
})
