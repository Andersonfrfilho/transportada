/* Copyright (c) 2026 Ada Technology. MIT License. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import { readFileSync } from 'node:fs'

import '@/modules/shared/i18n/i18n.service'
import { DriverForm } from '@/modules/fleet/components/DriverForm.component'
import { DriverHelperFields } from '@/modules/fleet/components/DriverHelperFields.component'
import { DriverList } from '@/modules/fleet/components/DriverList.component'
import { DriverPersonalFields } from '@/modules/fleet/components/DriverPersonalFields.component'
import enLocale from '@/modules/fleet/locales/fleet.en.locale.json'
import ptLocale from '@/modules/fleet/locales/fleet.locale.json'
import { FLEET_FEEDBACK_KEY_BY_ERROR } from '@/modules/fleet/shared/fleet.constant'
import type { FleetDriverDetail, FleetDriverFormState } from '@/modules/fleet/shared/fleet.types'
import {
  createDriverDraft,
  toDriverBody,
  toDriverFormState,
} from '@/modules/fleet/shared/fleetForm.service'
import { resolveFleetFeedbackKey } from '@/modules/fleet/shared/fleetFeedback.service'
import { DRIVER_DETAIL } from './fleet.fixture'

const NOOP = (): void => undefined

/** A ficha monta o cliente HTTP da frota, que lê a configuração de identidade ao ser criado. */
const FORM_ENVIRONMENT = {
  VITE_API_URL: 'https://api.example.test',
  VITE_APP_URL: 'https://app.example.test',
  VITE_KEYCLOAK_CLIENT_ID: 'transportada-web',
  VITE_KEYCLOAK_REALM: 'transportada',
  VITE_KEYCLOAK_URL: 'https://keycloak.example.test',
} as const

/** O rótulo impresso abre o `<span>` do campo; o mesmo texto solto também aparece em dicas. */
function hasField(html: string, label: string): boolean {
  return html.includes(`<span>${label}`)
}

/** O ambiente é do processo inteiro: devolvê-lo evita que outro contrato leia a configuração falsa. */
function withFormEnvironment<TResult>(render: () => TResult): TResult {
  const previous = Object.fromEntries(
    Object.keys(FORM_ENVIRONMENT).map((name) => [name, process.env[name]]),
  )
  Object.assign(process.env, FORM_ENVIRONMENT)
  try {
    return render()
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

function driverDetail(overrides: Partial<FleetDriverDetail>): FleetDriverDetail {
  return { ...DRIVER_DETAIL, ...overrides }
}

function renderForm(driver: FleetDriverDetail): string {
  return withFormEnvironment(() => renderFormMarkup(driver))
}

function renderFormMarkup(driver: FleetDriverDetail): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DriverForm
        driver={driver}
        regions={{ coverage: [], regions: [], replace: () => Promise.resolve(undefined) }}
        vehicles={{
          isReady: true,
          links: [],
          options: [],
          replace: () => Promise.resolve(undefined),
        }}
        onCancel={NOOP}
        onCreate={() => Promise.reject(new Error('unused'))}
        onUpdate={() => Promise.reject(new Error('unused'))}
      />
    </QueryClientProvider>,
  )
}

function renderPersonalFields(state: FleetDriverFormState): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <DriverPersonalFields state={state} onChange={NOOP} />
    </QueryClientProvider>,
  )
}

const LICENSE_LABELS = [
  ptLocale.driverLicense,
  ptLocale.driverLicenseCategory,
  ptLocale.driverFirstLicenseAt,
  ptLocale.driverLicenseExpiresAt,
] as const

describe('a ficha do ajudante não pede CNH (spec 234 T9, D6)', () => {
  it('quem dirige mostra os quatro campos de CNH da ficha', () => {
    const html = renderForm(driverDetail({ canDrive: true }))

    for (const label of LICENSE_LABELS) expect(hasField(html, label)).toBe(true)
  })

  it('quem não dirige não os tem no DOM — oculto, não desabilitado', () => {
    const html = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))

    for (const label of LICENSE_LABELS) expect(hasField(html, label)).toBe(false)
    expect(html).toContain(ptLocale.driverBirthDate)
  })

  it('o emissor da CNH, nos dados pessoais, some junto', () => {
    const driving = renderPersonalFields({ ...createDriverDraft(), profile: 'driver' })
    const helper = renderPersonalFields({ ...createDriverDraft(), profile: 'helper' })
    const pureHelper = renderPersonalFields({ ...createDriverDraft(), canDrive: false })

    expect(hasField(driving, ptLocale.driverLicenseIssuedState)).toBe(true)
    expect(hasField(driving, ptLocale.driverLicenseIssuedCity)).toBe(true)
    for (const html of [helper, pureHelper]) {
      expect(hasField(html, ptLocale.driverLicenseIssuedState)).toBe(false)
      expect(hasField(html, ptLocale.driverLicenseIssuedCity)).toBe(false)
      expect(hasField(html, ptLocale.driverBirthState)).toBe(true)
    }
  })
})

describe('"Pode atuar como ajudante" e "Diária própria" (spec 234 T9, fecha a T12 da 149)', () => {
  function renderFields(state: FleetDriverFormState): string {
    return renderToStaticMarkup(<DriverHelperFields state={state} onChange={NOOP} />)
  }

  it('motorista: o interruptor aparece livre e desligado, sem diária própria', () => {
    const html = renderFields({ ...createDriverDraft(), canActAsHelper: false })

    expect(html).toContain(ptLocale.driverCanActAsHelper)
    expect(html).not.toContain('checked')
    expect(html).not.toContain('disabled')
    expect(html).not.toContain(ptLocale.driverHelperDailyRate)
  })

  it('motorista que ajuda: ligado e livre, com a diária própria e a dica do padrão', () => {
    const html = renderFields({ ...createDriverDraft(), canActAsHelper: true })

    expect(html).toContain('checked')
    expect(html).not.toContain('disabled')
    expect(html).toContain(ptLocale.driverHelperDailyRate)
    expect(html).toContain(ptLocale.driverHelperDailyRateHint)
  })

  it('perfil ajudante na criação: ligado e travado, mesmo com o estado dizendo o contrário', () => {
    const html = renderFields({ ...createDriverDraft(), canActAsHelper: false, profile: 'helper' })

    expect(html).toContain('checked')
    expect(html).toContain('disabled')
    expect(html).toContain(ptLocale.driverHelperLockedHint)
    expect(html).toContain(ptLocale.driverHelperDailyRate)
  })

  it('ajudante puro na edição (canDrive falso): também travado', () => {
    const html = renderFields(toDriverFormState(driverDetail({ canDrive: false })))

    expect(html).toContain('disabled')
    expect(html).toContain('checked')
  })

  it('a diária gravada volta formatada, não como o decimal da API', () => {
    const state = toDriverFormState(
      driverDetail({ canActAsHelper: true, helperDailyRate: '180.0000' }),
    )

    expect(state.helperDailyRate).toBe('180,00')
    expect(renderFields(state)).toContain('180,00')
  })
})

describe('as duas fichas montam o mesmo controle (spec 234 T9)', () => {
  const FORMS = [
    'src/modules/fleet/components/DriverForm.component.tsx',
    'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
  ] as const

  it('a aba e o diálogo leem o perfil do mesmo estado e mostram os mesmos campos de ajuda', () => {
    for (const path of FORMS) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

      expect(source).toContain('const hasLicense = !isHelperOnlyDriver(form.state)')
      expect(source).toContain('<DriverHelperFields state={form.state} onChange={form.patch} />')
      expect(source.match(/\{hasLicense \? \(/g)).toHaveLength(2)
    }
  })
})

describe('a diária própria sai como decimal da API (spec 234 T9)', () => {
  it('digitada vira decimal de quatro casas; vazia vira null, que devolve à geral', () => {
    const typed = toDriverBody({ ...createDriverDraft(), helperDailyRate: '180,00' })
    const blank = toDriverBody({ ...createDriverDraft(), helperDailyRate: '' })

    expect(typed.helperDailyRate).toBe('180.0000')
    expect(blank.helperDailyRate).toBeNull()
  })
})

describe('a lista de motoristas marca quem só ajuda (spec 234 T9)', () => {
  function renderList(driver: FleetDriverDetail): string {
    return renderToStaticMarkup(
      <DriverList
        canManageFleet={false}
        drivers={[{ ...driver, score: null }]}
        vehiclesByDriverId={new Map()}
        onEdit={NOOP}
        onToggleStatus={NOOP}
        onViewVehicle={NOOP}
      />,
    )
  }

  it('o selo "Ajudante" aparece só com canDrive falso', () => {
    expect(renderList(driverDetail({ canDrive: false }))).toContain(ptLocale.helperBadge)
    expect(renderList(driverDetail({ canDrive: true }))).not.toContain(ptLocale.helperBadge)
  })
})

describe('a recusa de ficha vazia chega legível (spec 234 T9)', () => {
  it('FLEET_DRIVER_PROFILE_EMPTY tem texto próprio nos dois idiomas, nunca o genérico', () => {
    const key = FLEET_FEEDBACK_KEY_BY_ERROR.FLEET_DRIVER_PROFILE_EMPTY

    expect(key).toBe('profileEmpty')
    expect(resolveFleetFeedbackKey(new Error('FLEET_DRIVER_PROFILE_EMPTY'))).toBe('profileEmpty')
    expect(ptLocale.profileEmpty).toBeString()
    expect(enLocale.profileEmpty).toBeString()
    expect(ptLocale.profileEmpty).not.toBe(ptLocale.saveError)
  })

  it('os textos novos existem nos dois idiomas', () => {
    for (const key of [
      'driverCanActAsHelper',
      'driverCanActAsHelperHint',
      'driverHelperDailyRate',
      'driverHelperDailyRateHint',
      'driverHelperLockedHint',
      'helperBadge',
    ] as const) {
      expect(ptLocale[key]).toBeString()
      expect(enLocale[key]).toBeString()
    }
  })
})
