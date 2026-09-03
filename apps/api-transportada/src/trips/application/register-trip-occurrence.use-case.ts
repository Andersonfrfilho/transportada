/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: registrar o que houve com um item da carga.
 */
import type {
  TripOccurrenceStage,
  TripOccurrenceType,
} from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import { resolveOccurrenceNotification } from '../domain/occurrence-notification.policy.js'
import type {
  OccurrenceNotificationParameters,
  OccurrenceNotificationSetting,
} from '../domain/occurrence-notification.policy.js'

export type TripOccurrence = {
  readonly createdAt: string
  readonly id: string
  readonly note: string
  readonly productCode: string
  readonly stage: TripOccurrenceStage
  readonly type: TripOccurrenceType
}

export type TripOccurrencePort = {
  listOccurrences(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly TripOccurrence[]>
  /** `null` quando a nota não é desta viagem nesta empresa — ausência, nunca escrita às cegas. */
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly productCode: string
    readonly stage: TripOccurrenceStage
    readonly tripId: string
    readonly type: TripOccurrenceType
  }): Promise<null | TripOccurrence>
}

/**
 * O aviso é **efeito de borda do registro**, e falhar nele não desfaz a ocorrência: a ocorrência é
 * o fato, e o aviso é conveniência. Perder o registro porque a fila caiu seria trocar o dado pelo
 * recado.
 */
export type OccurrenceNotifierPort = {
  notify(input: {
    readonly companyId: string
    readonly parameters: OccurrenceNotificationParameters
    readonly templateKey: string
  }): Promise<void>
}

export type RegisterTripOccurrenceInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly documentId: string
  readonly note: string
  /** Ausente quando a instalação não tem trilho de notificação — o registro segue igual. */
  readonly notifier?: OccurrenceNotifierPort
  readonly notificationParameters?: OccurrenceNotificationParameters
  readonly notificationSettings?: readonly OccurrenceNotificationSetting[]
  readonly productCode: string
  readonly repository: TripOccurrencePort
  readonly tripId: string
  readonly type: TripOccurrenceType
}

/**
 * ⚠️ **Só anota.** Não muda `separation_status`, não bloqueia transição, não impede despacho.
 * Misturar o estado da nota com o que houve com ela deixaria o operador sem saída, porque não
 * existe tela de resolução de ocorrência — e a nota ficaria travada num estado que ninguém sabe
 * destravar. Quando essa tela existir, o bloqueio é decisão nova, por escrito.
 *
 * O grupo é **derivado do tipo**, nunca aceito do cliente: aceitá-lo no corpo deixaria quem tem
 * `trip.manage` declarar que uma ocorrência de rua é de galpão para caber na própria permissão.
 */
export async function registerTripOccurrence(
  input: RegisterTripOccurrenceInput,
): Promise<TripOccurrence> {
  const { actorUserId, companyId, documentId, note, productCode, repository, tripId, type } = input
  const stage = resolveOccurrenceStage(type)
  if (stage === null) throw new TripDocumentNotFoundError()

  const saved = await repository.saveOccurrence({
    actorUserId,
    companyId,
    documentId,
    note,
    productCode,
    stage,
    tripId,
    type,
  })
  if (saved === null) throw new TripDocumentNotFoundError()

  await notifyOccurrence(input)

  return saved
}

/**
 * ⚠️ **O aviso nunca derruba o registro.** A ocorrência é o fato; o aviso é conveniência. Uma fila
 * fora do ar não pode fazer o operador perder o que ele acabou de registrar — e ele não teria como
 * saber que perdeu, porque a tela mostraria erro sobre uma escrita que aconteceu.
 *
 * O padrão continua sendo **não avisar**: sem notificador, sem parâmetros ou sem a flag ligada para
 * aquele tipo, nada sai.
 */
async function notifyOccurrence(input: RegisterTripOccurrenceInput): Promise<void> {
  if (input.notifier === undefined || input.notificationParameters === undefined) return

  const notification = resolveOccurrenceNotification({
    parameters: input.notificationParameters,
    settings: input.notificationSettings ?? [],
    type: input.type,
  })
  if (notification === null) return

  try {
    await input.notifier.notify({
      companyId: input.companyId,
      parameters: notification.parameters,
      templateKey: notification.templateKey,
    })
  } catch {
    // Engolido de propósito: ver o comentário acima.
  }
}
