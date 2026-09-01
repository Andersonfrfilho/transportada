/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ID } from '../fixtures/company-settings-application.fixture'
import {
  createLandingHttpFixture,
  landingRequest,
  LANDING_PUBLIC_PATH,
  LANDING_SETTINGS_PATH,
} from '../fixtures/landing-http.fixture'

const GROUP_UNIT = {
  city: 'São Paulo',
  cnpj: '12345678000195',
  companyId: COMPANY_ID,
  complement: '',
  district: 'Centro',
  number: '100',
  phone: '11999999999',
  postalCode: '01000000',
  state: 'SP',
  street: 'Rua Um',
  tradeName: 'Sede',
}

describe(`GET ${LANDING_PUBLIC_PATH} HTTP contract`, () => {
  test('answers anonymously, without an authorization header', async () => {
    const fixture = await createLandingHttpFixture()
    fixture.companyGroupRepository.units = [GROUP_UNIT]

    const response = await fixture.handle(
      landingRequest({ authenticated: false, method: 'GET', pathname: LANDING_PUBLIC_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        accentColor: null,
        brandName: null,
        contactEmail: null,
        contactPhone: null,
        /* Spec 068: a lista sai vazia enquanto ninguém cadastrou — ausência, nunca campo faltando. */
        contacts: [],
        sections: {},
        socialLinks: [],
        units: [
          {
            city: 'São Paulo',
            companyId: COMPANY_ID,
            complement: '',
            district: 'Centro',
            number: '100',
            phone: '11999999999',
            postalCode: '01000000',
            state: 'SP',
            street: 'Rua Um',
            tradeName: 'Sede',
          },
        ],
      },
    })
  })

  test('is cacheable, unlike the panel route it mirrors', async () => {
    const fixture = await createLandingHttpFixture()

    const response = await fixture.handle(
      landingRequest({ authenticated: false, method: 'GET', pathname: LANDING_PUBLIC_PATH }),
    )

    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
  })

  test('without a group unit the product serves the app default, not an error', async () => {
    const fixture = await createLandingHttpFixture()

    const response = await fixture.handle(
      landingRequest({ authenticated: false, method: 'GET', pathname: LANDING_PUBLIC_PATH }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { units: [] } })
  })
})

describe(`GET/PUT ${LANDING_SETTINGS_PATH} HTTP contract`, () => {
  test('the panel read is never cached', async () => {
    const fixture = await createLandingHttpFixture()

    const response = await fixture.handle(
      landingRequest({ method: 'GET', pathname: LANDING_SETTINGS_PATH }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('rejects a write without settings.manage', async () => {
    const fixture = await createLandingHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      landingRequest({
        body: JSON.stringify({ brandName: 'Transportadora Azul', sections: {} }),
        method: 'PUT',
        pathname: LANDING_SETTINGS_PATH,
      }),
    )

    expect(response.status).toBe(403)
  })

  test('rejects an accent color that is not a 6-digit hex value', async () => {
    const fixture = await createLandingHttpFixture()

    const response = await fixture.handle(
      landingRequest({
        body: JSON.stringify({ accentColor: 'red', sections: {} }),
        method: 'PUT',
        pathname: LANDING_SETTINGS_PATH,
      }),
    )

    expect(response.status).toBe(400)
  })

  test('writes sanitized settings for the caller company group', async () => {
    const fixture = await createLandingHttpFixture()
    fixture.companyGroupRepository.units = [GROUP_UNIT]

    const response = await fixture.handle(
      landingRequest({
        body: JSON.stringify({
          accentColor: '#1a2b3c',
          brandName: 'Transportadora Azul',
          sections: { hero: { title: 'Bem-vindo' } },
        }),
        method: 'PUT',
        pathname: LANDING_SETTINGS_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.landingSettingsRepository.upsertCalls).toHaveLength(1)
    expect(fixture.landingSettingsRepository.upsertCalls[0]?.cnpjRoot).toBe('12345678')
    expect(await response.json()).toMatchObject({
      data: { accentColor: '#1a2b3c', brandName: 'Transportadora Azul' },
    })
  })
})
