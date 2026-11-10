/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320: o relato velho do app do motorista fica retido para o escritório decidir. A decisão do dia é da
 * política pura (`field-report-hold.policy.ts`); aqui mora a orquestração e as portas.
 *
 * Só a ocorrência do motorista é retida (decisão do Anderson, 10/11/2026). Retido **não é recusado**: o app recebe
 * `202` e tira o item da fila, porque recusa de negócio faria o motorista descartar e erro de rede faria reenviar para
 * sempre.
 */
import { resolveFieldReportHold } from '../domain/field-report-hold.policy.js'

export const DRIVER_OCCURRENCE_HOLD_OPERATION = 'document.occurrence'

export type FieldReportHoldRecordInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly occurredAt: Date
  readonly operation: string
  /** O corpo já validado pela rota, em dados simples: é o que "Liberar" reaplica. */
  readonly payload: Readonly<Record<string, unknown>>
  readonly probableDuplicateOf: null | string
  readonly receivedAt: Date
  readonly tappedAt: Date
  readonly tripDocumentId: string
}

export type FieldReportHoldPort = {
  /** O mesmo fato já registrado entre o toque e o recebimento, por qualquer canal. `null` quando não há. */
  findProbableDuplicate(input: {
    readonly companyId: string
    readonly documentId: string
    readonly occurrenceTypeId: string
    readonly since: Date
  }): Promise<null | string>
  isEnabled(companyId: string): Promise<boolean>
  /** A chave já liquidou um registro: o reenvio devolve o mesmo resultado, nunca é retido. */
  isKeyRegistered(input: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<boolean>
  /** Idempotente pela chave: o reenvio da mesma chave devolve a linha que já existe. */
  record(input: FieldReportHoldRecordInput): Promise<{ readonly id: string }>
}

export type HoldableOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly idempotencyKey: string
  readonly occurrenceTypeId: string
}

export type HoldOrRegisterResult<TOccurrence> =
  | { readonly kind: 'held'; readonly id: string }
  | { readonly kind: 'registered'; readonly occurrence: TOccurrence }

export async function holdOrRegisterDriverOccurrence<
  TInput extends HoldableOccurrenceInput,
  TOccurrence,
>(params: {
  readonly clockOffsetMs?: number | undefined
  readonly hold?: FieldReportHoldPort | undefined
  readonly input: TInput
  readonly now: Date
  readonly register: (input: TInput) => Promise<TOccurrence>
  readonly tappedAt?: Date | undefined
}): Promise<HoldOrRegisterResult<TOccurrence>> {
  const { hold, input } = params
  const registerNow = async (): Promise<HoldOrRegisterResult<TOccurrence>> => ({
    kind: 'registered',
    occurrence: await params.register(input),
  })
  if (hold === undefined || params.tappedAt === undefined) return registerNow()
  if (!(await hold.isEnabled(input.companyId))) return registerNow()

  const decision = resolveFieldReportHold({
    clockOffsetMs: params.clockOffsetMs,
    receivedAt: params.now,
    tappedAt: params.tappedAt,
  })
  if (!decision.hold) return registerNow()
  if (
    await hold.isKeyRegistered({ companyId: input.companyId, idempotencyKey: input.idempotencyKey })
  ) {
    return registerNow()
  }

  const probableDuplicateOf = await hold.findProbableDuplicate({
    companyId: input.companyId,
    documentId: input.documentId,
    occurrenceTypeId: input.occurrenceTypeId,
    since: decision.occurredAt,
  })
  const held = await hold.record({
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    occurredAt: decision.occurredAt,
    operation: DRIVER_OCCURRENCE_HOLD_OPERATION,
    payload: JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
    probableDuplicateOf,
    receivedAt: params.now,
    tappedAt: params.tappedAt,
    tripDocumentId: input.documentId,
  })

  return { id: held.id, kind: 'held' }
}
