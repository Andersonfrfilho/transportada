/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CREATE_PROFILE_BODY,
  CTE_PROFILES_PATH,
  IDEMPOTENCY_KEY,
  jsonRequest,
  PROFILE_DETAIL,
  PROFILE_ID,
  PROFILE_SETTINGS_BODY,
} from '../fixtures/cte-profiles-http-payload.fixture'
import { createCteProfilesHttpFixture } from '../fixtures/cte-profiles-http.fixture'

const NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000a0001'

const NFSE_BODY = {
  ...CREATE_PROFILE_BODY,
  settings: {
    ...PROFILE_SETTINGS_BODY,
    nfseEmissionProfileId: NFSE_PROFILE_ID,
    outputDocument: 'nfse',
  },
} as const

type ErrorBody = {
  readonly error: {
    readonly code: string
    readonly details?: readonly { readonly field: string; readonly message: string }[]
  }
}

describe('o documento de saída no corpo do perfil (spec 144 D3)', () => {
  test('aceita os dois campos e os entrega ao caso de uso como vieram', async () => {
    const fixture = await createCteProfilesHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: NFSE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createCalls.at(-1)?.settings).toMatchObject({
      nfseEmissionProfileId: NFSE_PROFILE_ID,
      outputDocument: 'nfse',
    })
  })

  test('serve os dois campos no detalhe', async () => {
    const fixture = await createCteProfilesHttpFixture({
      createResult: {
        ...PROFILE_DETAIL,
        id: PROFILE_ID,
        nfseEmissionProfileId: NFSE_PROFILE_ID,
        outputDocument: 'nfse',
      },
    })

    const response = await fixture.handle(
      jsonRequest({
        body: NFSE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )
    const body = (await response.json()) as {
      readonly data: { readonly nfseEmissionProfileId: string; readonly outputDocument: string }
    }

    expect(response.status).toBe(201)
    expect(body.data.outputDocument).toBe('nfse')
    expect(body.data.nfseEmissionProfileId).toBe(NFSE_PROFILE_ID)
  })

  test('recusa documento fora do catálogo e ponteiro que não é uuid antes do caso de uso', async () => {
    for (const settings of [
      { ...PROFILE_SETTINGS_BODY, outputDocument: 'mdfe' },
      { ...PROFILE_SETTINGS_BODY, nfseEmissionProfileId: 'not-a-uuid', outputDocument: 'nfse' },
    ]) {
      const fixture = await createCteProfilesHttpFixture()
      const response = await fixture.handle(
        jsonRequest({
          body: { ...CREATE_PROFILE_BODY, settings },
          idempotencyKey: IDEMPOTENCY_KEY,
          method: 'POST',
          path: CTE_PROFILES_PATH,
        }),
      )

      expect(response.status).toBe(400)
      expect(fixture.createCalls).toEqual([])
    }
  })

  test('devolve 400 com todos os campos em conflito quando a combinação é proibida', async () => {
    const fixture = await createCteProfilesHttpFixture({
      createError: new ApiError({
        code: 'CTE_PROFILE_OUTPUT_DOCUMENT_INCOHERENT',
        details: [
          { field: 'nfseEmissionProfileId', message: 'required when outputDocument is nfse' },
          { field: 'municipalServicePolicy', message: 'must be allow when outputDocument is nfse' },
        ],
        message: 'Output document, NFS-e profile and municipal service policy do not agree',
        status: 400,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: NFSE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CTE_PROFILES_PATH,
      }),
    )
    const body = (await response.json()) as ErrorBody

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('CTE_PROFILE_OUTPUT_DOCUMENT_INCOHERENT')
    expect(body.error.details?.map((detail) => detail.field)).toEqual([
      'nfseEmissionProfileId',
      'municipalServicePolicy',
    ])
  })
})
