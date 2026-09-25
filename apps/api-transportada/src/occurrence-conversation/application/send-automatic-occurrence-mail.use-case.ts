/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T802 (absorve a 143 T025): o aviso automático à contratante.
 *
 * - A ocorrência de nota registrada com um tipo `emails_contractor` avisa a contratante sozinha, com
 *   o texto do tipo (079), aos contatos ativos que recebem ocorrência **daquela etapa**.
 * - Canal preferido de cada contato: e-mail sai por e-mail. WhatsApp ainda não envia (T002): quem o
 *   prefere e tem e-mail recebe por e-mail (`whatsappFallbackCount`); sem e-mail, não recebe
 *   (`whatsappUnreachableCount`). Nada disso é silencioso — o resultado conta.
 * - Um aviso por ocorrência: a chave de idempotência é dela, então o reprocessamento não duplica.
 * - Sem autor humano (`actorUserId: null`, `automatic`): quem mandou foi o tipo da ocorrência.
 * - Motivo para não enviar é **resultado**; só falha inesperada sobe, e o chamador a registra sem
 *   derrubar o registro da ocorrência. ⚠️ A conversa não decide (D4): nada aqui toca a tratativa.
 */
import type { SendOccurrenceMailUseCase } from './send-occurrence-mail.use-case.js'

export type AutomaticOccurrenceMailRecipient = {
  readonly contactId: string
  readonly email: null | string
  readonly preferredChannel: 'email' | 'whatsapp'
  /** As etapas em que o contato recebe ocorrência (`occurrence_stages`). */
  readonly stages: readonly string[]
}

export type AutomaticOccurrenceMailPlan = {
  readonly emailsContractor: boolean
  readonly recipients: readonly AutomaticOccurrenceMailRecipient[]
  readonly stage: 'delivery' | 'separation'
  /** O texto do tipo (079) já com os valores da nota; `null` quando o tipo não tem assunto. */
  readonly suggested: null | { readonly bodyText: string; readonly subject: string }
}

export type AutomaticOccurrenceMailReaderPort = {
  /** `null`: ocorrência inexistente nesta empresa, de parada ou sem contratante casada. */
  findPlan(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<AutomaticOccurrenceMailPlan | null>
}

export type AutomaticOccurrenceMailResult =
  | {
      readonly outcome: 'sent'
      readonly recipientCount: number
      readonly whatsappFallbackCount: number
      readonly whatsappUnreachableCount: number
    }
  | {
      readonly outcome: 'skipped'
      readonly reason:
        | 'mail_not_ready'
        | 'no_recipient'
        | 'no_template'
        | 'not_document'
        | 'type_off'
    }

/** Configuração de e-mail da empresa que não está pronta: é motivo, não falha (a 150 decide). */
const MAIL_NOT_READY_CODES = new Set([
  'CONTRACTOR_MAIL_NOT_CONFIGURED',
  'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED',
])

export const AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX = 'occurrence-auto-mail:'

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export function createSendAutomaticOccurrenceMailUseCase(dependencies: {
  readonly reader: AutomaticOccurrenceMailReaderPort
  readonly sendMail: Pick<SendOccurrenceMailUseCase, 'send'>
}) {
  return {
    async send(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly occurrenceId: string
    }): Promise<AutomaticOccurrenceMailResult> {
      const plan = await dependencies.reader.findPlan(input)
      if (plan === null) return { outcome: 'skipped', reason: 'not_document' }
      if (!plan.emailsContractor) return { outcome: 'skipped', reason: 'type_off' }
      if (plan.suggested === null) return { outcome: 'skipped', reason: 'no_template' }

      const ofStage = plan.recipients.filter((recipient) => recipient.stages.includes(plan.stage))
      const byEmail = ofStage.filter((recipient) => recipient.email !== null)
      if (byEmail.length === 0) return { outcome: 'skipped', reason: 'no_recipient' }

      try {
        await dependencies.sendMail.send({
          actorUserId: null,
          automatic: true,
          bodyText: plan.suggested.bodyText,
          companyId: input.companyId,
          contactIds: byEmail.map((recipient) => recipient.contactId),
          correlationId: input.correlationId,
          idempotencyKey: `${AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX}${input.occurrenceId}`,
          occurrenceId: input.occurrenceId,
          subject: plan.suggested.subject,
        })
      } catch (error) {
        if (MAIL_NOT_READY_CODES.has(errorCode(error) ?? '')) {
          return { outcome: 'skipped', reason: 'mail_not_ready' }
        }
        throw error
      }
      return {
        outcome: 'sent',
        recipientCount: byEmail.length,
        whatsappFallbackCount: byEmail.filter(
          (recipient) => recipient.preferredChannel === 'whatsapp',
        ).length,
        whatsappUnreachableCount: ofStage.length - byEmail.length,
      }
    },
  }
}
