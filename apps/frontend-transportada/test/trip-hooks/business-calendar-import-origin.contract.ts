/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2 (ADR-0100 §4): a origem de cada linha (cadastrado, importado, regra "todo ano"), desligar o
 * importado em vez de excluir, a ressalva de que apagar um feriado digitado também o suprime, e as duas recusas 409
 * novas — data passada e data travada. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildYearlyStateHoliday,
} from '../fixtures/businessCalendar.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  dialog,
  endScenario,
  hasButtonIn,
  inputIn,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { MUNICIPAL_HEADING, STATE_HEADING } from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

const IMPORTED_ID = 'imported-1'
const SUPPRESSIONS_HEADING = 'Feriados desligados'
const SUPPRESS_CALL = 'POST /holiday-imports/suppressions'

function importedHoliday(overrides: Parameters<typeof buildHoliday>[0] = {}) {
  return {
    ...buildHoliday({
      cityIbgeCode: '3509502',
      holidayOn: '2026-11-20',
      id: IMPORTED_ID,
      name: 'Consciência Negra',
      ...overrides,
    }),
    origin: 'imported' as const,
  }
}

function originCells(heading: string): readonly (string | null)[] {
  return rowsOf(sectionOf(heading)).map(
    (row) => row.querySelector('td[data-label="Origem"]')?.textContent ?? null,
  )
}

describe('origem de cada feriado (spec 252 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('a coluna Origem diz cadastrado, importado e regra "todo ano" nos municipais', async () => {
    businessCalendarDouble.rules = [buildRule()]
    businessCalendarDouble.holidays = [
      importedHoliday(),
      { ...buildHoliday({ id: 'typed-1', name: 'Digitada' }), origin: 'typed' },
    ]
    await mountPanel()
    await waitForText('Consciência Negra')

    expect(
      [...sectionOf(MUNICIPAL_HEADING).querySelectorAll('thead th')].map((cell) =>
        cell.textContent?.trim(),
      ),
    ).toContain('Origem')
    expect(originCells(MUNICIPAL_HEADING)).toEqual([
      'Cadastrado, todo ano',
      'Importado (FeriadosAPI)',
      'Cadastrado',
    ])
  })

  it('API que ainda não manda a origem: a célula fica em branco, sem chutar "cadastrado"', async () => {
    businessCalendarDouble.holidays = [buildHoliday()]
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    const [cell] = originCells(MUNICIPAL_HEADING)
    expect(cell).not.toContain('Cadastrado')
    expect(cell).not.toContain('Importado')
    expect(cell).toContain('Origem não informada')
  })

  it('o estadual "todo ano" é cadastrado; o de data fixa segue a origem da API', async () => {
    businessCalendarDouble.stateHolidays = [
      buildYearlyStateHoliday(),
      { ...buildOnceStateHoliday(), origin: 'imported' },
    ]
    await mountPanel()
    await waitForText('Revolução Constitucionalista')

    expect(originCells(STATE_HEADING)).toEqual(['Cadastrado', 'Importado (FeriadosAPI)'])
  })

  it('a linha importada oferece "Desligar" no lugar de "Excluir"; a digitada continua com "Excluir"', async () => {
    businessCalendarDouble.holidays = [
      importedHoliday(),
      { ...buildHoliday({ id: 'typed-1', name: 'Digitada' }), origin: 'typed' },
    ]
    await mountPanel()
    await waitForText('Consciência Negra')
    const section = sectionOf(MUNICIPAL_HEADING)

    expect(hasButtonIn(section, 'Desligar Consciência Negra')).toBe(true)
    expect(hasButtonIn(section, 'Excluir Consciência Negra')).toBe(false)
    expect(hasButtonIn(section, 'Excluir Digitada')).toBe(true)
    expect(hasButtonIn(section, 'Desligar Digitada')).toBe(false)
  })

  it('desligar pede confirmação que diz o efeito e a volta pela próxima execução diária', async () => {
    businessCalendarDouble.holidays = [importedHoliday()]
    await mountPanel()
    await waitForText('Consciência Negra')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Desligar Consciência Negra'))

    expect(dialog()?.textContent).toContain('Desligar o feriado importado “Consciência Negra”?')
    expect(dialog()?.textContent).toContain('não volta nas próximas execuções')
    expect(dialog()?.textContent).toContain('próxima execução diária, não na hora')
    expect(businessCalendarDouble.calls.some((call) => call.startsWith(SUPPRESS_CALL))).toBe(false)
  })

  it('confirmar manda `holidayId` e `scope`, a linha some e a data aparece em "Feriados desligados"', async () => {
    businessCalendarDouble.holidays = [importedHoliday()]
    await mountPanel()
    await waitForText('Consciência Negra')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Desligar Consciência Negra'))

    await click(buttonIn(dialog() ?? document.body, 'Desligar feriado'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `${SUPPRESS_CALL} {"holidayId":"${IMPORTED_ID}","scope":"city"}`,
      ),
    )
    await waitFor(() => expect(rowsOf(sectionOf(MUNICIPAL_HEADING)).length).toBe(0))
    await waitFor(() => expect(rowsOf(sectionOf(SUPPRESSIONS_HEADING)).length).toBe(1))
    expect(dialog()).toBeNull()
  })

  it('o estadual importado é desligado com escopo `state`', async () => {
    businessCalendarDouble.stateHolidays = [
      { ...buildOnceStateHoliday({ id: 'state-imp-1' }), origin: 'imported' },
    ]
    await mountPanel()
    await waitForText('Emancipação Política do Paraná')
    await click(buttonIn(sectionOf(STATE_HEADING), 'Desligar Emancipação Política do Paraná'))

    await click(buttonIn(dialog() ?? document.body, 'Desligar feriado'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `${SUPPRESS_CALL} {"holidayId":"state-imp-1","scope":"state"}`,
      ),
    )
  })

  it('409 de data passada: a mensagem própria fica dentro do diálogo, que continua aberto', async () => {
    businessCalendarDouble.holidays = [importedHoliday({ holidayOn: '2026-01-20' })]
    await mountPanel()
    await waitForText('Consciência Negra')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Desligar Consciência Negra'))

    await click(buttonIn(dialog() ?? document.body, 'Desligar feriado'))

    await waitFor(() =>
      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('hoje em diante'),
    )
    expect(dialog()).not.toBeNull()
  })

  it('apagar uma digitada de data fixa avisa que ela também deixa de ser importada', async () => {
    businessCalendarDouble.holidays = [
      { ...buildHoliday({ id: 'typed-1', name: 'Digitada' }), origin: 'typed' },
    ]
    await mountPanel()
    await waitForText('Digitada')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Digitada'))

    expect(dialog()?.textContent).toContain('também deixam de ser importadas da FeriadosAPI')
    expect(dialog()?.textContent).toContain('restaure em Feriados desligados')
  })

  it('a ressalva não aparece na exclusão da regra "todo ano" nem do estadual "todo ano"', async () => {
    businessCalendarDouble.rules = [buildRule()]
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 14/07')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))
    expect(dialog()?.textContent).not.toContain('FeriadosAPI')
    await click(buttonIn(dialog() ?? document.body, 'Cancelar'))
    await click(buttonIn(sectionOf(STATE_HEADING), 'Excluir Revolução Constitucionalista'))

    expect(dialog()?.textContent).not.toContain('FeriadosAPI')
  })

  it('editar uma importada diz que o nome ou o tipo a tornam sua', async () => {
    businessCalendarDouble.holidays = [importedHoliday()]
    await mountPanel()
    await waitForText('Consciência Negra')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Consciência Negra'))

    expect(sectionOf(MUNICIPAL_HEADING).textContent).toContain(
      'Esta data veio da FeriadosAPI. Editar o nome ou o tipo a torna sua',
    )
  })

  it('409 de data travada ao mudar a data da estadual importada: manda desligar e cadastrar', async () => {
    businessCalendarDouble.stateHolidays = [
      { ...buildOnceStateHoliday({ id: 'state-imp-1' }), origin: 'imported' },
    ]
    await mountPanel()
    await waitForText('Emancipação Política do Paraná')
    await click(buttonIn(sectionOf(STATE_HEADING), 'Editar Emancipação Política do Paraná'))
    expect(sectionOf(STATE_HEADING).textContent).toContain('Esta data veio da FeriadosAPI')
    businessCalendarDouble.failNext.set(
      'PATCH /state-holidays/state-imp-1',
      new BusinessCalendarRequestError({ code: 'HOLIDAY_IMPORT_DATE_LOCKED', status: 409 }),
    )
    await typeInto(inputIn(sectionOf(STATE_HEADING), 'Nome'), 'Emancipação do Paraná')

    await click(buttonIn(sectionOf(STATE_HEADING), 'Salvar alterações'))

    await waitFor(() =>
      expect(sectionOf(STATE_HEADING).querySelector('[role="alert"]')?.textContent).toContain(
        'Desligue este e cadastre a nova data',
      ),
    )
  })
})
