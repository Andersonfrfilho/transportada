/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getContractorMailSettingsClient } from '../shared/contractorMailSettingsClient.service'
import type { ContractorMailSettingsSaveBody } from '../shared/contractorMailSettingsClient.service'
import type { ContractorMailSettingsRead } from '../shared/contractorMailSettings.types'

const CONTRACTOR_MAIL_SETTINGS_QUERY_KEY = 'contractor-mail-settings'
const CONTRACTOR_MAIL_CHECKS_QUERY_KEY = 'contractor-mail-settings-checks'
const ADDRESS_CORRECTION_TEMPLATE_QUERY_KEY = 'address-correction-mail-template-usable'

export function useContractorMailSettings(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const queryClient = useQueryClient()
  const client = getContractorMailSettingsClient()
  const enabled = input.enabled && input.companyId !== undefined
  const settingsKey = [CONTRACTOR_MAIL_SETTINGS_QUERY_KEY, input.companyId] as const
  const checksKey = [CONTRACTOR_MAIL_CHECKS_QUERY_KEY, input.companyId] as const

  const settingsQuery = useQuery({
    enabled,
    queryFn: () => client.getSettings(),
    queryKey: settingsKey,
  })
  const checksQuery = useQuery({
    enabled,
    queryFn: () => client.getChecks(),
    queryKey: checksKey,
  })

  /** Spec 286: o modelo do e-mail de correção vive em Notificações; aqui só se pergunta se ele serve. */
  const templateUsableQuery = useQuery({
    enabled,
    queryFn: () => client.isAddressCorrectionTemplateUsable(),
    queryKey: [ADDRESS_CORRECTION_TEMPLATE_QUERY_KEY, input.companyId] as const,
  })

  function invalidateChecks(): void {
    void queryClient.invalidateQueries({ queryKey: checksKey })
  }

  const saveMutation = useMutation({
    mutationFn: (body: ContractorMailSettingsSaveBody) => client.saveSettings(body),
    onSuccess(summary) {
      queryClient.setQueryData<ContractorMailSettingsRead>(settingsKey, (current) => ({
        sandboxDelivery: current?.sandboxDelivery ?? false,
        summary,
      }))
      invalidateChecks()
    },
  })

  /** `202`: o envio é assíncrono, e é a chegada da resposta que fecha os três últimos itens. */
  const sendTestEmailMutation = useMutation({
    mutationFn: () => client.sendTestEmail(),
    onSuccess: invalidateChecks,
  })

  return {
    checksQuery,
    refreshChecks: invalidateChecks,
    saveMutation,
    sendTestEmailMutation,
    settingsQuery,
    templateUsableQuery,
  }
}
