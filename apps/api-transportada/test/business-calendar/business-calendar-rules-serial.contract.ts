/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2a: o `readTripDetail` roda dentro de transação nos caminhos de escrita, e consulta
 * concorrente numa transação do Bun SQL pode nunca voltar. As quatro leituras do calendário saem do
 * repositório para uma função que as faz em série e aceita o executor.
 */
import { describe, expect, test } from 'bun:test'

import type { BusinessCalendarRulesExecutor } from '../../src/business-calendar/infrastructure/business-calendar-rules.query.js'
import { loadBusinessCalendarRules } from '../../src/business-calendar/infrastructure/business-calendar-rules.query.js'
import { DrizzleBusinessCalendarRepository } from '../../src/business-calendar/infrastructure/drizzle-business-calendar.repository.js'
import { companyBusinessCalendarSettings } from '../../src/database/company-business-calendar-settings.schema.js'
import { createRecordingSelectExecutor } from '../fixtures/recording-select-executor.fixture.js'

const PARAMS = {
  cityCodes: ['3509502', '3550308'],
  companyId: crypto.randomUUID(),
  coverage: { fromYear: 2026, toYear: 2027 },
} as const

const SETTINGS_ROWS = new Map([[companyBusinessCalendarSettings, [{ saturdayIsBusinessDay: true }]]])

describe('spec 236 T1.2a — as quatro leituras do calendário em série', () => {
  test('a função nova faz as quatro consultas uma de cada vez', async () => {
    const { executor, stats } = createRecordingSelectExecutor({ rowsByTable: SETTINGS_ROWS })

    const loaded = await loadBusinessCalendarRules(executor as BusinessCalendarRulesExecutor, PARAMS)

    expect(stats.queryCount).toBe(4)
    expect(stats.maxInFlight).toBe(1)
    expect(loaded).toEqual({ municipalRules: [], saturdayIsBusinessDay: true, stateRules: [] })
  })

  test('sem cidade só a configuração da empresa é lida', async () => {
    const { executor, stats } = createRecordingSelectExecutor()

    const loaded = await loadBusinessCalendarRules(executor as BusinessCalendarRulesExecutor, {
      ...PARAMS,
      cityCodes: [],
    })

    expect(stats.queryCount).toBe(1)
    expect(loaded.saturdayIsBusinessDay).toBe(false)
  })

  test('o repositório delega e devolve o mesmo, também em série', async () => {
    const { executor, stats } = createRecordingSelectExecutor({ rowsByTable: SETTINGS_ROWS })
    const repository = new DrizzleBusinessCalendarRepository(
      executor as ConstructorParameters<typeof DrizzleBusinessCalendarRepository>[0],
    )

    const loaded = await repository.loadRules(PARAMS)

    expect(stats.queryCount).toBe(4)
    expect(stats.maxInFlight).toBe(1)
    expect(loaded).toEqual({ municipalRules: [], saturdayIsBusinessDay: true, stateRules: [] })
  })
})
