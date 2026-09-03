/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: registrar o que houve com um item da carga.
 */
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import { resolveOccurrenceProductScope } from '../domain/occurrence-scope.policy.js'
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
  readonly occurrenceTypeId: string
  /** Vazio é a nota inteira — ver `occurrence-scope.policy.ts`. */
  readonly productCode: string
  readonly stage: TripOccurrenceStage
  /** O nome que a empresa deu ao tipo: é ele que a tela imprime, não um id. */
  readonly typeName: string
}

/** O tipo cadastrado, como o caso de uso precisa vê-lo para decidir. */
export type OccurrenceTypeRecord = {
  readonly active: boolean
  /** Vazio é tipo que não gera e-mail: nem toda ocorrência precisa avisar o embarcador. */
  readonly emailBody: string
  readonly emailSubject: string
  readonly id: string
  readonly name: string
  readonly notifies: boolean
  readonly stage: TripOccurrenceStage
}

export type TripOccurrencePort = {
  listOccurrences(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly TripOccurrence[]>
  /** `null` quando a nota não é desta viagem nesta empresa — ausência, nunca escrita às cegas. */
  /** `null` quando o tipo não é desta empresa, ou foi aposentado. */
  findOccurrenceType(input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }): Promise<null | OccurrenceTypeRecord>
  listDocumentProducts(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly { readonly code: string; readonly description: string }[]>
  saveOccurrence(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
    readonly stage: TripOccurrenceStage
    readonly tripId: string
    readonly typeName: string
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
  readonly occurrenceTypeId: string
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
  const { actorUserId, companyId, documentId, note, productCode, repository, tripId } = input

  /**
   * ⚠️ **O tipo é conferido contra o cadastro da empresa**, e não contra uma lista em código. Tipo
   * de outra empresa e tipo aposentado respondem igual — inalcançável —, porque distinguir os dois
   * diria a quem tenta se aquele identificador existe em algum lugar.
   */
  const occurrenceType = await repository.findOccurrenceType({
    companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })
  if (occurrenceType === null || !occurrenceType.active) throw new TripDocumentNotFoundError()

  /**
   * ⚠️ Produto fora da nota é **recusado**, nunca convertido em "nota inteira": apontar para item
   * que a nota não tem é engano de quem registrou, e silenciá-lo gravaria ocorrência sobre carga
   * que nunca esteve ali.
   */
  const scope = resolveOccurrenceProductScope({
    productCode,
    products: await repository.listDocumentProducts({ companyId, documentId, tripId }),
  })
  if (scope === null) throw new TripDocumentNotFoundError()

  const saved = await repository.saveOccurrence({
    actorUserId,
    companyId,
    documentId,
    note,
    occurrenceTypeId: occurrenceType.id,
    productCode: scope.productCode,
    stage: occurrenceType.stage,
    tripId,
    typeName: occurrenceType.name,
  })
  if (saved === null) throw new TripDocumentNotFoundError()

  await notifyOccurrence(input, occurrenceType)

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
async function notifyOccurrence(
  input: RegisterTripOccurrenceInput,
  occurrenceType: OccurrenceTypeRecord,
): Promise<void> {
  if (input.notifier === undefined || input.notificationParameters === undefined) return

  /**
   * A flag mora **no próprio tipo** desde 2026-09-03: eram a mesma decisão chaveada pelo mesmo
   * valor, e a tabela ao lado obrigava a tela a casar duas listas para mostrar uma.
   */
  const notification = resolveOccurrenceNotification({
    parameters: { ...input.notificationParameters, occurrenceType: occurrenceType.name },
    settings: [{ notifies: occurrenceType.notifies, type: occurrenceType.id }],
    type: occurrenceType.id,
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
