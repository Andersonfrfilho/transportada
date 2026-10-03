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

describe('a ficha do ajudante não pede CNH (spec 235 T9, D6)', () => {
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

describe('"Pode atuar como ajudante" e "Diária própria" (spec 235 T9, fecha a T12 da 149)', () => {
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

describe('o ajudante puro tem uma diária só (spec 235 A2)', () => {
  it('quem dirige mostra a diária de motorista; quem não dirige, só a própria', () => {
    const driving = renderForm(driverDetail({ canDrive: true, canActAsHelper: true }))
    const helperOnly = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))

    expect(hasField(driving, ptLocale.driverDailyAllowanceAmount)).toBe(true)
    expect(driving).toContain(ptLocale.driverDailyAllowanceAmountHint)
    expect(hasField(helperOnly, ptLocale.driverDailyAllowanceAmount)).toBe(false)
    expect(helperOnly).not.toContain(ptLocale.driverDailyAllowanceAmountHint)
    expect(hasField(helperOnly, ptLocale.driverHelperDailyRate)).toBe(true)
  })

  it('na edição a diária de motorista carregada segue no corpo, como a CNH', () => {
    const state = toDriverFormState(
      driverDetail({ canDrive: false, dailyAllowanceAmount: '200.0000' }),
    )

    expect(toDriverBody(state).dailyAllowanceAmount).toBe('200.0000')
  })

  it('na criação com perfil ajudante a diária de motorista sai vazia, mesmo digitada antes', () => {
    const body = toDriverBody({
      ...createDriverDraft(),
      dailyAllowanceAmount: '200,00',
      profile: 'helper',
    })

    expect(body.dailyAllowanceAmount).toBeNull()
  })
})

describe('o ajudante não vê texto de motorista nem de agregado (spec 239 T5 A7)', () => {
  it('a legenda diz "Identificação do ajudante" e o endereço da empresa do agregado some', () => {
    const html = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))

    expect(html).toContain(ptLocale.driverIdentityLegendHelper)
    expect(html).not.toContain(ptLocale.driverIdentityLegend)
    expect(html).not.toContain(ptLocale.driverLinkedAddressLegend)
    expect(html).toContain(ptLocale.driverBirthDate)
  })

  it('quem dirige segue com a legenda de motorista e o endereço da empresa', () => {
    const html = renderForm(driverDetail({ canDrive: true }))

    expect(html).toContain(ptLocale.driverIdentityLegend)
    expect(html).not.toContain(ptLocale.driverIdentityLegendHelper)
    expect(html).toContain(ptLocale.driverLinkedAddressLegend)
  })

  it('a legenda do ajudante existe nos dois idiomas', () => {
    expect(ptLocale.driverIdentityLegendHelper).toBe('Identificação do ajudante')
    expect(enLocale.driverIdentityLegendHelper).toBe('Helper identification')
  })

  it('os dados pessoais do ajudante também não trazem a palavra motorista', () => {
    const helperHtml = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))
    const driverHtml = renderForm(driverDetail({ canDrive: true }))

    expect(helperHtml).toContain(ptLocale.driverPersonalLegendHelper)
    expect(helperHtml).not.toContain(ptLocale.driverPersonalLegend)
    expect(driverHtml).toContain(ptLocale.driverPersonalLegend)
    expect(driverHtml).not.toContain(ptLocale.driverPersonalLegendHelper)
    expect(ptLocale.driverPersonalLegendHelper).toBe('Dados pessoais do ajudante')
    expect(enLocale.driverPersonalLegendHelper).toBe('Helper personal data')
  })

  it('o diálogo de criação rápida troca a mesma legenda pelo mesmo predicado e não monta o endereço', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain("hasLicense ? 'driverIdentityLegend' : 'driverIdentityLegendHelper'")
    expect(source).not.toContain('DriverLinkedAddressFields')
  })
})

describe('as duas fichas montam o mesmo controle (spec 235 T9)', () => {
  /** A aba esconde também a diária de motorista (A2); o diálogo rápido não a tem. */
  const FORMS = [
    ['src/modules/fleet/components/DriverForm.component.tsx', 5],
    ['src/modules/fleet/components/DriverQuickCreateDialog.component.tsx', 3],
  ] as const

  it('a aba e o diálogo leem o perfil do mesmo estado e mostram os mesmos campos de ajuda', () => {
    for (const [path, licenseBlocks] of FORMS) {
      const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

      expect(source).toContain('const hasLicense = !isHelperOnlyDriver(form.state)')
      expect(source).toContain('<DriverHelperFields state={form.state} onChange={form.patch} />')
      expect(source.match(/\{hasLicense \? \(/g)).toHaveLength(licenseBlocks)
    }
  })
})

describe('a diária própria sai como decimal da API (spec 235 T9)', () => {
  it('digitada vira decimal de quatro casas; vazia vira null, que devolve à geral', () => {
    const typed = toDriverBody({ ...createDriverDraft(), helperDailyRate: '180,00' })
    const blank = toDriverBody({ ...createDriverDraft(), helperDailyRate: '' })

    expect(typed.helperDailyRate).toBe('180.0000')
    expect(blank.helperDailyRate).toBeNull()
  })
})

describe('a lista de motoristas marca quem só ajuda (spec 235 T9)', () => {
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

describe('a ficha do ajudante puro fala dele e não traz o que é de motorista (spec 239 B1)', () => {
  it('o endereço e a legenda da ficha são do ajudante, com a variante nos dois idiomas', () => {
    const helperOnly = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))
    const driving = renderForm(driverDetail({ canDrive: true }))

    expect(helperOnly).toContain(`>${ptLocale.driverAddressLegendHelper}<`)
    expect(helperOnly).not.toContain(`>${ptLocale.driverAddressLegend}<`)
    expect(driving).toContain(`>${ptLocale.driverAddressLegend}<`)
    expect(driving).not.toContain(`>${ptLocale.driverAddressLegendHelper}<`)
    expect(ptLocale.driverAddressLegendHelper).toBe('Endereço do ajudante')
    expect(enLocale.driverAddressLegendHelper).toBeString()
  })

  it('a nota (entregas com foto) e as regiões atendidas são do motorista: somem para o ajudante puro', () => {
    const helperOnly = renderForm(driverDetail({ canDrive: false, canActAsHelper: true }))
    const driving = renderForm(driverDetail({ canDrive: true }))

    expect(helperOnly).not.toContain(ptLocale.driverScoreSectionTitle)
    expect(helperOnly).not.toContain(ptLocale.driverCoverage.legend)
    expect(driving).toContain(ptLocale.driverScoreSectionTitle)
    expect(driving).toContain(ptLocale.driverCoverage.legend)
  })

  it('o motorista que também ajuda mantém a nota e as regiões', () => {
    const html = renderForm(driverDetail({ canDrive: true, canActAsHelper: true }))

    expect(html).toContain(ptLocale.driverScoreSectionTitle)
    expect(html).toContain(ptLocale.driverCoverage.legend)
  })
})

describe('a recusa de ficha vazia chega legível (spec 235 T9)', () => {
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
