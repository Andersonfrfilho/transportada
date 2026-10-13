/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF13/RF6: ler o retorno da contratante de uma ocorrência e marcá-lo como tratado. Ocorrência
 * de outra empresa e inexistente respondem igual (404).
 */
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { ContractorReplyNotHandleableError } from '../domain/occurrence-conversation.error.js'
import type {
  ContractorReplyHandledPort,
  ContractorReplyReaderPort,
  ContractorReplyView,
} from './contractor-reply-view.port.js'

export function createReadContractorReplyUseCase(dependencies: {
  readonly reader: ContractorReplyReaderPort
}) {
  return {
    async read(input: {
      readonly companyId: string
      readonly occurrenceId: string
    }): Promise<ContractorReplyView | null> {
      const view = await dependencies.reader.findByOccurrence(input)
      if (view === undefined) throw new TripOccurrenceNotFoundError()
      return view
    },
  }
}

export function createMarkContractorReplyHandledUseCase(dependencies: {
  readonly clock: () => Date
  readonly writer: ContractorReplyHandledPort
}) {
  return {
    async markHandled(input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly note: string
      readonly occurrenceId: string
    }): Promise<{ readonly kind: 'already_handled' | 'handled' }> {
      const outcome = await dependencies.writer.markHandled({
        ...input,
        now: dependencies.clock(),
      })
      if (outcome === undefined) throw new TripOccurrenceNotFoundError()
      if (outcome === 'not_applicable') throw new ContractorReplyNotHandleableError()
      return { kind: outcome }
    },
  }
}
