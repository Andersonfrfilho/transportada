/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverFieldReport,
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverOccurrenceTypesState,
  DriverReturnReason,
} from './driverTrip.types'
import type { EventQueueItemView } from './eventQueueView.service'

/**
 * Spec 179 (T301–T303), com o ajuste do usuário de 25/09: "Não entreguei" registra a **ocorrência
 * da nota com foto** e a **devolução**. As duas escritas continuam sendo o que são na API:
 *
 * - a devolução (`/return`, motivo da lista fechada `DRIVER_RETURN_REASONS`) é o que fecha a nota,
 *   a parada e a viagem (`runDocumentOutcome`) — a ocorrência sozinha não muda `separation_status`
 *   (spec 164 RF19), e a parada ficaria aberta para sempre;
 * - a ocorrência (tipo do cadastro da empresa, com a foto) é a prova, e é ela que abre a tratativa
 *   que decide o destino da nota (spec 164).
 *
 * O motivo da devolução não se deduz do tipo: seria comparar nome de tipo, o que a 179 proíbe
 * (`duplicacao.md`). Por isso a tela pergunta os dois.
 */
export const NOT_DELIVERED_FIELDS = ['reason', 'occurrenceType', 'photo', 'note'] as const
export type NotDeliveredField = (typeof NOT_DELIVERED_FIELDS)[number]

/** ⚠️ Cópia por valor de `OCCURRENCE_PHOTO_MAX_BYTES` (`occurrence-attachment.policy.ts`, spec 161). */
export const OCCURRENCE_PHOTO_MAX_BYTES = 512 * 1024

export type NotDeliveredDraft = Readonly<{
  note: string
  occurrenceTypeId: string | undefined
  photo: DriverOccurrencePhoto | undefined
  reason: DriverReturnReason | undefined
}>

export function isOccurrencePhotoWithinLimit(blob: Blob): boolean {
  return blob.size <= OCCURRENCE_PHOTO_MAX_BYTES
}

/**
 * `undefined` quando não há ocorrência onde pendurar a foto: a lista falhou sem cópia guardada, ou a
 * empresa não cadastrou tipo de rua. Aí devolver segue só com o motivo (spec 157 RF5).
 */
export function listAvailableOccurrenceTypes(
  state: DriverOccurrenceTypesState,
): readonly DriverOccurrenceType[] | undefined {
  if (state.status === 'loaded' && state.types.length > 0) return state.types
  return undefined
}

function findSelectedType(input: {
  readonly draft: NotDeliveredDraft
  readonly types: readonly DriverOccurrenceType[]
}): DriverOccurrenceType | undefined {
  return input.types.find((type) => type.id === input.draft.occurrenceTypeId)
}

/**
 * CA04: tudo o que falta, de uma vez, na ordem da tela. A observação só é exigida quando o tipo
 * declara `required` — a mesma regra que o servidor aplica (`TripOccurrenceNoteRequiredError`).
 */
export function listMissingNotDeliveredFields(input: {
  readonly draft: NotDeliveredDraft
  readonly occurrenceTypes: DriverOccurrenceTypesState
}): readonly NotDeliveredField[] {
  const missing: NotDeliveredField[] = []
  if (input.draft.reason === undefined) missing.push('reason')

  if (input.occurrenceTypes.status === 'loading') return [...missing, 'occurrenceType']
  const types = listAvailableOccurrenceTypes(input.occurrenceTypes)
  if (types === undefined) return missing

  const selected = findSelectedType({ draft: input.draft, types })
  if (selected === undefined) missing.push('occurrenceType')
  if (input.draft.photo === undefined) missing.push('photo')
  if (selected?.attachmentMode === 'required' && input.draft.note.trim() === '') {
    missing.push('note')
  }
  return missing
}

export type NotDeliveredStatus = 'queued' | 'rejected' | 'sent'

/**
 * RF5: a tela distingue "na fila" de "enviado" pelo que está gravado — nunca por suposição. Na fila
 * (ou recusada, ainda à vista) é o que a fila diz; "enviado" só quando a drenagem viu o servidor
 * aceitar **esta** chave. Item descartado não vira "enviado": sem as duas provas, nada aparece.
 */
export function resolveNotDeliveredStatus(input: {
  readonly documentId: string
  /** A chave da ocorrência que o toque desta sessão gravou, quando houve. */
  readonly occurrenceKey: string | undefined
  readonly queueView: readonly EventQueueItemView[]
  readonly sentReportKeys: ReadonlySet<string>
}): NotDeliveredStatus | undefined {
  const queued = input.queueView.find(
    (item) =>
      item.kind === 'documentOccurrence' &&
      (item.idempotencyKey === input.occurrenceKey || item.documentId === input.documentId),
  )
  if (queued !== undefined) return queued.status.state === 'rejected' ? 'rejected' : 'queued'
  if (input.occurrenceKey !== undefined && input.sentReportKeys.has(input.occurrenceKey)) {
    return 'sent'
  }
  return undefined
}

/** A chave da ocorrência entre os itens do toque — é ela que a tela acompanha. */
export function findOccurrenceKey(reports: readonly DriverFieldReport[]): string | undefined {
  return reports.find((report) => report.kind === 'documentOccurrence')?.idempotencyKey
}

/**
 * Os itens da fila, no mesmo toque. A ocorrência vai **antes**: rede caída nela para a drenagem, e a
 * devolução espera junto — a nota não fecha sem a prova ter subido. A devolução entra com
 * `location: null`; a posição chega depois pela chave (`applyReportLocation`).
 */
export function buildNotDeliveredReports(input: {
  readonly createIdempotencyKey: () => string
  readonly documentId: string
  readonly draft: NotDeliveredDraft
  readonly occurrenceTypes: DriverOccurrenceTypesState
}): readonly DriverFieldReport[] {
  const { draft } = input
  const missing = listMissingNotDeliveredFields({ draft, occurrenceTypes: input.occurrenceTypes })
  if (missing.length > 0 || draft.reason === undefined) throw new Error('NOT_DELIVERED_INCOMPLETE')

  const returned: DriverFieldReport = {
    documentId: input.documentId,
    idempotencyKey: input.createIdempotencyKey(),
    kind: 'return',
    location: null,
    reason: draft.reason,
  }
  const types = listAvailableOccurrenceTypes(input.occurrenceTypes)
  const selected = types === undefined ? undefined : findSelectedType({ draft, types })
  if (selected === undefined || draft.photo === undefined) return [returned]

  return [
    {
      documentId: input.documentId,
      idempotencyKey: input.createIdempotencyKey(),
      kind: 'documentOccurrence',
      note: draft.note.trim(),
      occurrenceTypeId: selected.id,
      occurrenceTypeName: selected.name,
      photo: draft.photo,
      productCode: '',
    },
    returned,
  ]
}
