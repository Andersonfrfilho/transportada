import type { TripDocumentDetail } from './trip.types'

export type BatchTransitionAction = 'load' | 'separate'

/** A mesma regra da linha da nota em `TripStopList`: separa o pendente, carrega o separado. */
const SOURCE_STATUS_BY_ACTION = {
  load: 'separated',
  separate: 'pending',
} as const satisfies Record<BatchTransitionAction, TripDocumentDetail['separationStatus']>

export type SelectBatchTransitionInput = Readonly<{
  action: BatchTransitionAction
  documents: readonly Pick<TripDocumentDetail, 'id' | 'separationStatus'>[]
  selectedIds: ReadonlySet<string>
}>

/** O que da seleção ainda aceita a ação — o resto não é oferecido nem enviado no lote. */
export function selectBatchTransitionDocumentIds(
  input: SelectBatchTransitionInput,
): readonly string[] {
  const sourceStatus = SOURCE_STATUS_BY_ACTION[input.action]
  return input.documents
    .filter(
      (document) =>
        input.selectedIds.has(document.id) && document.separationStatus === sourceStatus,
    )
    .map((document) => document.id)
}
