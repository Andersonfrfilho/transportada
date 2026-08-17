/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createFreightClient,
  type FreightRuleSummary,
} from '@/modules/freight/shared/freightClient.service'
import {
  type NfseCredentialBody,
  resolveDefaultNfseFiscalEnvironment,
} from '@/modules/nfse-invoice/shared/nfseCredentialForm.service'
import { NFSE_EMISSION_PROFILES_QUERY_KEY } from '@/modules/nfse-invoice/shared/nfseInvoice.constant'
import { getDeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { createNfseSettingsClient } from '@/modules/nfse-invoice/shared/nfseSettingsClient.service'
import type {
  NfseEmissionProfileSettings,
  NfseFiscalEnvironment,
} from '@/modules/nfse-invoice/shared/nfseSettings.types'

const NFSE_CREDENTIAL_QUERY_KEY = 'nfse-provider-credential'
const NFSE_FREIGHT_RULES_QUERY_KEY = 'nfse-freight-rules'
const FREIGHT_RULE_PAGE_SIZE = 100

export type NfseProfileSave = Readonly<{
  profileId: string | undefined
  settings: NfseEmissionProfileSettings
  version: string | undefined
}>

export type NfseProfileStatusToggle = Readonly<{
  nextStatus: 'active' | 'inactive'
  profileId: string
  version: string
}>

function createSettingsClient() {
  return createNfseSettingsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function createRuleClient() {
  return createFreightClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

/** Só regra ativa entra no seletor: perfil apontando para rascunho emitiria com valor irreal. */
function selectActiveRules(rules: readonly FreightRuleSummary[]): readonly FreightRuleSummary[] {
  return rules.filter((rule) => rule.status === 'active')
}

export function useNfseSettings(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const [fiscalEnvironment, setFiscalEnvironment] = useState<NfseFiscalEnvironment>(() =>
    resolveDefaultNfseFiscalEnvironment(getDeploymentEnvironment()),
  )
  const client = createSettingsClient()
  const enabled = input.enabled && input.companyId !== undefined
  const profilesKey = [NFSE_EMISSION_PROFILES_QUERY_KEY, input.companyId] as const
  const credentialKey = [NFSE_CREDENTIAL_QUERY_KEY, input.companyId, fiscalEnvironment] as const

  const profilesQuery = useQuery({
    enabled,
    queryFn: () => client.listProfiles(),
    queryKey: profilesKey,
  })
  const credentialQuery = useQuery({
    enabled,
    queryFn: () => client.getCredential({ fiscalEnvironment }),
    queryKey: credentialKey,
  })
  const freightRulesQuery = useQuery({
    enabled,
    queryFn: async () => {
      const page = await createRuleClient().listRules({
        cursor: null,
        limit: FREIGHT_RULE_PAGE_SIZE,
      })
      return selectActiveRules(page.items)
    },
    queryKey: [NFSE_FREIGHT_RULES_QUERY_KEY, input.companyId] as const,
  })

  const profileMutation = useMutation({
    mutationFn: (save: NfseProfileSave) =>
      save.profileId === undefined || save.version === undefined
        ? client.createProfile({
            idempotencyKey: crypto.randomUUID(),
            settings: save.settings,
          })
        : client.updateProfile({
            expectedVersion: save.version,
            profileId: save.profileId,
            settings: save.settings,
          }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: profilesKey })
    },
  })
  const profileStatusMutation = useMutation({
    mutationFn: (toggle: NfseProfileStatusToggle) =>
      client.changeProfileStatus({
        expectedVersion: toggle.version,
        profileId: toggle.profileId,
        status: toggle.nextStatus,
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: profilesKey })
    },
  })
  const credentialMutation = useMutation({
    mutationFn: (body: NfseCredentialBody) => client.saveCredential(body),
    onSuccess(summary) {
      queryClient.setQueryData(credentialKey, summary)
    },
  })

  return {
    credentialMutation,
    credentialQuery,
    fiscalEnvironment,
    freightRulesQuery,
    profileMutation,
    profileStatusMutation,
    profilesQuery,
    setFiscalEnvironment,
  }
}
