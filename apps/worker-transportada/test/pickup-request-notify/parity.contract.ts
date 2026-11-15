/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339 T4: o worker copia por valor o prazo do alerta e o estado da API; se um mudar sem o outro, o aviso sai no dia errado
 * ou a rotina escreve num estado que a API não conhece.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  PICKUP_REQUEST_NOTIFY_JOB,
  PICKUP_REQUEST_STALE_ALERT_HOURS,
} from '../../src/pickup-request-notify/domain/pickup-request-notify.constant.js'

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

describe('paridade do pedido de coleta com a API (spec 339 T4)', () => {
  test('o prazo do alerta é o da API', async () => {
    const policy = await read(
      '../../../api-transportada/src/pickup-requests/domain/pickup-request.policy.ts',
    )
    expect(policy).toContain(
      `PICKUP_REQUEST_STALE_ALERT_HOURS = ${PICKUP_REQUEST_STALE_ALERT_HOURS}`,
    )
  })

  test('o nome da rotina está no catálogo da API', async () => {
    const catalog = await read('../../../api-transportada/src/shared/job-catalog.constant.ts')
    expect(catalog).toContain(`job: '${PICKUP_REQUEST_NOTIFY_JOB}'`)
  })

  test('os estados e os eventos que a rotina escreve existem no schema da API', async () => {
    const schema = await read('../../../api-transportada/src/database/pickup-request.schema.ts')
    for (const word of [
      "'requested'",
      "'expired'",
      "'stale'",
      "'client'",
      "'office'",
      "'email'",
      "'whatsapp'",
    ]) {
      expect(schema).toContain(word)
    }
    const sql = await read(
      '../../src/pickup-request-notify/infrastructure/drizzle-pickup-request-notify.repository.ts',
    )
    expect(sql).toContain('pickup_request_notifications')
    expect(sql).toContain("status = 'requested'")
  })
})
