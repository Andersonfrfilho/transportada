/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCompanySettingsClient,
  type CertificatePurpose,
  type CompanyLogoImage,
  type CompanyLogoMetadata,
  type CompanyProfileLookup,
  type CompanySettingsClient as SettingsClient,
  type CompanySettingsUpdate,
  type SafeCertificate,
} from '../shared/companySettingsClient.service'

const SETTINGS_MANAGE = 'settings.manage'
const COMPANY_SETTINGS_QUERY_KEY = 'company-settings'
const COMPANY_LOGO_QUERY_KEY = 'company-logo'
const DIGITAL_CERTIFICATES_QUERY_KEY = 'digital-certificates'

export type CompanySettingsClient = SettingsClient

export type CompanySettingsController = Readonly<{
  canManageSettings: boolean
  getLogo: () => Promise<CompanyLogoImage | null>
  lookupProfileByCnpj: (cnpj: string) => Promise<CompanyProfileLookup | null>
  removeLogo: () => Promise<void>
  retireCertificate: (purpose: CertificatePurpose) => Promise<void>
  replaceCertificate: (body: FormData) => Promise<SafeCertificate>
  replaceLogo: (file: File) => Promise<CompanyLogoMetadata>
  save: (input: CompanySettingsUpdate) => Promise<void>
}>

type ControllerInput = Readonly<{
  client: CompanySettingsClient
  permissions: readonly string[]
}>

function createIdempotencyKey(): string {
  return crypto.randomUUID()
}

function forbidden(): Promise<never> {
  return Promise.reject(new Error('COMPANY_SETTINGS_FORBIDDEN'))
}

export function createCompanySettingsController(input: ControllerInput): CompanySettingsController {
  const canManageSettings = input.permissions.includes(SETTINGS_MANAGE)
  return {
    canManageSettings,
    getLogo: () => (canManageSettings ? input.client.getLogo() : forbidden()),
    lookupProfileByCnpj: (cnpj) =>
      canManageSettings ? input.client.lookupProfileByCnpj(cnpj) : forbidden(),
    removeLogo: () => (canManageSettings ? input.client.removeLogo() : forbidden()),
    retireCertificate: (purpose) =>
      canManageSettings ? input.client.retireCertificate(purpose) : forbidden(),
    replaceCertificate: (body) =>
      canManageSettings ? input.client.replaceCertificate(body) : forbidden(),
    replaceLogo: (file) => (canManageSettings ? input.client.replaceLogo(file) : forbidden()),
    save: (update) =>
      canManageSettings ? input.client.updateSettings(update).then(() => undefined) : forbidden(),
  }
}

function getCompanySettingsClient(): CompanySettingsClient {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: createIdempotencyKey,
  })
}

type QueryKey = readonly [string, string | undefined]

function useSettingsQueries(
  input: Readonly<{
    certificatesKey: QueryKey
    client: CompanySettingsClient
    enabled: boolean
    settingsKey: QueryKey
  }>,
) {
  const query = useQuery({
    enabled: input.enabled,
    queryFn: input.client.getSettings,
    queryKey: input.settingsKey,
  })
  const certificatesQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => input.client.listCertificates({ limit: 25 }),
    queryKey: input.certificatesKey,
  })
  return { certificatesQuery, query }
}

function useSettingsMutations(
  input: Readonly<{
    certificatesKey: QueryKey
    controller: CompanySettingsController
    settingsKey: QueryKey
  }>,
) {
  const queryClient = useQueryClient()
  const certificateMutation = useMutation({
    mutationFn: input.controller.replaceCertificate,
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: input.settingsKey }),
        queryClient.invalidateQueries({ queryKey: input.certificatesKey }),
      ])
    },
  })
  const certificateRetireMutation = useMutation({
    mutationFn: input.controller.retireCertificate,
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: input.settingsKey }),
        queryClient.invalidateQueries({ queryKey: input.certificatesKey }),
      ])
    },
  })
  const lookupMutation = useMutation({
    mutationFn: input.controller.lookupProfileByCnpj,
  })
  const settingsMutation = useMutation({
    mutationFn: input.controller.save,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: input.settingsKey }),
  })
  return { certificateMutation, certificateRetireMutation, lookupMutation, settingsMutation }
}

function useLogo(
  input: Readonly<{
    controller: CompanySettingsController
    logoKey: QueryKey
  }>,
) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: input.logoKey })
  const logoQuery = useQuery({
    enabled: input.controller.canManageSettings,
    queryFn: input.controller.getLogo,
    queryKey: input.logoKey,
  })
  const logoMutation = useMutation({
    mutationFn: input.controller.replaceLogo,
    onSuccess: invalidate,
  })
  const logoRemoveMutation = useMutation({
    mutationFn: input.controller.removeLogo,
    onSuccess: invalidate,
  })
  return { logoMutation, logoQuery, logoRemoveMutation }
}

export function useCompanySettings(
  input: Readonly<{
    companyId?: string
    permissions: readonly string[]
  }>,
) {
  const client = getCompanySettingsClient()
  const controller = createCompanySettingsController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const settingsKey = [COMPANY_SETTINGS_QUERY_KEY, input.companyId] as const
  const certificatesKey = [DIGITAL_CERTIFICATES_QUERY_KEY, input.companyId] as const
  const queries = useSettingsQueries({
    certificatesKey,
    client,
    enabled: controller.canManageSettings,
    settingsKey,
  })
  const mutations = useSettingsMutations({ certificatesKey, controller, settingsKey })
  const logo = useLogo({
    controller,
    logoKey: [COMPANY_LOGO_QUERY_KEY, input.companyId] as const,
  })
  return {
    canManageSettings: controller.canManageSettings,
    ...logo,
    ...mutations,
    ...queries,
  }
}
