/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  COMPANY_CONTEXT,
  createMdfeHttpFixture,
  DOCUMENT_ID,
  jsonRequest,
  MDFE_MANIFESTS_PREVIEW_PATH,
  OTHER_DOCUMENT_ID,
  PREVIEW,
  READ_ONLY_PERMISSIONS,
  responseApiError,
  responseData,
} from '../fixtures/mdfe-http.fixture'

const previewRequest = (body: unknown): Request =>
  jsonRequest({ body, method: 'POST', path: MDFE_MANIFESTS_PREVIEW_PATH })

describe('MDF-e manifest preview http contract', () => {
  test('previews the selection with the company taken from the token', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      previewRequest({ documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID] }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(JSON.parse(JSON.stringify(PREVIEW)))
    expect(fixture.previewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'mdfe-http-correlation',
        documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      },
    ])
  })

  test('refuses a body that is not a list of document ids', async () => {
    for (const body of [
      {},
      { documentIds: [] },
      { documentIds: ['not-a-uuid'] },
      { documentIds: [DOCUMENT_ID], companyId: COMPANY_CONTEXT.companyId },
    ]) {
      const fixture = await createMdfeHttpFixture()

      const response = await fixture.handle(previewRequest(body))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
      expect(fixture.previewCalls).toEqual([])
    }
  })

  test('refuses a preview from a membership without mdfe.manage', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(previewRequest({ documentIds: [DOCUMENT_ID] }))

    expect(response.status).toBe(403)
    expect(fixture.previewCalls).toEqual([])
  })

  test('answers the domain error of the use case instead of a generic failure', async () => {
    const fixture = await createMdfeHttpFixture({
      previewError: new ApiError({
        code: 'MDFE_MANIFEST_MULTIPLE_ORIGIN_STATES',
        message: 'The selected CT-es start in more than one state.',
        status: 422,
      }),
    })

    const response = await fixture.handle(previewRequest({ documentIds: [DOCUMENT_ID] }))

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_MULTIPLE_ORIGIN_STATES')
  })
})
