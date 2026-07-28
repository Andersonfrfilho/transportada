/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeClosureExecutionInput } from './mdfe-issuance-consumer.effect.js'
import type { MdfeProcessingEnvelopeV1 } from '../../messaging/mdfe-processing-envelope.schema.js'

import {
  resolveEventFiscalConfig,
  type MdfeEventInputResolverDependencies,
} from './mdfe-event-input-resolver.service.js'
import { MdfeIssuanceFatalError } from './mdfe-issuance-worker-message-handler.service.js'

// SEFAZ espera a data de encerramento no fuso de Brasília, não no relógio UTC do worker.
const FISCAL_TIME_ZONE = 'America/Sao_Paulo'

export function createMdfeClosureInputResolver(
  dependencies: MdfeEventInputResolverDependencies,
): (params: {
  readonly envelope: MdfeProcessingEnvelopeV1
}) => Promise<MdfeClosureExecutionInput | null> {
  return async ({ envelope }) => {
    const companyId = envelope.companyId
    const target = await dependencies.eventTargetRepository.findAuthorizedDocument({
      companyId,
      manifestId: envelope.payload.manifestId,
    })
    if (target === null) {
      return null
    }

    if (target.closureCityCode === null || target.closureState === null) {
      throw new MdfeIssuanceFatalError('mdfe closure request is missing city or state')
    }

    return {
      accessKey: target.accessKey,
      authorizationProtocol: target.authorizationProtocol,
      closureCityCode: target.closureCityCode,
      closureDate: formatFiscalDate(envelope.occurredAt),
      closureState: target.closureState,
      config: await resolveEventFiscalConfig({
        companyId,
        dependencies,
        issuanceAttemptId: target.issuanceAttemptId,
      }),
      manifestId: envelope.payload.manifestId,
      tenantId: companyId,
    }
  }
}

function formatFiscalDate(isoInstant: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: FISCAL_TIME_ZONE,
    year: 'numeric',
  }).format(new Date(isoInstant))
}
