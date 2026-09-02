/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import {
  createOperationsHttpFixture,
  responseApiError,
  runJobRequest,
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

describe('Operations HTTP run-job contract (spec 072)', () => {
  test('aceita o disparo com 202 e devolve o identificador da execução', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: RUN_PERMISSIONS })

    const response = await fixture.handle(runJobRequest())

    /** `202`, não `201`: quem roda é o worker, e a tela acompanha pela lista de execuções. */
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      data: { executionId: 'execution-1', outcome: 'started' },
    })
    expect(fixture.runJobCalls[0]).toMatchObject({ job: 'geocoding.backfill' })
  })

  /**
   * RNF1: o freio da execução aberta **não é opcional** — `geocoding.backfill` fala com a BrasilAPI,
   * e sem ele o botão vira um jeito de martelar serviço alheio por clique.
   */
  test('recusa com 409 e código estável quando já há execução aberta', async () => {
    const fixture = await createOperationsHttpFixture({
      jobAlreadyRunning: true,
      permissions: RUN_PERMISSIONS,
    })

    const response = await fixture.handle(runJobRequest())

    expect(response.status).toBe(409)
    expect(await responseApiError(response)).toMatchObject({
      error: { code: 'JOB_ALREADY_RUNNING' },
    })
  })

  /** Nome vem do caminho, e caminho é entrada de usuário: fora do catálogo é `400`, não `500`. */
  test('recusa rotina que não está no catálogo', async () => {
    const fixture = await createOperationsHttpFixture({ permissions: RUN_PERMISSIONS })

    const response = await fixture.handle(runJobRequest('nao.existe'))

    expect(response.status).toBe(400)
    expect(fixture.runJobCalls).toEqual([])
  })

  /**
   * RF5: disparar é ação e gasta cota de terceiro — quem só acompanha a operação tem
   * `operations.read` e **não** aperta nada.
   */
  test('nega quem tem apenas operations.read', async () => {
    const fixture = await createOperationsHttpFixture({
      permissions: READ_ONLY_PERMISSIONS,
    })

    const response = await fixture.handle(runJobRequest())

    expect(response.status).toBe(403)
    expect(fixture.runJobCalls).toEqual([])
  })
})
