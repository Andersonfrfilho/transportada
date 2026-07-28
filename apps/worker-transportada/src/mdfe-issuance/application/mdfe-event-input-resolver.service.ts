/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeActiveCertificate } from '../infrastructure/drizzle-mdfe-certificate.repository.js'
import type { MdfeEventTarget } from '../infrastructure/drizzle-mdfe-event-target.repository.js'
import type { MdfeFiscalConfig } from '../infrastructure/mdfe-fiscal-gateway.js'
import type { MdfeIssuancePersistedPayload } from '../infrastructure/drizzle-mdfe-issuance-payload.repository.js'

import {
  parseProviderConfig,
  resolveCertificate,
  type MdfeCertificateSecretService,
} from './mdfe-issuance-execution-input-resolver.service.js'
import { MdfeIssuanceFatalError } from './mdfe-issuance-worker-message-handler.service.js'

export type MdfeEventInputResolverDependencies = {
  readonly certificateRepository: {
    findActiveCertificate(input: {
      readonly companyId: string
    }): Promise<MdfeActiveCertificate | null>
  }
  readonly eventTargetRepository: {
    findAuthorizedDocument(input: {
      readonly companyId: string
      readonly manifestId: string
    }): Promise<MdfeEventTarget | null>
  }
  readonly payloadRepository: {
    findByAttempt(input: {
      readonly attemptId: string
      readonly companyId: string
    }): Promise<MdfeIssuancePersistedPayload | null>
  }
  readonly secretService: MdfeCertificateSecretService
}

export async function resolveEventFiscalConfig(input: {
  readonly companyId: string
  readonly dependencies: MdfeEventInputResolverDependencies
  readonly issuanceAttemptId: string
}): Promise<MdfeFiscalConfig> {
  const persisted = await input.dependencies.payloadRepository.findByAttempt({
    attemptId: input.issuanceAttemptId,
    companyId: input.companyId,
  })
  if (persisted === null) {
    throw new MdfeIssuanceFatalError('mdfe issuance payload not found for attempt')
  }

  return {
    ...parseProviderConfig(persisted.providerConfig),
    ...(await resolveCertificate({
      companyId: input.companyId,
      dependencies: input.dependencies,
    })),
  }
}
