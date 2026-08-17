/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import { SYNTHETIC_ACCESS_TOKEN, loadFutureModule } from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_BASE_URL = 'https://transportada.test'
const CLIENT_MODULE = '../../src/modules/nfse-invoice/shared/nfseSettingsClient.service'
const CREDENTIAL_FORM_MODULE = '../../src/modules/nfse-invoice/shared/nfseCredentialForm.service'
const PROFILE_FORM_MODULE = '../../src/modules/nfse-invoice/shared/nfseProfileForm.service'

const PROFILE_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e94'
const FREIGHT_RULE_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e95'
const CREDENTIAL_ID = '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e96'
const SYNTHETIC_IDEMPOTENCY_KEY = 'nfse-settings-contract-key-0001'

/** O corpo que a API aceita em `POST` e no `settings` do `PATCH` — nem um campo a mais. */
const PROFILE_SETTINGS_KEYS = [
  'chargeComponentLabel',
  'cnaeCode',
  'descriptionMaxLength',
  'descriptionTemplate',
  'freightRuleId',
  'issExigibility',
  'issRate',
  'issWithheld',
  'municipalTaxationCode',
  'municipalityIbgeCode',
  'municipalityName',
  'name',
  'nbsCode',
  'observations',
  'serviceListItem',
  'taker',
] as const

/** As cinco variáveis que o motor de descrição resolve — qualquer outra é recusada na emissão. */
const DESCRIPTION_VARIABLES = [
  '{{municipio}}',
  '{{notas}}',
  '{{observacoes}}',
  '{{periodo}}',
  '{{quantidadeNotas}}',
] as const

const PANEL_LABEL_KEYS = [
  'nfseCredentialTitle',
  'nfseCredentialHint',
  'nfseCredentialTokenLabel',
  'nfseCredentialTokenHint',
  'nfseCredentialTokenConfigured',
  'nfseCredentialTokenMissing',
  'nfseCredentialCallbackConfigured',
  'nfseCredentialTaxIdLabel',
  'nfseCredentialMunicipalRegistrationLabel',
  'nfseCredentialEnvironmentLabel',
  'nfseCredentialStatusLabel',
  'nfseCredentialSave',
  'nfseCredentialSaved',
  'nfseCredentialError',
  'nfseCredentialAbsent',
  'nfseCredentialInactive',
  'nfseCredentialBlockedApiTokenRequired',
  'nfseCredentialBlockedTaxIdInvalid',
  'nfseProfileTitle',
  'nfseProfileHint',
  'nfseProfileEmpty',
  'nfseProfileNameLabel',
  'nfseProfileFreightRuleLabel',
  'nfseProfileServiceListItemLabel',
  'nfseProfileCnaeLabel',
  'nfseProfileMunicipalityLabel',
  'nfseProfileMunicipalityIbgeLabel',
  'nfseProfileIssRateLabel',
  'nfseProfileIssExigibilityLabel',
  'nfseProfileIssWithheldLabel',
  'nfseProfileTakerLabel',
  'nfseProfileChargeComponentLabel',
  'nfseProfileDescriptionTemplateLabel',
  'nfseProfileDescriptionVariablesHint',
  'nfseProfileDescriptionMaxLengthLabel',
  'nfseProfileMunicipalTaxationLabel',
  'nfseProfileNbsLabel',
  'nfseProfileObservationsLabel',
  'nfseProfileCreate',
  'nfseProfileSave',
  'nfseProfileActivate',
  'nfseProfileDeactivate',
  'nfseProfileSaved',
  'nfseProfileError',
  'nfseProfileBlockedNameRequired',
  'nfseProfileBlockedFreightRuleRequired',
  'nfseProfileBlockedServiceListItemRequired',
  'nfseProfileBlockedCnaeInvalid',
  'nfseProfileBlockedMunicipalityInvalid',
  'nfseProfileBlockedIssRateInvalid',
  'nfseProfileBlockedDescriptionTemplateRequired',
  'nfseProfileBlockedDescriptionMaxLengthInvalid',
] as const

type ProfileSettingsContract = Readonly<{
  chargeComponentLabel: string
  cnaeCode: string
  descriptionMaxLength: string
  descriptionTemplate: string
  freightRuleId: string
  issExigibility: string
  issRate: string
  issWithheld: boolean
  municipalTaxationCode: string
  municipalityIbgeCode: string
  municipalityName: string
  name: string
  nbsCode: string
  observations: string
  serviceListItem: string
  taker: string
}>

const PROFILE_SETTINGS = {
  chargeComponentLabel: 'Frete',
  cnaeCode: '4930202',
  descriptionMaxLength: '2000',
  descriptionTemplate: 'Transporte no período {{periodo}} — {{notas}}',
  freightRuleId: FREIGHT_RULE_ID,
  issExigibility: '1',
  issRate: '0.020000',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '3543402',
  municipalityName: 'Município Sintético',
  name: 'Perfil Sintético',
  nbsCode: '',
  observations: '',
  serviceListItem: '16.02',
  taker: '0',
} as const satisfies ProfileSettingsContract

const PROFILE = {
  ...PROFILE_SETTINGS,
  companyId: '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e97',
  createdAt: '2026-08-01T00:00:00.000Z',
  id: PROFILE_ID,
  status: 'active',
  updatedAt: '2026-08-02T00:00:00.000Z',
  version: '3',
} as const

const CREDENTIAL_SUMMARY = {
  apiTokenConfigured: true,
  callbackTokenConfigured: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  fiscalEnvironment: 'production',
  id: CREDENTIAL_ID,
  municipalRegistration: '',
  provider: 'nota_rp_v2',
  status: 'active',
  taxId: '12345678000199',
  updatedAt: '2026-08-02T00:00:00.000Z',
  version: '2',
} as const

type NfseSettingsClientModule = {
  readonly createNfseSettingsClient: (input: {
    readonly apiUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly changeProfileStatus: (input: {
      readonly expectedVersion: string
      readonly profileId: string
      readonly status: 'active' | 'inactive'
    }) => Promise<Record<string, unknown>>
    readonly createProfile: (input: {
      readonly idempotencyKey: string
      readonly settings: ProfileSettingsContract
    }) => Promise<Record<string, unknown>>
    readonly getCredential: (input: {
      readonly fiscalEnvironment: string
    }) => Promise<Record<string, unknown> | null>
    readonly listProfiles: () => Promise<readonly Record<string, unknown>[]>
    readonly saveCredential: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
    readonly updateProfile: (input: {
      readonly expectedVersion: string
      readonly profileId: string
      readonly settings: ProfileSettingsContract
    }) => Promise<Record<string, unknown>>
  }
}

type CredentialFormModule = {
  readonly buildNfseCredentialSubmission: (draft: Record<string, unknown>) => {
    readonly body?: Record<string, unknown>
    readonly reason?: string
    readonly status: 'blocked' | 'ready'
  }
  readonly EMPTY_NFSE_CREDENTIAL_DRAFT: Record<string, unknown>
  readonly resolveNfseCredentialPresence: (summary: unknown) => string
  readonly toNfseCredentialDraft: (summary: unknown) => Record<string, unknown>
}

type ProfileFormModule = {
  readonly buildNfseProfileSubmission: (draft: Record<string, unknown>) => {
    readonly reason?: string
    readonly settings?: Record<string, unknown>
    readonly status: 'blocked' | 'ready'
  }
  readonly EMPTY_NFSE_PROFILE_DRAFT: Record<string, unknown>
  readonly NFSE_DESCRIPTION_VARIABLES: readonly string[]
  readonly NFSE_PROFILE_BLOCK_REASON: Readonly<Record<string, string>>
  readonly toIssRateDecimal: (percent: string) => null | string
  readonly toIssRatePercent: (rate: string) => string
  readonly toNfseProfileDraft: (profile: unknown) => Record<string, unknown>
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

async function settingsClient(fetch: (request: Request) => Promise<Response>) {
  const { createNfseSettingsClient } =
    await loadFutureModule<NfseSettingsClientModule>(CLIENT_MODULE)
  return createNfseSettingsClient({
    apiUrl: API_BASE_URL,
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function respondWith(input: Readonly<{ body: unknown; status?: number }>) {
  return mock((request: Request): Promise<Response> => {
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
    return Promise.resolve(Response.json(input.body, { status: input.status ?? 200 }))
  })
}

describe('nfse settings client contract', () => {
  test('lista os perfis inteiros na rota protegida por settings.manage', async () => {
    const fetch = respondWith({ body: { data: [PROFILE], page: { nextCursor: null } } })

    const profiles = await (await settingsClient(fetch)).listProfiles()

    expect(profiles).toEqual([PROFILE])
    const [request] = fetch.mock.calls[0] ?? []
    expect(request?.method).toBe('GET')
    expect(request?.url).toStartWith(`${API_BASE_URL}/nfse-emission-profiles?`)
  })

  test('cria o perfil com chave de idempotência no cabeçalho e só os campos do schema', async () => {
    const fetch = respondWith({ body: { data: PROFILE }, status: 201 })

    await (
      await settingsClient(fetch)
    ).createProfile({
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      settings: PROFILE_SETTINGS,
    })

    const [request] = fetch.mock.calls[0] ?? []
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`${API_BASE_URL}/nfse-emission-profiles`)
    expect(request?.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    const body = JSON.parse(await (request as Request).text()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([...PROFILE_SETTINGS_KEYS].sort())
  })

  test('a edição manda a versão esperada ao lado das configurações', async () => {
    const fetch = respondWith({ body: { data: PROFILE } })

    await (
      await settingsClient(fetch)
    ).updateProfile({
      expectedVersion: '3',
      profileId: PROFILE_ID,
      settings: PROFILE_SETTINGS,
    })

    const [request] = fetch.mock.calls[0] ?? []
    expect(request?.method).toBe('PATCH')
    expect(request?.url).toBe(`${API_BASE_URL}/nfse-emission-profiles/${PROFILE_ID}`)
    expect(JSON.parse(await (request as Request).text())).toEqual({
      expectedVersion: '3',
      settings: PROFILE_SETTINGS,
    })
  })

  test('ativar e desativar é a rota de status, nunca um campo do corpo do perfil', async () => {
    const fetch = respondWith({ body: { data: PROFILE } })

    await (
      await settingsClient(fetch)
    ).changeProfileStatus({
      expectedVersion: '3',
      profileId: PROFILE_ID,
      status: 'inactive',
    })

    const [request] = fetch.mock.calls[0] ?? []
    expect(request?.url).toBe(`${API_BASE_URL}/nfse-emission-profiles/${PROFILE_ID}/status`)
    expect(JSON.parse(await (request as Request).text())).toEqual({
      expectedVersion: '3',
      status: 'inactive',
    })
  })

  test('lê a credencial do ambiente pedido e aceita a ausência dela', async () => {
    const configured = respondWith({ body: { data: CREDENTIAL_SUMMARY } })
    const absent = respondWith({ body: { data: null } })

    const summary = await (
      await settingsClient(configured)
    ).getCredential({ fiscalEnvironment: 'production' })
    const missing = await (
      await settingsClient(absent)
    ).getCredential({ fiscalEnvironment: 'homologation' })

    expect(summary).toEqual(CREDENTIAL_SUMMARY)
    expect(missing).toBeNull()
    const [request] = configured.mock.calls[0] ?? []
    expect(request?.url).toBe(
      `${API_BASE_URL}/nfse-provider-credentials?fiscalEnvironment=production`,
    )
  })

  test('grava a credencial com PUT e devolve o resumo sem campo de segredo', async () => {
    const fetch = respondWith({ body: { data: CREDENTIAL_SUMMARY } })

    const saved = await (
      await settingsClient(fetch)
    ).saveCredential({
      apiToken: 'synthetic-token',
      fiscalEnvironment: 'production',
      municipalRegistration: '',
      status: 'active',
      taxId: '12345678000199',
    })

    const [request] = fetch.mock.calls[0] ?? []
    expect(request?.method).toBe('PUT')
    expect(request?.url).toBe(`${API_BASE_URL}/nfse-provider-credentials`)
    expect(Object.keys(saved)).not.toContain('apiToken')
    expect(Object.keys(saved)).not.toContain('callbackToken')
  })

  test('recusa um resumo de credencial que traga o token de volta', async () => {
    const fetch = respondWith({
      body: { data: { ...CREDENTIAL_SUMMARY, apiToken: 'synthetic-token' } },
    })

    expect(
      (await settingsClient(fetch)).getCredential({ fiscalEnvironment: 'production' }),
    ).rejects.toThrow('NFSE_SETTINGS_RESPONSE_INVALID')
  })

  test('propaga o código de erro da API sem inventar mensagem', async () => {
    const fetch = respondWith({ body: { error: { code: 'FORBIDDEN' } }, status: 403 })

    expect((await settingsClient(fetch)).listProfiles()).rejects.toThrow('FORBIDDEN')
  })
})

describe('nfse credential form contract', () => {
  test('nenhum token digitado sobrevive ao resumo devolvido pelo servidor', async () => {
    const { toNfseCredentialDraft } =
      await loadFutureModule<CredentialFormModule>(CREDENTIAL_FORM_MODULE)

    const draft = toNfseCredentialDraft({ ...CREDENTIAL_SUMMARY, apiToken: 'synthetic-token' })

    expect(draft['apiToken']).toBe('')
    expect(Object.values(draft)).not.toContain('synthetic-token')
  })

  test('campo em branco não vira gravação de token vazio', async () => {
    const { buildNfseCredentialSubmission, EMPTY_NFSE_CREDENTIAL_DRAFT } =
      await loadFutureModule<CredentialFormModule>(CREDENTIAL_FORM_MODULE)

    const submission = buildNfseCredentialSubmission({
      ...EMPTY_NFSE_CREDENTIAL_DRAFT,
      apiToken: '   ',
      taxId: '12345678000199',
    })

    expect(submission.status).toBe('blocked')
    expect(submission.reason).toBe('apiTokenRequired')
    expect(submission.body).toBeUndefined()
  })

  test('credencial ausente não é credencial ativa — o rascunho nasce ativo, o ambiente não', async () => {
    const { EMPTY_NFSE_CREDENTIAL_DRAFT, resolveNfseCredentialPresence, toNfseCredentialDraft } =
      await loadFutureModule<CredentialFormModule>(CREDENTIAL_FORM_MODULE)

    // O campo de situação mostra `active` sem credencial nenhuma: é o padrão do formulário.
    expect(EMPTY_NFSE_CREDENTIAL_DRAFT['status']).toBe('active')
    expect(toNfseCredentialDraft(null)['status']).toBe('active')

    for (const absent of [null, undefined, '', 0]) {
      expect(resolveNfseCredentialPresence(absent)).toBe('absent')
    }
  })

  test('nomeia cada estado que impede a emissão, separado do que já emite', async () => {
    const { resolveNfseCredentialPresence } =
      await loadFutureModule<CredentialFormModule>(CREDENTIAL_FORM_MODULE)

    expect(resolveNfseCredentialPresence(CREDENTIAL_SUMMARY)).toBe('ready')
    expect(
      resolveNfseCredentialPresence({ ...CREDENTIAL_SUMMARY, apiTokenConfigured: false }),
    ).toBe('tokenMissing')
    expect(resolveNfseCredentialPresence({ ...CREDENTIAL_SUMMARY, status: 'inactive' })).toBe(
      'inactive',
    )
    // Sem segredo gravado não há o que ativar: o token vem antes da situação.
    expect(
      resolveNfseCredentialPresence({
        ...CREDENTIAL_SUMMARY,
        apiTokenConfigured: false,
        status: 'inactive',
      }),
    ).toBe('tokenMissing')
  })
})

describe('nfse profile form contract', () => {
  test('o corpo enviado tem exatamente os campos do schema da API', async () => {
    const { buildNfseProfileSubmission, toNfseProfileDraft } =
      await loadFutureModule<ProfileFormModule>(PROFILE_FORM_MODULE)

    const submission = buildNfseProfileSubmission(toNfseProfileDraft(PROFILE))

    expect(submission.status).toBe('ready')
    expect(Object.keys(submission.settings ?? {}).sort()).toEqual([...PROFILE_SETTINGS_KEYS].sort())
  })

  test('a alíquota vai e volta em decimal exato, sem passar por float', async () => {
    const { toIssRateDecimal, toIssRatePercent } =
      await loadFutureModule<ProfileFormModule>(PROFILE_FORM_MODULE)

    expect(toIssRateDecimal('2')).toBe('0.020000')
    expect(toIssRateDecimal('2,5')).toBe('0.025000')
    expect(toIssRateDecimal('0,0001')).toBe('0.000001')
    expect(toIssRateDecimal('100')).toBe('1.000000')
    expect(toIssRateDecimal('100,5')).toBeNull()
    expect(toIssRateDecimal('dois')).toBeNull()
    expect(toIssRatePercent('0.025000')).toBe('2,5')
    expect(toIssRatePercent('1.000000')).toBe('100')
  })

  test('cada campo obrigatório tem um bloqueio nomeado antes do envio', async () => {
    const { buildNfseProfileSubmission, NFSE_PROFILE_BLOCK_REASON, toNfseProfileDraft } =
      await loadFutureModule<ProfileFormModule>(PROFILE_FORM_MODULE)
    const draft = toNfseProfileDraft(PROFILE)

    const cases = [
      { patch: { name: ' ' }, reason: NFSE_PROFILE_BLOCK_REASON['NAME_REQUIRED'] },
      { patch: { freightRuleId: '' }, reason: NFSE_PROFILE_BLOCK_REASON['FREIGHT_RULE_REQUIRED'] },
      {
        patch: { serviceListItem: '' },
        reason: NFSE_PROFILE_BLOCK_REASON['SERVICE_LIST_ITEM_REQUIRED'],
      },
      { patch: { cnaeCode: '49302' }, reason: NFSE_PROFILE_BLOCK_REASON['CNAE_INVALID'] },
      {
        patch: { municipalityIbgeCode: '35434' },
        reason: NFSE_PROFILE_BLOCK_REASON['MUNICIPALITY_INVALID'],
      },
      { patch: { issRatePercent: '200' }, reason: NFSE_PROFILE_BLOCK_REASON['ISS_RATE_INVALID'] },
      {
        patch: { descriptionTemplate: '  ' },
        reason: NFSE_PROFILE_BLOCK_REASON['DESCRIPTION_TEMPLATE_REQUIRED'],
      },
      {
        patch: { descriptionMaxLength: '10' },
        reason: NFSE_PROFILE_BLOCK_REASON['DESCRIPTION_MAX_LENGTH_INVALID'],
      },
    ] as const

    for (const scenario of cases) {
      const submission = buildNfseProfileSubmission({ ...draft, ...scenario.patch })
      expect(submission.status).toBe('blocked')
      expect(submission.reason).toBe(scenario.reason as string)
    }
  })

  test('as cinco variáveis da descrição são as que o motor da API resolve', async () => {
    const { NFSE_DESCRIPTION_VARIABLES } =
      await loadFutureModule<ProfileFormModule>(PROFILE_FORM_MODULE)

    expect([...NFSE_DESCRIPTION_VARIABLES].sort()).toEqual([...DESCRIPTION_VARIABLES].sort())
  })
})

describe('nfse settings presentation contract', () => {
  test('traduz cada rótulo dos painéis nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    for (const key of PANEL_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })

  test('a tela diz que deixar o token em branco não apaga o segredo já gravado', async () => {
    const portuguese = await readLocale(
      'src/modules/company-settings/locales/companySettings.locale.json',
    )

    const hint = String(portuguese['nfseCredentialTokenHint'])
    expect(hint).toContain('em branco')
    expect(hint).toContain('não')
    expect(hint).not.toContain('apagar o token')
  })

  test('o painel de descrição mostra as variáveis disponíveis ao operador', async () => {
    const portuguese = await readLocale(
      'src/modules/company-settings/locales/companySettings.locale.json',
    )

    const hint = String(portuguese['nfseProfileDescriptionVariablesHint'])
    for (const variable of DESCRIPTION_VARIABLES) {
      expect(hint).toContain(variable)
    }
  })

  test('os painéis entram na tela com esqueleto, design system e sem cor solta', async () => {
    const [credential, profile, hook, page] = await Promise.all([
      readModule('src/modules/company-settings/components/NfseCredentialPanel.component.tsx'),
      readModule('src/modules/company-settings/components/NfseEmissionProfilePanel.component.tsx'),
      readModule('src/modules/company-settings/hooks/useNfseSettings.hook.ts'),
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
    ])

    expect(page).toContain('<NfseCredentialPanel')
    expect(page).toContain('<NfseEmissionProfilePanel')
    for (const component of [credential, profile]) {
      expect(component).toContain('Skeleton')
      expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
      expect(component).not.toContain('<select')
      expect(component).not.toContain('type="checkbox"')
    }
    for (const method of [
      'changeProfileStatus',
      'createProfile',
      'getCredential',
      'listProfiles',
      'saveCredential',
      'updateProfile',
    ]) {
      expect(hook).toContain(method)
    }
  })

  test('o painel diz a ausência da credencial em vez de deixar o campo de situação responder', async () => {
    const credential = await readModule(
      'src/modules/company-settings/components/NfseCredentialPanel.component.tsx',
    )

    expect(credential).toContain('resolveNfseCredentialPresence')
    expect(credential).toContain('nfseCredentialAbsent')
    expect(credential).toContain('nfseCredentialInactive')
    expect(credential).toContain('role="alert"')
    // A frase entra antes dos campos: depois deles, quem lê "Ativa" já decidiu que existe uma.
    const presenceAt = credential.indexOf('resolveNfseCredentialPresence(props.summary)')
    const statusFieldAt = credential.indexOf('nfseCredentialStatusLabel')
    expect(presenceAt).toBeGreaterThan(-1)
    expect(presenceAt).toBeLessThan(statusFieldAt)
  })

  test('a frase de ausência nomeia o ambiente fiscal, que é o recorte da credencial', async () => {
    const portuguese = await readLocale(
      'src/modules/company-settings/locales/companySettings.locale.json',
    )

    const absent = String(portuguese['nfseCredentialAbsent'])
    expect(absent).toContain('{{environment}}')
    expect(absent).toContain('Nenhuma credencial')
  })

  test('o campo do token não guarda o valor digitado fora do submit', async () => {
    const credential = await readModule(
      'src/modules/company-settings/components/NfseCredentialPanel.component.tsx',
    )

    expect(credential).not.toContain('localStorage')
    expect(credential).not.toContain('sessionStorage')
    expect(credential).toContain('type="password"')
    expect(credential).toContain('autoComplete="off"')
  })
})
