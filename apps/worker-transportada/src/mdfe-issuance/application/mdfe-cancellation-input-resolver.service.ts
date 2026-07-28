/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeCancellationExecutionInput } from './mdfe-issuance-consumer.effect.js'
import type { MdfeProcessingEnvelopeV1 } from '../../messaging/mdfe-processing-envelope.schema.js'

import {
  resolveEventFiscalConfig,
  type MdfeEventInputResolverDependencies,
} from './mdfe-event-input-resolver.service.js'
import { MdfeIssuanceFatalError } from './mdfe-issuance-worker-message-handler.service.js'

const MINIMUM_JUSTIFICATION_LENGTH = 15

export function createMdfeCancellationInputResolver(
  dependencies: MdfeEventInputResolverDependencies,
): (params: {
  readonly envelope: MdfeProcessingEnvelopeV1
}) => Promise<MdfeCancellationExecutionInput | null> {
  return async ({ envelope }) => {
    const companyId = envelope.companyId
    const target = await dependencies.eventTargetRepository.findAuthorizedDocument({
      companyId,
      manifestId: envelope.payload.manifestId,
    })
    if (target === null) {
      return null
    }

    const justification = target.cancellationJustification?.trim() ?? ''
    if (justification.length < MINIMUM_JUSTIFICATION_LENGTH) {
      throw new MdfeIssuanceFatalError('mdfe cancellation justification is too short')
    }

    return {
      accessKey: target.accessKey,
      authorizationProtocol: target.authorizationProtocol,
      config: await resolveEventFiscalConfig({
        companyId,
        dependencies,
        issuanceAttemptId: target.issuanceAttemptId,
      }),
      justification,
      manifestId: envelope.payload.manifestId,
      tenantId: companyId,
    }
  }
}
