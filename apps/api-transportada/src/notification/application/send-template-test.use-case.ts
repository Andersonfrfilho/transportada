/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NotificationModule } from '@adatechnology/notification-module'

import { NOTIFICATION_CATALOG } from '../domain/notification-catalog.constant.js'
import { NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD } from '../domain/notification-preview.constant.js'
import { UnknownNotificationTemplateError } from '../domain/notification-template.error.js'

type Dependencies = {
  readonly module: Pick<NotificationModule, 'useCases'>
  readonly newDedupeKey: () => string
}

export type SendTemplateTestInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly templateKey: string
}

export type SendTemplateTestResult = {
  readonly notificationId: string
  readonly templateKey: string
}

export type SendTemplateTestUseCase = {
  execute(input: SendTemplateTestInput): Promise<SendTemplateTestResult>
}

/**
 * Prova que a mensagem **chega**, não que ela renderiza — o preview já mostra o texto.
 *
 * ⚠️ A rota **não aceita destinatário**, e essa ausência é a regra de segurança inteira: o envio vai
 * para quem está autenticado, e mais ninguém. Com um campo de destino, uma tela de edição de
 * template viraria um jeito de disparar e-mail com a marca da empresa para qualquer endereço, e a
 * permissão que autoriza escrever texto não é a mesma que autoriza escolher quem recebe.
 *
 * Sai pelo mesmo `sendNotification` das notificações de verdade — inclusive respeitando preferência
 * e supressão de quem pede o teste. Um caminho paralelo provaria a entrega de um caminho que a
 * produção não usa.
 */
export function createSendTemplateTestUseCase({
  module,
  newDedupeKey,
}: Dependencies): SendTemplateTestUseCase {
  return {
    async execute({ context, templateKey }) {
      const entry = NOTIFICATION_CATALOG.find((item) => item.templateKey === templateKey)
      /** Chave fora do catálogo é 404, não envio vazio: ela não tem categoria nem variáveis. */
      if (entry === undefined) throw new UnknownNotificationTemplateError()

      const result = await module.useCases.sendNotification.execute({
        category: entry.category,
        companyId: context.companyId,
        /**
         * Chave nova a cada clique. O módulo devolve a notificação anterior quando a chave repete —
         * e um teste que "funciona" sem enviar nada é pior que um teste que falha.
         */
        dedupeKey: newDedupeKey(),
        payload: NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD,
        recipientUserId: context.userId,
        templateKey,
      })

      return { notificationId: result.notificationId, templateKey }
    },
  }
}
