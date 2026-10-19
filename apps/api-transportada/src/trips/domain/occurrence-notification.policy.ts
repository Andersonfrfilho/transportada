/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: quais ocorrências viram aviso, e com que parâmetros.
 */
import { NOTIFICATION_TEMPLATE_KEY } from '../../notification/domain/notification-catalog.constant.js'

export type OccurrenceNotificationSetting = {
  readonly notifies: boolean
  readonly type: string
}

/**
 * ⚠️ **Só o que o template declara em `placeholders`.** Acrescentar campo aqui sem acrescentar ao
 * template é carregar dado que ninguém renderiza; o contrário renderiza um buraco no e-mail.
 *
 * ⚠️ **Sem PII**: nada de nome de quem recebeu, telefone ou documento. O aviso atravessa log de
 * terceiro; o detalhe fica na tela, atrás de autenticação.
 */
export type OccurrenceNotificationParameters = {
  /**
   * Spec 156 T7.3 (M4): a nota, por id opaco. Não é marcador de template — entra na chave de
   * deduplicação, para duas notas sem rótulo (sem número de NF-e) não colapsarem num aviso só.
   */
  readonly documentId: string
  readonly documentLabel: string
  readonly occurrenceType: string
  readonly stopLabel: string
  /** Para a tela que o aviso abre. Não é marcador de template — é destino. */
  readonly tripId: string
}

export type OccurrenceNotification = {
  readonly parameters: OccurrenceNotificationParameters
  /**
   * A chave do catálogo, ou a que o tipo selecionou no módulo de notificações — por isso o tipo é
   * `string`, não só o enum do catálogo embarcado.
   */
  readonly templateKey: string
}

/**
 * **O padrão é não avisar.** Tipo sem configuração — ou configurado com a flag desligada — não
 * dispara: um aviso que ninguém pediu vira ruído, e ruído faz o operador ignorar também o que
 * importa. Ligar é decisão da empresa, tipo a tipo.
 */
export function resolveOccurrenceNotification(input: {
  readonly parameters: OccurrenceNotificationParameters
  readonly settings: readonly OccurrenceNotificationSetting[]
  /** A chave que o tipo selecionou no módulo de notificações; ausente, sai o template legado. */
  readonly templateKey?: string
  readonly type: string
}): null | OccurrenceNotification {
  const setting = input.settings.find((candidate) => candidate.type === input.type)
  if (setting === undefined || !setting.notifies) return null

  return {
    parameters: input.parameters,
    templateKey: input.templateKey ?? NOTIFICATION_TEMPLATE_KEY.TRIP_DELIVERY_OCCURRENCE,
  }
}

/**
 * Spec 275 (D1/D3): a ocorrência que o **motorista** registra numa nota avisa sempre — sem olhar `notifies`, que é a
 * escolha do registro do escritório. O template é o mesmo da 079: o do tipo, senão o legado.
 */
export function resolveDriverOccurrenceTemplateKey(emailTemplateKey: null | string): string {
  return emailTemplateKey ?? NOTIFICATION_TEMPLATE_KEY.TRIP_DELIVERY_OCCURRENCE
}

/**
 * Spec 275 (D2): os responsáveis (já a lista efetiva da 267/271) mais quem despachou, sem duplicar. Sem lista, só quem
 * despachou; sem os dois, ninguém.
 */
export function resolveDriverOccurrenceRecipients(input: {
  readonly dispatcherUserId: null | string
  readonly watcherUserIds: readonly string[]
}): readonly string[] {
  return [
    ...new Set([
      ...input.watcherUserIds,
      ...(input.dispatcherUserId === null ? [] : [input.dispatcherUserId]),
    ]),
  ]
}
