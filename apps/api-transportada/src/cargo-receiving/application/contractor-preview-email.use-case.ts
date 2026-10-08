/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): a empresa e o ator vêm sempre do contexto autenticado. O token é gerado aqui,
 * no servidor, e o repositório só vê o hash; o endereço completo volta uma vez, a quem gerou.
 */
import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import {
  ReceivingProfileAllowlistsInvalidError,
  ReceivingProfileAllowlistsRequiredError,
  ReceivingProfileInboundDomainNotConfiguredError,
} from '../domain/contractor-preview-email.error.js'
import {
  buildPreviewInboundAddress,
  generatePreviewInboundToken,
  hashPreviewInboundToken,
} from '../domain/preview-inbound-token.policy.js'
import type { ContractorPreviewEmailRepositoryPort } from './contractor-preview-email.port.js'
import type {
  GeneratedPreviewInboundAddress,
  GetPreviewEmailSettingsParams,
  ListPreviewEmailIntakesParams,
  PreviewEmailActor,
  PreviewEmailIntake,
  PreviewEmailSettings,
  RotatePreviewInboundTokenParams,
  SavePreviewEmailAllowlistsParams,
} from './contractor-preview-email.types.js'

type Dependencies = {
  readonly generateToken?: () => string
  readonly repository: ContractorPreviewEmailRepositoryPort
}

type UseCase<TParams, TResult> = { readonly execute: (params: TParams) => Promise<TResult> }

export type ContractorPreviewEmailUseCases = {
  readonly getSettings: UseCase<GetPreviewEmailSettingsParams, PreviewEmailSettings>
  readonly listIntakes: UseCase<ListPreviewEmailIntakesParams, readonly PreviewEmailIntake[]>
  readonly rotateInboundToken: UseCase<
    RotatePreviewInboundTokenParams,
    GeneratedPreviewInboundAddress
  >
  readonly saveAllowlists: UseCase<SavePreviewEmailAllowlistsParams, PreviewEmailSettings>
}

export function createContractorPreviewEmailUseCases(
  dependencies: Dependencies,
): ContractorPreviewEmailUseCases {
  const { repository } = dependencies
  const generateToken = dependencies.generateToken ?? generatePreviewInboundToken

  return {
    getSettings: {
      async execute({ context, contractorId }) {
        const settings = await repository.read({ companyId: context.companyId, contractorId })
        if (settings === null) throw new ContractorNotFoundError()
        return settings
      },
    },
    listIntakes: {
      async execute({ context, contractorId, limit }) {
        const intakes = await repository.listIntakes({
          companyId: context.companyId,
          contractorId,
          limit,
        })
        if (intakes === null) throw new ContractorNotFoundError()
        return intakes
      },
    },
    rotateInboundToken: {
      async execute(params) {
        const token = generateToken()
        const outcome = await repository.rotateInboundToken({
          actor: toActor(params),
          contractorId: params.contractorId,
          tokenHash: hashPreviewInboundToken(token),
        })
        if (outcome.status === 'contractor_not_found') throw new ContractorNotFoundError()
        if (outcome.status === 'allowlists_missing') {
          throw new ReceivingProfileAllowlistsRequiredError(outcome.missing)
        }
        if (outcome.status === 'domain_not_configured') {
          throw new ReceivingProfileInboundDomainNotConfiguredError()
        }
        return {
          address: buildPreviewInboundAddress({ replyDomain: outcome.replyDomain, token }),
          token,
        }
      },
    },
    saveAllowlists: {
      async execute(params) {
        const outcome = await repository.saveAllowlists({
          actor: toActor(params),
          contractorId: params.contractorId,
          forwarderAllowlist: params.forwarderAllowlist,
          senderAllowlist: params.senderAllowlist,
        })
        if (outcome.status === 'contractor_not_found') throw new ContractorNotFoundError()
        if (outcome.status === 'allowlists_invalid')
          throw new ReceivingProfileAllowlistsInvalidError()
        if (outcome.status === 'allowlists_required') {
          throw new ReceivingProfileAllowlistsRequiredError(outcome.missing)
        }
        return outcome.settings
      },
    },
  }
}

function toActor(params: {
  readonly context: RotatePreviewInboundTokenParams['context']
  readonly correlationId: string
  readonly ipAddress: string
}): PreviewEmailActor {
  return {
    companyId: params.context.companyId,
    correlationId: params.correlationId,
    ipAddress: params.ipAddress,
    userId: params.context.userId,
  }
}
