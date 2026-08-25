/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createLandingPanelClient,
  LandingPanelInvalidAccentColorError,
  LandingPanelRequestError,
} from '../../src/modules/company-settings/shared/landingPanelClient.service'

function stubFetch(response: Response | (() => Response)): typeof fetch {
  return (() =>
    Promise.resolve(typeof response === 'function' ? response() : response)) as unknown as typeof fetch
}

describe('landing panel client', () => {
  test('reads settings and returns the parsed data envelope', async () => {
    const client = createLandingPanelClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: stubFetch(
        Response.json({
          data: {
            accentColor: '#1a2b3c',
            brandName: 'Transportadora Exemplo',
            contactEmail: null,
            contactPhone: null,
            sections: {},
            updatedAt: '2026-08-25T12:00:00.000Z',
          },
        }),
      ),
      getAccessToken: () => Promise.resolve('token'),
    })

    const settings = await client.getSettings()
    expect(settings?.brandName).toBe('Transportadora Exemplo')
  })

  test('an absent configuration reads as null, not an error', async () => {
    const client = createLandingPanelClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: stubFetch(Response.json({ data: null })),
      getAccessToken: () => Promise.resolve('token'),
    })

    expect(await client.getSettings()).toBeNull()
  })

  test('a non-ok response or a network failure collapse to the same request error', async () => {
    const client = createLandingPanelClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: stubFetch(new Response(null, { status: 500 })),
      getAccessToken: () => Promise.resolve('token'),
    })

    const error = await client.getSettings().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LandingPanelRequestError)
  })

  test('an accent color outside the hex format is refused before the request is sent', async () => {
    let requested = false
    const client = createLandingPanelClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: (() => {
        requested = true
        return Promise.resolve(Response.json({ data: null }))
      }),
      getAccessToken: () => Promise.resolve('token'),
    })

    const error = await client
      .updateSettings({
        accentColor: 'red',
        brandName: undefined,
        contactEmail: undefined,
        contactPhone: undefined,
        sections: {},
      })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LandingPanelInvalidAccentColorError)
    expect(requested).toBeFalse()
  })

  test('a valid accent color is sent through', async () => {
    let sentBody: unknown
    const client = createLandingPanelClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: (request: Request) =>
        request.text().then((body) => {
          sentBody = JSON.parse(body)
          return Response.json({ data: null })
        }),
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.updateSettings({
      accentColor: '#1a2b3c',
      brandName: 'Transportadora Exemplo',
      contactEmail: undefined,
      contactPhone: undefined,
      sections: { hero: { subtitle: 'Bem-vindo' } },
    })

    expect(sentBody).toEqual({
      accentColor: '#1a2b3c',
      brandName: 'Transportadora Exemplo',
      contactEmail: undefined,
      contactPhone: undefined,
      sections: { hero: { subtitle: 'Bem-vindo' } },
    })
  })
})
