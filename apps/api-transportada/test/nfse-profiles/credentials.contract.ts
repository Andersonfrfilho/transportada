/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_TOKEN,
  CREDENTIAL_SUMMARY,
  READ_ONLY_CONTEXT,
  createNfseProfilesHttpFixture,
  getRequest,
  jsonRequest,
} from '../fixtures/nfse-profiles-http.fixture'

const CREDENTIAL_BODY = {
  apiToken: API_TOKEN,
  fiscalEnvironment: 'homologation',
  municipalRegistration: '123456',
  taxId: '12345678000199',
} as const

describe('NFS-e provider credential routes contract', () => {
  test('reads the credential of one fiscal environment without ever exposing a secret', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      getRequest('/nfse-provider-credentials?fiscalEnvironment=homologation'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { readonly data: Record<string, unknown> }
    expect(body).toEqual({ data: CREDENTIAL_SUMMARY })
    expect(Object.keys(body.data).sort()).toEqual([
      'apiTokenConfigured',
      'callbackTokenConfigured',
      'createdAt',
      'fiscalEnvironment',
      'id',
      'municipalRegistration',
      'provider',
      'status',
      'taxId',
      'updatedAt',
      'version',
    ])
    expect(fixture.readCredentialCalls[0]).toMatchObject({ fiscalEnvironment: 'homologation' })
  })

  test('reports an absent credential as null instead of inventing one', async () => {
    const fixture = await createNfseProfilesHttpFixture({ credential: null })

    const response = await fixture.handle(
      getRequest('/nfse-provider-credentials?fiscalEnvironment=production'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
  })

  /**
   * O contrato central da task: o token existe selado no envelope e em nenhuma resposta. Um token
   * que vaza por `GET` vai para cache de proxy, log de acesso e dump de banco de uma vez só.
   */
  test('never returns the API token, the callback token or the sealed envelope on any route', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const responses = [
      await fixture.handle(getRequest('/nfse-provider-credentials?fiscalEnvironment=homologation')),
      await fixture.handle(
        jsonRequest({ body: CREDENTIAL_BODY, method: 'PUT', path: '/nfse-provider-credentials' }),
      ),
    ]

    for (const response of responses) {
      const body = (await response.json()) as { readonly data: Record<string, unknown> | null }
      expect(JSON.stringify(body)).not.toContain(API_TOKEN)
      for (const forbidden of ['apiToken', 'callbackToken', 'secretEnvelope', 'ciphertext']) {
        expect(Object.keys(body.data ?? {})).not.toContain(forbidden)
      }
    }
  })

  test('saves the credential passing the token straight to the use case and answering with the summary', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREDENTIAL_BODY, method: 'PUT', path: '/nfse-provider-credentials' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: CREDENTIAL_SUMMARY })
    expect(fixture.saveCredentialCalls[0]).toMatchObject({
      apiToken: API_TOKEN,
      fiscalEnvironment: 'homologation',
      municipalRegistration: '123456',
      taxId: '12345678000199',
    })
  })

  test('rejects a credential body with unknown fields or an unsupported fiscal environment', async () => {
    const fixture = await createNfseProfilesHttpFixture()

    const unknownField = await fixture.handle(
      jsonRequest({
        body: { ...CREDENTIAL_BODY, callbackToken: 'chosen-by-the-client' },
        method: 'PUT',
        path: '/nfse-provider-credentials',
      }),
    )
    const unknownEnvironment = await fixture.handle(
      jsonRequest({
        body: { ...CREDENTIAL_BODY, fiscalEnvironment: 'sandbox' },
        method: 'PUT',
        path: '/nfse-provider-credentials',
      }),
    )

    expect([unknownField.status, unknownEnvironment.status]).toEqual([400, 400])
    expect(fixture.saveCredentialCalls).toHaveLength(0)
  })

  test('denies both credential routes without settings.manage', async () => {
    const fixture = await createNfseProfilesHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const read = await fixture.handle(
      getRequest('/nfse-provider-credentials?fiscalEnvironment=homologation'),
    )
    const save = await fixture.handle(
      jsonRequest({ body: CREDENTIAL_BODY, method: 'PUT', path: '/nfse-provider-credentials' }),
    )

    expect([read.status, save.status]).toEqual([403, 403])
    expect(fixture.readCredentialCalls).toHaveLength(0)
    expect(fixture.saveCredentialCalls).toHaveLength(0)
  })
})
