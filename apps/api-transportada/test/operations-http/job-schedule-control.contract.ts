/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import {
  COMPANY_CONTEXT,
  JOB_SCHEDULES_PAGE,
  createOperationsHttpFixture,
  listJobSchedulesRequest,
  pauseJobRequest,
  resumeJobRequest,
  responseApiError,
} from '../fixtures/operations-http.fixture.js'

const RUN_PERMISSIONS: ReadonlySet<CompanyPermission> = new Set([
  'operations.read',
  'operations.run',
  'audit.read',
])
const READ_ONLY_PERMISSIONS: ReadonlySet<CompanyPermission> = new Set([
  'operations.read',
  'audit.read',
])

describe('Operations HTTP job-schedule control contract (spec 161 T21)', () => {
  test('lista o relógio de cada rotina, habilitada ou não', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(listJobSchedulesRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: JOB_SCHEDULES_PAGE })
  })

  test('desliga a rotina e grava quem desligou', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: RUN_PERMISSIONS })

    const response = await fixture.handle(pauseJobRequest())

    expect(response.status).toBe(200)
    expect(fixture.pauseCalls[0]).toMatchObject({
      actorUserId: COMPANY_CONTEXT.userId,
      job: 'trip.occurrence-attachment.purge',
    })
    const body = (await response.json()) as { readonly data: { readonly pausedBy: string } }
    expect(body.data.pausedBy).toBe(COMPANY_CONTEXT.userId)
  })

  test('liga a rotina de volta, limpando quem e quando desligou', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: RUN_PERMISSIONS })

    const response = await fixture.handle(resumeJobRequest())

    expect(response.status).toBe(200)
    expect(fixture.resumeCalls[0]).toMatchObject({ job: 'trip.occurrence-attachment.purge' })
    const body = (await response.json()) as { readonly data: { readonly enabled: boolean } }
    expect(body.data.enabled).toBe(true)
  })

  test('recusa rotina fora do catálogo com 400', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: RUN_PERMISSIONS })

    const response = await fixture.handle(pauseJobRequest('nao.existe'))

    expect(response.status).toBe(400)
    expect(fixture.pauseCalls).toEqual([])
  })

  test('devolve 404 quando a rotina não tem linha no relógio', async () => {
    const fixture = await createOperationsHttpFixture({
      jobScheduleNotFound: true,
      permissions: RUN_PERMISSIONS,
    })

    const response = await fixture.handle(pauseJobRequest())

    expect(response.status).toBe(404)
    expect(await responseApiError(response)).toMatchObject({
      error: { code: 'JOB_SCHEDULE_NOT_FOUND' },
    })
  })

  /** RF5 espelhado: ligar/desligar gasta a mesma cota de decisão operacional que rodar agora. */
  test('nega ligar/desligar para quem tem apenas operations.read', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const pauseResponse = await fixture.handle(pauseJobRequest())
    const resumeResponse = await fixture.handle(resumeJobRequest())

    expect(pauseResponse.status).toBe(403)
    expect(resumeResponse.status).toBe(403)
    expect(fixture.pauseCalls).toEqual([])
    expect(fixture.resumeCalls).toEqual([])
  })
})
