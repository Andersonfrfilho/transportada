/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

import type {
  AutomaticManifestApiPort,
  MdfeAutoIssueTrigger,
  TripByBatchItemPort,
} from './mdfe-auto-issue.port.js'

export type CreateMdfeAutoIssueTriggerParams = {
  readonly api: AutomaticManifestApiPort
  readonly logger: WorkerLogger
  readonly trips: TripByBatchItemPort
}

/**
 * **A falha aqui nunca volta para a fila.** O CT-e está autorizado e pago; reentregar a mensagem
 * emitiria o documento fiscal de novo para conseguir uma segunda tentativa de manifesto. Quem
 * recupera o manifesto perdido é o operador, pelo botão que a prontidão já acende.
 */
export function createMdfeAutoIssueTrigger(
  input: CreateMdfeAutoIssueTriggerParams,
): MdfeAutoIssueTrigger {
  return {
    async trigger({ batchItemId, companyId }) {
      try {
        const tripId = await input.trips.findTripId({ batchItemId, companyId })
        if (tripId === null) return

        const outcome = await input.api.issue({ companyId, tripId })
        safeLogInfo({
          logger: input.logger,
          message: 'mdfe_auto_issue_trigger_outcome',
          metadata: { batchItemId, companyId, outcome, tripId },
        })
      } catch (error) {
        safeLogWarn({
          logger: input.logger,
          message: 'mdfe_auto_issue_trigger_failed',
          metadata: {
            batchItemId,
            companyId,
            cause: error instanceof Error ? error.message : 'unknown',
          },
        })
      }
    },
  }
}
