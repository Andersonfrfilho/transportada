/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A nova data de vencimento opcional do pedido de prorrogação do boleto: o corpo do registro só aceita `AAAA-MM-DD` que
 * existe; o tipo que não a pede a descarta (nunca recusa); data no passado é 422; o e-mail imprime `DD/MM/AAAA`, e o
 * aviso só existe com a data.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { buildOccurrenceMailSystemHtml } from '../../src/occurrence-conversation/domain/occurrence-mail-system-html.policy.js'
import { TripOccurrenceNewDueDateInPastError } from '../../src/trips/domain/trip.error.js'
import {
  brazilianToday,
  isRealIsoDate,
  resolveNewDueDate,
} from '../../src/trips/domain/occurrence-new-due-date.policy.js'
import {
  buildContractorMailValues,
  formatIsoDate,
} from '../../src/trips/domain/occurrence-mail-values.policy.js'
import type { OccurrenceMailValues } from '../../src/trips/domain/occurrence-mail-values.types.js'
import { parseRegisterOccurrenceRequest } from '../../src/trips/presentation/occurrence.schema.js'

const NOW = new Date('2026-10-28T15:00:00Z')

function registerRequest(extra: Record<string, unknown>): Request {
  return new Request('http://localhost/me/trips/current/documents/x/occurrences', {
    body: JSON.stringify({
      occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

function mailValues(extra: Partial<OccurrenceMailValues> = {}): OccurrenceMailValues {
  return {
    contractorName: 'Spani',
    documentLabel: '899853',
    driverName: 'JOSE',
    itemCode: '',
    itemLabel: '',
    itemQuantity: '',
    note: '',
    occurredOn: '28/10/2026 10:00',
    recipientName: 'Mercado',
    stopLabel: '1',
    totalValue: '4210.00',
    ...extra,
  }
}

describe('isRealIsoDate', () => {
  test.each(['2026-11-25', '2028-02-29'])('%s existe', (value) => {
    expect(isRealIsoDate(value)).toBe(true)
  })
  test.each(['2026-02-31', '2026-13-01', '25/11/2026', '2026-1-1', ''])(
    '%s não existe',
    (value) => {
      expect(isRealIsoDate(value)).toBe(false)
    },
  )
})

describe('corpo do registro do motorista', () => {
  test('aceita a data, e vazio é "não informada"', async () => {
    expect(
      (await parseRegisterOccurrenceRequest(registerRequest({ newDueDate: '2026-11-25' })))
        .newDueDate,
    ).toBe('2026-11-25')
    expect(
      (await parseRegisterOccurrenceRequest(registerRequest({ newDueDate: '  ' }))).newDueDate,
    ).toBeUndefined()
    expect((await parseRegisterOccurrenceRequest(registerRequest({}))).newDueDate).toBeUndefined()
  })

  test.each(['2026-02-31', '25/11/2026', 'amanhã'])('%s é 400', async (value) => {
    const error = await parseRegisterOccurrenceRequest(registerRequest({ newDueDate: value })).then(
      () => undefined,
      (reason: unknown) => reason as Error & { status: number },
    )
    expect(error?.status).toBe(400)
  })
})

describe('resolveNewDueDate', () => {
  test('tipo que não pede descarta, sem recusar', () => {
    expect(resolveNewDueDate({ asksNewDueDate: false, now: NOW, value: '2026-11-25' })).toBeNull()
  })

  test('sem data é nulo, com o tipo pedindo', () => {
    expect(resolveNewDueDate({ asksNewDueDate: true, now: NOW, value: undefined })).toBeNull()
  })

  test('hoje e o futuro valem; o passado é 422', () => {
    expect(brazilianToday(NOW)).toBe('2026-10-28')
    expect(resolveNewDueDate({ asksNewDueDate: true, now: NOW, value: '2026-10-28' })).toBe(
      '2026-10-28',
    )
    expect(resolveNewDueDate({ asksNewDueDate: true, now: NOW, value: '2026-11-25' })).toBe(
      '2026-11-25',
    )
    expect(() =>
      resolveNewDueDate({ asksNewDueDate: true, now: NOW, value: '2026-10-27' }),
    ).toThrow(TripOccurrenceNewDueDateInPastError)
  })

  test('o dia é o de Brasília: 01h UTC ainda é o dia anterior', () => {
    expect(brazilianToday(new Date('2026-10-29T01:00:00Z'))).toBe('2026-10-28')
  })
})

describe('e-mail à contratante', () => {
  test('novaDataVencimento sai em DD/MM/AAAA, e vazia sem data', () => {
    expect(formatIsoDate('2026-11-25')).toBe('25/11/2026')
    expect(
      buildContractorMailValues(mailValues({ requestedDueDate: '2026-11-25' })).mail
        .novaDataVencimento,
    ).toBe('25/11/2026')
    expect(buildContractorMailValues(mailValues()).mail.novaDataVencimento).toBe('')
  })

  test('o aviso só existe com a data, e a data é escapada', () => {
    const base = {
      appBaseUrl: undefined,
      displayName: 'Alfa',
      hasLogo: false,
      hasReplyTo: false,
      itemRows: [],
      itemsSum: '',
      signerInitials: 'A',
      signerIsTeam: false,
    }
    expect(buildOccurrenceMailSystemHtml(base).systemHtml.avisoNovaData).toBe('')
    expect(
      buildOccurrenceMailSystemHtml({ ...base, newDueDate: '' }).systemHtml.avisoNovaData,
    ).toBe('')
    const notice = buildOccurrenceMailSystemHtml({ ...base, newDueDate: '25/11/2026' }).systemHtml
      .avisoNovaData
    expect(notice).toContain('Nova data de vencimento solicitada: 25/11/2026')
    expect(
      buildOccurrenceMailSystemHtml({ ...base, newDueDate: '<b>' }).systemHtml.avisoNovaData,
    ).toContain('&lt;b&gt;')
  })
})

describe('modelo da prorrogação do boleto', () => {
  test('leva o aviso da data fora da área editável', () => {
    const html = readFileSync(
      new URL(
        '../../src/occurrence-conversation/occurrence-mail-templates/prorrogacao-boleto.html',
        import.meta.url,
      ),
      'utf8',
    )
    const area = html.indexOf('<!-- /mensagem -->')
    expect(html.indexOf('{{avisoNovaData}}')).toBeGreaterThan(area)
  })
})
