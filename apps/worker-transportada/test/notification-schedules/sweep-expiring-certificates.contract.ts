/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createSweepExpiringCertificates } from '../../src/notification-schedules/application/sweep-expiring-certificates.use-case.js'
import type { ExpiringCertificate } from '../../src/notification-schedules/infrastructure/drizzle-expiring-certificates.query.js'

const NOW = new Date('2026-10-30T12:00:00.000Z')
const DAY = 86_400_000
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '44444444-4444-4444-8444-444444444444'

function certificate(id: string, daysAhead: number): ExpiringCertificate {
  return {
    companyId: COMPANY_ID,
    createdByUserId: USER_ID,
    expiresAt: new Date(NOW.getTime() + daysAhead * DAY),
    id,
  }
}

function createFixture(rows: readonly ExpiringCertificate[], failWith?: Error) {
  const sent: Record<string, unknown>[] = []
  const logged: string[] = []
  let untilAsked: Date | undefined

  const sweep = createSweepExpiringCertificates({
    logger: {
      debug: () => undefined,
      error: () => undefined,
      info: (message: string) => void logged.push(message),
      warn: (message: string) => void logged.push(message),
    } as never,
    selectExpiringCertificates: async ({ until }) => {
      untilAsked = until
      return rows
    },
    send: async (params) => {
      if (failWith !== undefined) throw failWith
      sent.push({ ...params })
    },
  })

  return { logged, sent, sweep, untilAsked: () => untilAsked }
}

describe('varredura de certificados digitais vencendo', () => {
  test('olha trinta dias à frente do agora', async () => {
    const fixture = createFixture([])
    await fixture.sweep({ now: NOW })

    expect(fixture.untilAsked()?.getTime()).toBe(NOW.getTime() + 30 * DAY)
  })

  test('avisa quem enviou o certificado, vencendo ou vencido, e ignora o que está fora da régua', async () => {
    const fixture = createFixture([
      certificate('a', 10),
      certificate('b', -2),
      certificate('c', 45),
    ])

    const result = await fixture.sweep({ now: NOW })

    expect(result).toEqual({ failures: [], notifiedCount: 2, sweptCount: 3 })
    expect(fixture.sent.map((entry) => entry.templateKey)).toEqual([
      'fiscal.certificate-expiring',
      'fiscal.certificate-expired',
    ])
    expect(fixture.sent.every((entry) => entry.recipientUserId === USER_ID)).toBe(true)
    expect(fixture.sent.every((entry) => entry.locale === 'pt-BR')).toBe(true)
  })

  test('a falha do envio não é engolida: vira causa tipada para o ciclo fechar', async () => {
    const fixture = createFixture([certificate('a', 3)], new Error('boom'))

    const result = await fixture.sweep({ now: NOW })

    expect(result.notifiedCount).toBe(0)
    expect(result.failures).toEqual(['unknown'])
    expect(fixture.logged).toContain('certificate_expiry_notify_failed')
  })
})
