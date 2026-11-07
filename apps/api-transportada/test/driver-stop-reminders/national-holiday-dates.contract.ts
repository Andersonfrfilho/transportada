/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 RF8.2 (dono, 2026-11-07): o calendário de fechamento da cobrança traz só os feriados nacionais.
 */
import { describe, expect, test } from 'bun:test'

import { readNationalHolidayDates } from '../../src/driver-stop-reminders/infrastructure/national-holiday-dates.reader.js'

const COMPANY_ID = 'company-1'
const SAO_PAULO = 'America/Sao_Paulo'

describe('feriados nacionais do fechamento da cobrança (spec 299 RF8.2)', () => {
  test('traz os nacionais do ano corrente, inclusive o móvel (Sexta-feira Santa) e o Natal', async () => {
    const dates = await readNationalHolidayDates({
      companyId: COMPANY_ID,
      now: new Date('2026-11-07T17:00:00.000Z'),
      timeZone: SAO_PAULO,
    })

    expect(dates).toContain('2026-12-25')
    expect(dates).toContain('2026-04-03')
    expect(dates).toContain('2026-11-15')
  })

  test('traz também o ano seguinte, para a busca da próxima abertura virar o ano', async () => {
    const dates = await readNationalHolidayDates({
      companyId: COMPANY_ID,
      now: new Date('2026-12-30T17:00:00.000Z'),
      timeZone: SAO_PAULO,
    })

    expect(dates).toContain('2027-01-01')
  })

  test('o ano vem do fuso da empresa, não do UTC', async () => {
    const dates = await readNationalHolidayDates({
      companyId: COMPANY_ID,
      now: new Date('2027-01-01T01:00:00.000Z'),
      timeZone: SAO_PAULO,
    })

    expect(dates).toContain('2026-12-25')
  })

  test('feriado só estadual ou municipal não entra', async () => {
    const dates = await readNationalHolidayDates({
      companyId: COMPANY_ID,
      now: new Date('2026-11-07T17:00:00.000Z'),
      timeZone: SAO_PAULO,
    })

    expect(dates).not.toContain('2026-07-09')
    expect(dates).not.toContain('2027-01-25')
    expect(dates).not.toContain('2026-11-13')
  })
})
