/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `GET /address-correction-requests/mail-template` (spec 286, T6): o estado e a prévia do modelo do e-mail de
 * correção de endereço, que mora no módulo de notificação. Permissão `settings.manage`, `no-store`, corpo de lista fechada.
 */
import { describe, expect, test } from 'bun:test'

import {
  MAIL_TEMPLATE_STATE,
  createAddressCorrectionHttpFixture,
} from '../fixtures/address-correction-http.fixture.js'
import { CORRELATION_ID, FRONTEND_ORIGIN } from '../fixtures/fleet-http-payload.fixture.js'

const PATH = '/address-correction-requests/mail-template'

function getRequest(): Request {
  return new Request(`${FRONTEND_ORIGIN}${PATH}`, {
    headers: { origin: FRONTEND_ORIGIN, 'x-correlation-id': CORRELATION_ID },
    method: 'GET',
  })
}

describe('GET /address-correction-requests/mail-template http contract', () => {
  test('answers the state of the template and its preview, never cached', async () => {
    const fixture = await createAddressCorrectionHttpFixture()

    const response = await fixture.handle(getRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: MAIL_TEMPLATE_STATE })
    expect(fixture.readMailTemplateCalls).toEqual([{ companyId: fixture.companyId }])
  })

  test('answers an unusable template with its problems and no preview', async () => {
    const fixture = await createAddressCorrectionHttpFixture({
      mailTemplateState: {
        ...MAIL_TEMPLATE_STATE,
        preview: null,
        problems: [{ code: 'not_found' }],
        usable: false,
        version: null,
      },
    })

    const response = await fixture.handle(getRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { preview: null, problems: [{ code: 'not_found' }], usable: false, version: null },
    })
  })

  test('requires settings.manage', async () => {
    const fixture = await createAddressCorrectionHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(getRequest())

    expect(response.status).toBe(403)
    expect(fixture.readMailTemplateCalls).toEqual([])
  })
})
