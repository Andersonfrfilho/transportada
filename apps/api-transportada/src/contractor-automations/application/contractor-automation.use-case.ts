/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 285: cadastro da automação do fluxo semanal. A regra mora aqui, não nas rotas: destinatário em
 * minúsculas e sem repetição, e a automação nasce desligada quando o corpo não diz o contrário.
 */
import type {
  ContractorAutomation,
  ContractorAutomationActor,
  ContractorAutomationFields,
  ContractorAutomationPort,
} from './contractor-automation.port.js'

type Dependencies = { readonly automations: ContractorAutomationPort }

export function normalizeRecipients(recipients: readonly string[]): readonly string[] {
  return [...new Set(recipients.map((recipient) => recipient.trim().toLowerCase()))]
}

function normalizeFields(fields: ContractorAutomationFields): ContractorAutomationFields {
  return {
    ...fields,
    name: fields.name.trim(),
    nfseCity: fields.nfseCity === null ? null : fields.nfseCity.trim(),
    recipients: normalizeRecipients(fields.recipients),
  }
}

export function createListContractorAutomationsUseCase(dependencies: Dependencies): {
  readonly execute: (params: {
    readonly companyId: string
  }) => Promise<readonly ContractorAutomation[]>
} {
  return { execute: (params) => dependencies.automations.list(params) }
}

export function createCreateContractorAutomationUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: ContractorAutomationActor & { readonly fields: ContractorAutomationFields },
  ) => Promise<ContractorAutomation>
} {
  return {
    execute: (params) =>
      dependencies.automations.create({ ...params, fields: normalizeFields(params.fields) }),
  }
}

export function createUpdateContractorAutomationUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: ContractorAutomationActor & {
      readonly fields: ContractorAutomationFields
      readonly id: string
    },
  ) => Promise<ContractorAutomation>
} {
  return {
    execute: (params) =>
      dependencies.automations.update({ ...params, fields: normalizeFields(params.fields) }),
  }
}
