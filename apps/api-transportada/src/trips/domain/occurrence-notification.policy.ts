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
