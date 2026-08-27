/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { HealthService } from '../../src/health/health.service.js'
import type { ExtraChargeBatchReport } from '../../src/delivery-clients/application/extra-charge-batch.port.js'
import { ExtraChargeBatchNotFoundError } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { createPublicExtraChargeBatchRoutes } from '../../src/delivery-clients/presentation/public-extra-charge-batch.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'

const TOKEN = 'token-opaco-de-trinta-e-dois-bytes-ou-mais'
const CHARGE_ID = '00000000-0000-4000-8000-000000000005'
const ORIGIN = 'http://127.0.0.1:53000'

const REPORT: ExtraChargeBatchReport = {
  batch: {
    closedAt: '2026-09-01T12:00:00.000Z',
    contractorId: '00000000-0000-4000-8000-000000000003',
    id: '00000000-0000-4000-8000-000000000004',
    periodEnd: '2026-08-31',
    periodStart: '2026-08-01',
    status: 'submitted',
    totalAmount: '135.0000',
  },
  contractorName: 'Spani Atacadista',
  items: [
    {
      amount: '45.0000',
      chargeType: 'unloading',
      chargedOn: '2026-08-10',
      clientName: 'Loja Central',
      clientTaxId: '12345678000190',
      id: CHARGE_ID,
      notes: 'recibo 123',
      rejectionReason: '',
      status: 'submitted',
    },
  ],
  itemsTotal: '135.0000',
}

function createFixture(params: { readonly unknownToken?: boolean } = {}) {
  const decisions: unknown[] = []

  const routes = createPublicExtraChargeBatchRoutes({
    decideByToken: {
      async execute(input) {
        decisions.push(structuredClone(input))
        if (params.unknownToken === true) throw new ExtraChargeBatchNotFoundError()
        return REPORT
      },
    },
    readReportByToken: {
      async execute() {
        if (params.unknownToken === true) throw new ExtraChargeBatchNotFoundError()
        return REPORT
      },
    },
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'public-batch-correlation',
    frontendOrigins: [ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createRouter({
      anonymousRoutes: routes,
      authentication: {
        async authenticate() {
          throw new Error('a página pública não pode autenticar')
        },
      },
      authorization: new AuthorizationService(),
      companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
      healthService: new HealthService({
        database: {
          async close() {},
          async healthCheck() {
            return { healthy: true }
          },
        },
        identityReadiness: {
          async checkReadiness() {
            return true
          },
        },
        migrationStatus: appliedMigrations(),
      }),
      routes: [],
      tenantContext: {
        async resolveCompany() {
          throw new Error('a página pública não tem tenant')
        },
      },
    }),
  })

  return {
    decisions,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
  }
}

function request(input: { readonly body?: unknown; readonly method: string; readonly path: string }) {
  return new Request(`${ORIGIN}${input.path}`, {
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    headers: {
      origin: ORIGIN,
      ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    method: input.method,
  })
}

describe('a página pública do repasse (spec 060 T012)', () => {
  /** A página é anônima de verdade: ela não pode nem tentar autenticar — o token é a credencial. */
  test('serve o relatório do lote sem passar por autenticação', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      request({ method: 'GET', path: `/public/extra-charge-batches/${TOKEN}` }),
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { contractorName: string } }
    expect(payload.data.contractorName).toBe('Spani Atacadista')
  })

  /**
   * O contratante confere cobrança; ele **não navega na nossa base**. Nada de id de viagem, de nota
   * ou de cliente, nem documento do cliente — só o que a linha do relatório precisa dizer.
   */
  test('não vaza identificador interno nem documento do cliente', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      request({ method: 'GET', path: `/public/extra-charge-batches/${TOKEN}` }),
    )
    const body = await response.text()

    expect(body).not.toContain('clientTaxId')
    expect(body).not.toContain('12345678000190')
    expect(body).not.toContain('tripId')
    expect(body).not.toContain('tripDocumentId')
  })

  test('registra a decisão do contratante pelo token', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      request({
        body: { decisions: [{ chargeId: CHARGE_ID, decision: 'approved' }] },
        method: 'POST',
        path: `/public/extra-charge-batches/${TOKEN}/decisions`,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.decisions).toEqual([
      {
        accessToken: TOKEN,
        decisions: [{ chargeId: CHARGE_ID, decision: 'approved', reason: '' }],
      },
    ])
  })

  /** Rejeição sem motivo é perda que ninguém consegue explicar depois. */
  test('recusa rejeição sem motivo', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      request({
        body: { decisions: [{ chargeId: CHARGE_ID, decision: 'rejected' }] },
        method: 'POST',
        path: `/public/extra-charge-batches/${TOKEN}/decisions`,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.decisions).toEqual([])
  })

  /** Token desconhecido responde igual a lote inexistente: a resposta não confirma quase-acertos. */
  test('token desconhecido é 404', async () => {
    const fixture = createFixture({ unknownToken: true })

    const response = await fixture.handle(
      request({ method: 'GET', path: '/public/extra-charge-batches/token-de-mentira' }),
    )

    expect(response.status).toBe(404)
  })
})
