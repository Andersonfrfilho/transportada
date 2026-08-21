/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import { DRIVER_ID, loadFutureModule, SYNTHETIC_ACCESS_TOKEN } from './fleet.fixture'

const API_URL = 'https://api.example.test'
const AVAILABILITY_PATH = `${API_URL}/fleet/drivers/availability`
const AVAILABLE = { emailTaken: false, licenseNumberTaken: false, taxIdTaken: false }

type DriverAvailability = {
  readonly emailTaken: boolean
  readonly licenseNumberTaken: boolean
  readonly taxIdTaken: boolean
}

type DriverAvailabilityInput = {
  readonly driverId: null | string
  readonly email: string
  readonly licenseNumber: string
  readonly signal?: AbortSignal
  readonly taxId: string
}

type FleetClientModule = {
  readonly createFleetClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly checkDriverAvailability: (
      input: DriverAvailabilityInput,
    ) => Promise<DriverAvailability>
  }
}

type FleetAdaptersModule = {
  readonly createFleetResponseAdapters: () => {
    readonly driverAvailabilityFromApi: (input: unknown) => unknown
  }
}

type RevealableField = {
  focus: (options: { readonly preventScroll: boolean }) => void
  scrollIntoView: (options: { readonly block: string }) => void
}

type DriverUniquenessModule = {
  readonly DRIVER_UNIQUE_FEEDBACK_KEY: Readonly<Record<string, string>>
  readonly revealField: (element: null | RevealableField | undefined) => boolean
  readonly resolveDriverFieldError: (
    error: unknown,
  ) => null | { readonly feedbackKey: string; readonly field: string }
  readonly toDriverFieldErrors: (
    availability: DriverAvailability,
  ) => Readonly<Record<string, string | undefined>>
}

async function loadUniqueness(): Promise<DriverUniquenessModule> {
  return loadFutureModule<DriverUniquenessModule>(
    '../../src/modules/fleet/shared/driverUniqueness.service',
  )
}

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

/** O cliente sempre monta um `Request`; o tipo largo de `fetch` é o que a interface do DOM exige. */
function asRequest(input: RequestInfo | URL): Request {
  if (!(input instanceof Request)) throw new Error('the fleet client always builds a Request')
  return input
}

describe('driver unique field contract', () => {
  // Campo único é conferido no servidor: só a constraint sabe o que já está gravado
  test('asks the api whether a single unique field is taken', async () => {
    const requests: Request[] = []
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: (input) => {
        const request = asRequest(input)
        requests.push(request)
        return Promise.resolve(Response.json({ data: { ...AVAILABLE, taxIdTaken: true } }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.checkDriverAvailability({
        driverId: null,
        email: '',
        licenseNumber: '',
        taxId: '12345678901',
      }),
    ).toEqual({ ...AVAILABLE, taxIdTaken: true })

    const [request] = requests
    if (request === undefined) throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(`${AVAILABILITY_PATH}?taxId=12345678901`)
    expect(request.method).toBe('GET')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
  })

  // A ficha aberta não colide consigo mesma: sem o id a edição acusaria o próprio CPF
  test('carries the open driver out of the comparison', async () => {
    const requests: Request[] = []
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: (input) => {
        const request = asRequest(input)
        requests.push(request)
        return Promise.resolve(Response.json({ data: AVAILABLE }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    await client.checkDriverAvailability({
      driverId: DRIVER_ID,
      email: 'jose@example.test',
      licenseNumber: '',
      taxId: '',
    })

    const [request] = requests
    if (request === undefined) throw new Error('FLEET_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(
      `${AVAILABILITY_PATH}?driverId=${DRIVER_ID}&email=${encodeURIComponent('jose@example.test')}`,
    )
  })

  // Tecla nova cancela a conferência anterior: sem isso a resposta atrasada pinta campo já corrigido
  test('abandons the check when the operator keeps typing', async () => {
    const { createFleetClient } = await loadFutureModule<FleetClientModule>(
      '../../src/modules/fleet/shared/fleetClient.service',
    )
    const controller = new AbortController()
    const client = createFleetClient({
      apiUrl: API_URL,
      fetch: (input) =>
        asRequest(input).signal.aborted
          ? Promise.reject(new DOMException('aborted', 'AbortError'))
          : Promise.resolve(Response.json({ data: AVAILABLE })),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })
    controller.abort()

    expect(
      await client
        .checkDriverAvailability({
          driverId: null,
          email: '',
          licenseNumber: '',
          signal: controller.signal,
          taxId: '12345678901',
        })
        .then(() => 'resolved')
        .catch(() => 'rejected'),
    ).toBe('rejected')
  })

  // Resposta é três booleanos e nada mais: campo a mais é contrato mudado sem ninguém notar
  test('keeps the availability response strict', async () => {
    const { createFleetResponseAdapters } = await loadFutureModule<FleetAdaptersModule>(
      '../../src/modules/fleet/shared/fleetResponse.validation',
    )
    const adapters = createFleetResponseAdapters()

    expect(adapters.driverAvailabilityFromApi(AVAILABLE)).toEqual(AVAILABLE)
    expect(() => adapters.driverAvailabilityFromApi({ ...AVAILABLE, driverId: DRIVER_ID })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.driverAvailabilityFromApi({ ...AVAILABLE, taxIdTaken: 'true' })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
    expect(() => adapters.driverAvailabilityFromApi({ emailTaken: false })).toThrow(
      'FLEET_RESPONSE_INVALID',
    )
  })

  // Todo 409 de colisão tem um campo dono; o resto continua indo para o rodapé
  test('anchors every duplicate error on the field that owns it', async () => {
    const { resolveDriverFieldError } = await loadUniqueness()

    expect(resolveDriverFieldError(new Error('FLEET_DRIVER_TAX_ID_TAKEN'))).toEqual({
      feedbackKey: 'taxIdTaken',
      field: 'taxId',
    })
    expect(resolveDriverFieldError(new Error('FLEET_DRIVER_LICENSE_NUMBER_TAKEN'))).toEqual({
      feedbackKey: 'licenseNumberTaken',
      field: 'licenseNumber',
    })
    expect(resolveDriverFieldError(new Error('FLEET_DRIVER_EMAIL_TAKEN'))).toEqual({
      feedbackKey: 'emailTaken',
      field: 'email',
    })
    // O Keycloak é quem descobre o e-mail repetido no convite, e o código dele é outro
    expect(resolveDriverFieldError(new Error('COMPANY_USER_CONTACT_TAKEN'))).toEqual({
      feedbackKey: 'emailTaken',
      field: 'email',
    })
    // Contato faltando não é colisão, mas também é campo: o operador precisa saber qual preencher
    expect(resolveDriverFieldError(new Error('FLEET_DRIVER_CONTACT_REQUIRED'))).toEqual({
      feedbackKey: 'contactRequired',
      field: 'email',
    })
    expect(resolveDriverFieldError(new Error('FLEET_DRIVER_VERSION_CONFLICT'))).toBeNull()
    expect(resolveDriverFieldError('boom')).toBeNull()
  })

  test('turns the availability answer into the message of each field', async () => {
    const { toDriverFieldErrors } = await loadUniqueness()

    expect(toDriverFieldErrors(AVAILABLE)).toEqual({})
    expect(toDriverFieldErrors({ ...AVAILABLE, emailTaken: true, taxIdTaken: true })).toEqual({
      email: 'emailTaken',
      taxId: 'taxIdTaken',
    })
  })

  test('names every duplicate message in both locales', async () => {
    const { DRIVER_UNIQUE_FEEDBACK_KEY } = await loadUniqueness()

    for (const key of Object.values(DRIVER_UNIQUE_FEEDBACK_KEY)) {
      expect(ptBrLocale[key as keyof typeof ptBrLocale]).toBeString()
      expect(enLocale[key as keyof typeof enLocale]).toBeString()
    }
  })

  // Marcar não basta: em ficha longa o campo que falhou fica fora da tela, e o operador o procura
  test('takes the operator to the field that failed', async () => {
    const { revealField } = await loadUniqueness()
    const calls: string[] = []
    const element: RevealableField = {
      focus: (options) => calls.push(`focus:${String(options.preventScroll)}`),
      scrollIntoView: (options) => calls.push(`scroll:${options.block}`),
    }

    expect(revealField(element)).toBe(true)
    // O foco rola a página pela borda; centralizar é o que põe o campo onde o olho já está
    expect(calls).toEqual(['focus:true', 'scroll:center'])
    expect(revealField(null)).toBe(false)
    expect(revealField(undefined)).toBe(false)
  })

  // Mensagem de campo é do campo: o leitor de tela precisa dela ligada ao input, não solta ao lado
  test('renders the field error inside the field itself', () => {
    const source = readSource('src/modules/fleet/components/FleetField.component.tsx')

    expect(source).toContain('aria-invalid')
    expect(source).toContain('aria-describedby')
    expect(source).toContain('error')
    // Sem a referência ao input não há para onde levar o foco depois do 409
    expect(source).toContain('inputRef')
  })

  // Os dois caminhos de cadastro conferem: só o rápido corrigido deixaria a ficha completa sem aviso
  test('checks the unique fields on both driver forms', () => {
    for (const form of [
      'src/modules/fleet/components/DriverForm.component.tsx',
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]) {
      const source = readSource(form)

      expect(source).toContain('useDriverUniqueness')
      for (const field of ['taxId', 'licenseNumber', 'email']) {
        expect(source).toContain(`uniqueness.errorOf('${field}')`)
        expect(source).toContain(`uniqueness.confirm('${field}'`)
        expect(source).toContain(`uniqueness.bindField('${field}')`)
      }
    }
  })
})
