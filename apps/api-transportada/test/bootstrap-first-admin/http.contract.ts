/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { BootstrapUnavailableError } from '../../src/identity/domain/bootstrap.error'
import {
  ADMINISTRATOR_PASSWORD,
  COMPANY_ID,
  CORRELATION_ID,
  CREATED_SUBJECT,
  CREATED_USER_ID,
  FRONTEND_ORIGIN,
  VALID_ADMINISTRATOR,
  VALID_TOKEN,
  createBootstrapHttpFixture,
  firstAdminPreflightRequest,
  firstAdminRequest,
  responseBody,
} from '../fixtures/bootstrap-http.fixture'

const UNIFORM_NOT_FOUND_BODY = {
  error: {
    code: 'NOT_FOUND',
    correlationId: CORRELATION_ID,
    message: 'Resource not found',
  },
}

const REFUSAL_REASONS = [
  'TOKEN_NOT_CONFIGURED',
  'TOKEN_MISMATCH',
  'ALREADY_PROVISIONED',
  'COMPANY_MISSING',
] as const

describe('bootstrap first admin route', () => {
  test('creates the first administrator and answers 201 with the identity that was born', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))

    expect(response.status).toBe(201)
    expect(await responseBody(response)).toEqual({
      data: { companyId: COMPANY_ID, subject: CREATED_SUBJECT, userId: CREATED_USER_ID },
    })
    expect(fixture.availabilityCalls).toEqual([{ token: VALID_TOKEN }])
    expect(fixture.executeCalls).toEqual([
      { administrator: { ...VALID_ADMINISTRATOR }, correlationId: CORRELATION_ID },
    ])
  })

  test('never authenticates the caller and never resolves a company', async () => {
    const fixture = await createBootstrapHttpFixture()

    await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))

    expect(fixture.events).toEqual([])
  })

  test('checks the arranque token before reading the request body', async () => {
    const fixture = await createBootstrapHttpFixture({
      availabilityError: new BootstrapUnavailableError('TOKEN_MISMATCH'),
    })

    const response = await fixture.handle(
      firstAdminRequest({ body: '{ isto não é json', token: 'token-errado' }),
    )

    expect(response.status).toBe(404)
    expect(await responseBody(response)).toEqual(UNIFORM_NOT_FOUND_BODY)
    expect(fixture.availabilityCalls).toEqual([{ token: 'token-errado' }])
    expect(fixture.executeCalls).toEqual([])
  })

  test('refuses a request that carries no arranque token at all', async () => {
    const fixture = await createBootstrapHttpFixture({
      availabilityError: new BootstrapUnavailableError('TOKEN_MISMATCH'),
    })

    const response = await fixture.handle(firstAdminRequest())

    expect(response.status).toBe(404)
    expect(await responseBody(response)).toEqual(UNIFORM_NOT_FOUND_BODY)
    expect(fixture.availabilityCalls).toEqual([{ token: undefined }])
  })

  test('answers one indistinguishable 404 for every refusal reason', async () => {
    const responses = await Promise.all(
      REFUSAL_REASONS.map(async (reason) => {
        const fixture = await createBootstrapHttpFixture({
          availabilityError: new BootstrapUnavailableError(reason),
        })
        const response = await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))
        return { body: await response.text(), status: response.status }
      }),
    )

    expect(new Set(responses.map((response) => response.status))).toEqual(new Set([404]))
    expect(new Set(responses.map((response) => response.body)).size).toBe(1)
    expect(JSON.parse(responses[0]?.body ?? '{}')).toEqual(UNIFORM_NOT_FOUND_BODY)
  })

  test('refusals are byte-identical to the answer of a route that does not exist', async () => {
    const fixture = await createBootstrapHttpFixture({
      availabilityError: new BootstrapUnavailableError('ALREADY_PROVISIONED'),
    })

    const refused = await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))
    const unmatched = await fixture.handle(
      firstAdminRequest({ pathname: '/bootstrap/rota-que-nao-existe', token: VALID_TOKEN }),
    )

    expect(refused.status).toBe(unmatched.status)
    expect(await refused.text()).toBe(await unmatched.text())
  })

  test('refuses when the administrator appears between the guard and the transaction', async () => {
    const fixture = await createBootstrapHttpFixture({
      executeError: new BootstrapUnavailableError('ALREADY_PROVISIONED'),
    })

    const response = await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))

    expect(response.status).toBe(404)
    expect(await responseBody(response)).toEqual(UNIFORM_NOT_FOUND_BODY)
    expect(fixture.executeCalls).toHaveLength(1)
  })

  test('rejects an invalid administrator payload once the token is accepted', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(
      firstAdminRequest({
        body: { ...VALID_ADMINISTRATOR, email: 'nao-e-email' },
        token: VALID_TOKEN,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.executeCalls).toEqual([])
  })

  test('answers 404 for any method other than GET or POST', async () => {
    const fixture = await createBootstrapHttpFixture()

    const responses = await Promise.all(
      ['PUT', 'PATCH', 'DELETE'].map(async (method) =>
        fixture.handle(firstAdminRequest({ method, token: VALID_TOKEN })),
      ),
    )

    for (const response of responses) {
      expect(response.status).toBe(404)
      expect(await responseBody(response)).toEqual(UNIFORM_NOT_FOUND_BODY)
    }
    expect(fixture.availabilityCalls).toEqual([])
    expect(fixture.checkCalls).toEqual([])
    // Método errado não é rota de outra gente: ninguém autentica para descobrir isso.
    expect(fixture.events).toEqual([])
  })

  test('never echoes the password or the arranque token, in the response or in the logs', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(firstAdminRequest({ token: VALID_TOKEN }))
    const serializedLogs = JSON.stringify(fixture.logs)

    expect(await response.text()).not.toContain(ADMINISTRATOR_PASSWORD)
    expect(serializedLogs).not.toContain(ADMINISTRATOR_PASSWORD)
    expect(serializedLogs).not.toContain(VALID_TOKEN)
  })

  test('allows the browser preflight with authorization and content type', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(firstAdminPreflightRequest())

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'Authorization, Content-Type, Idempotency-Key',
    )
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
  })

  test('refuses the preflight of an origin that is not the frontend', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(
      firstAdminPreflightRequest({ origin: 'https://atacante.example' }),
    )

    expect(response.status).toBe(403)
  })
})

/**
 * A página de primeiro acesso continuava servida depois do arranque, e quem a abrisse via um
 * formulário que já não tinha como concluir. A sondagem existe para a tela saber que a porta fechou
 * — e só para isso. Ela não recebe token, não cria nada e, fechada, responde o mesmo 404 de uma
 * rota que não existe. Quem impede a invasão continua sendo o POST. Emenda ao ADR-0022.
 */
describe('bootstrap availability probe', () => {
  test('answers 204 while the first access is still open', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(firstAdminRequest({ method: 'GET' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.checkCalls).toHaveLength(1)
  })

  test('answers the same uniform 404 once the environment is provisioned', async () => {
    const fixture = await createBootstrapHttpFixture({ isAvailable: false })

    const refused = await fixture.handle(firstAdminRequest({ method: 'GET' }))
    const unmatched = await fixture.handle(
      firstAdminRequest({ method: 'GET', pathname: '/bootstrap/rota-que-nao-existe' }),
    )

    const refusedBody = await refused.text()

    expect(refused.status).toBe(404)
    expect(JSON.parse(refusedBody)).toEqual(UNIFORM_NOT_FOUND_BODY)
    expect(refused.status).toBe(unmatched.status)
    expect(refusedBody).toBe(await unmatched.text())
  })

  /**
   * Aceitar o token aqui trocaria um oráculo sobre o estado da instalação por um oráculo sobre o
   * segredo, que é bem pior: daria ao atacante um lugar barato para adivinhar o arranque.
   */
  test('never reads the authorization header, even when one is offered', async () => {
    const fixture = await createBootstrapHttpFixture()

    const response = await fixture.handle(firstAdminRequest({ method: 'GET', token: VALID_TOKEN }))

    expect(response.status).toBe(204)
    expect(fixture.checkCalls).toEqual([[]])
    expect(fixture.availabilityCalls).toEqual([])
  })

  test('never creates an administrator and never authenticates the caller', async () => {
    const fixture = await createBootstrapHttpFixture()

    await fixture.handle(firstAdminRequest({ method: 'GET', token: VALID_TOKEN }))

    expect(fixture.executeCalls).toEqual([])
    expect(fixture.events).toEqual([])
  })

  test('never echoes the arranque token in the logs', async () => {
    const fixture = await createBootstrapHttpFixture()

    await fixture.handle(firstAdminRequest({ method: 'GET', token: VALID_TOKEN }))

    expect(JSON.stringify(fixture.logs)).not.toContain(VALID_TOKEN)
  })
})
