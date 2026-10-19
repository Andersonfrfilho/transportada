/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T3.7 (D2): o chat da contratante envia por e-mail; o portal é vitrine da mesma mensagem. Depois do
 * commit, o aviso sem corpo da ADR-0073 vai só às contas do portal que **não** estão em `To`/`Cc` (quem já
 * recebeu o e-mail não ganha um segundo). Sem público no portal, ou sem ninguém de fora do e-mail: sem aviso —
 * nunca `OccurrenceConversationPortalUnavailableError`, que é do envio pelo canal Portal.
 */
import type {
  ContractorPortalChatAudienceReaderPort,
  ContractorPortalNotifierPort,
} from './contractor-portal-message.port.js'

/** Quem recebe o aviso: as contas cujo e-mail (minúsculas) não está entre os endereços do envio. */
export function selectPortalChatNoticeRecipients(
  users: readonly { readonly email: string; readonly userId: string }[],
  mailAddresses: readonly string[],
): string[] {
  const mailed = new Set(mailAddresses.map((address) => address.trim().toLowerCase()))
  return users.filter((user) => user.email === '' || !mailed.has(user.email)).map((u) => u.userId)
}

export function createContractorPortalChatNotice(dependencies: {
  readonly audienceReader: ContractorPortalChatAudienceReaderPort
  readonly notifier: ContractorPortalNotifierPort
}) {
  return {
    async notify(input: {
      readonly companyId: string
      /** `To` e `Cc` do e-mail enviado. */
      readonly mailAddresses: readonly string[]
      readonly messageId: string
      readonly occurrenceId: string
    }): Promise<void> {
      const audience = await dependencies.audienceReader.find({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
      if (audience === null) return
      const recipientUserIds = selectPortalChatNoticeRecipients(audience.users, input.mailAddresses)
      if (recipientUserIds.length === 0) return
      await dependencies.notifier.notify({
        companyId: input.companyId,
        messageId: input.messageId,
        occurrenceLabel: audience.occurrenceLabel,
        recipientUserIds,
      })
    },
  }
}
