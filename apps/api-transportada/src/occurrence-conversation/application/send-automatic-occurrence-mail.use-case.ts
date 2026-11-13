/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T802 (absorve a 143 T025): o aviso automático à contratante.
 *
 * - A ocorrência de nota registrada com um tipo `emails_contractor` avisa a contratante sozinha, com
 *   o modelo escolhido no tipo ou na exceção da contratante (269), aos contatos ativos que recebem ocorrência **daquela etapa**.
 * - Canal preferido de cada contato: e-mail sai por e-mail. WhatsApp ainda não envia (T002): quem o
 *   prefere e tem e-mail recebe por e-mail (`whatsappFallbackCount`); sem e-mail, não recebe
 *   (`whatsappUnreachableCount`). Nada disso é silencioso — o resultado conta.
 * - Um aviso por ocorrência: a chave de idempotência é dela, então o reprocessamento não duplica.
 * - Sem autor humano (`actorUserId: null`, `automatic`): quem mandou foi o tipo da ocorrência.
 * - Motivo para não enviar é **resultado**; só falha inesperada sobe, e o chamador a registra sem
 *   derrubar o registro da ocorrência. ⚠️ A conversa não decide (D4): nada aqui toca a tratativa.
 * - Spec 318: a contratante com canal `whatsapp_group` recebe o aviso no grupo, marcando o número, e **nenhum
 *   e-mail**. Falhou (depois das tentativas na hora): com `email_fallback` ligado, sai o e-mail de sempre; o resultado
 *   fica gravado e a varredura do worker tenta o grupo de novo enquanto ele não sair por nenhum canal.
 * - Spec 324 (T1): `sendManual` é o botão "Avisar a contratante". Mesmo plano, mesmo modelo e mesmo canal do
 *   automático, ignorando só o corte `type_off` (D1); a marca da 321 continua vencendo primeiro (RF6). Quem clicou é o
 *   autor do e-mail, e a chave é própria (`occurrence-manual-notice:<id>`, D3): o botão nunca disputa a reserva da
 *   varredura. Um aviso manual por ocorrência; só a falha libera tentar de novo.
 */
import {
  CONTRACTOR_OCCURRENCE_GROUP_ATTEMPTS,
  CONTRACTOR_OCCURRENCE_GROUP_RETRY_DELAYS_MS,
  buildContractorOccurrenceGroupMessage,
  isRetryableGroupFailure,
  type ContractorOccurrenceGroupFailure,
  type ContractorOccurrenceGroupValues,
} from '../domain/contractor-occurrence-group.policy.js'
import { occurrenceTypeNeverNotifiesContractor } from '../../trips/domain/occurrence-contractor-notice.policy.js'
import { resolveOccurrenceRecipients } from '../domain/occurrence-contractor-recipients.policy.js'
import { ContractorReplyWhatsAppSendError } from './forward-contractor-reply-by-whatsapp.port.js'
import type { SendOccurrenceMailUseCase } from './send-occurrence-mail.use-case.js'

export type AutomaticOccurrenceMailRecipient = {
  readonly contactId: string
  readonly email: null | string
  readonly preferredChannel: 'email' | 'whatsapp'
  /** As etapas em que o contato recebe ocorrência (`occurrence_stages`). */
  readonly stages: readonly string[]
}

export type AutomaticOccurrenceMailPlan = {
  /**
   * Spec 321 (D2): o tipo nunca avisa a contratante — nem e-mail, nem grupo da 318. Ausente vale `false` (dublê de
   * teste); a leitura real sempre traz.
   */
  readonly blocksContractorNotice?: boolean
  /** Spec 271 (D13): os destinatários escolhidos no tipo; vazio é o `To` automático da etapa. */
  readonly chosenContactIds: readonly string[]
  readonly emailsContractor: boolean
  /** A ocorrência é anterior ao momento em que o modelo efetivo foi escolhido: o aviso automático não vale. */
  readonly isRegisteredBeforeTemplate: boolean
  readonly recipients: readonly AutomaticOccurrenceMailRecipient[]
  readonly stage: 'delivery' | 'separation'
  /** O texto do modelo efetivo (spec 269) já com os valores da nota; `null` sem modelo efetivo. */
  readonly suggested: null | { readonly bodyText: string; readonly subject: string }
  /** Spec 318: o grupo da contratante, quando o canal dela é `whatsapp_group`; ausente ou `null`, e-mail. */
  readonly groupChannel?: ContractorOccurrenceGroupChannel | null
}

export type ContractorOccurrenceGroupChannel = {
  readonly emailFallback: boolean
  readonly groupJid: string
  /** Só dígitos, com o 55: o número marcado no grupo. */
  readonly mentionPhone: string
}

/**
 * Spec 318: o que o aviso no grupo precisa. A reserva e o resultado ficam gravados (RF3, RF6); o texto vem do módulo
 * de notificação (RF4); o envio é o Evolution da empresa com a marca (RF2), que sobe `ContractorReplyWhatsAppSendError`.
 */
export type ContractorOccurrenceGroupPort = {
  /**
   * Reserva o aviso desta ocorrência. `false`: já saiu (no grupo ou na reserva), ou está saindo agora. `keyPrefix`
   * ausente é a chave do automático (`occurrence-auto-mail:`); o botão da 324 passa a dele.
   */
  claim(input: {
    readonly companyId: string
    readonly keyPrefix?: string
    readonly occurrenceId: string
  }): Promise<boolean>
  /** O modelo do grupo e os valores; `null` sem modelo cadastrado. */
  readMessage(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<null | {
    readonly template: string
    readonly values: ContractorOccurrenceGroupValues
  }>
  record(input: {
    readonly attempts: number
    readonly companyId: string
    readonly failure: ContractorOccurrenceGroupFailure | null
    readonly keyPrefix?: string
    readonly occurrenceId: string
    readonly status: ContractorOccurrenceGroupRecordStatus
  }): Promise<void>
  send(input: {
    readonly body: string
    readonly companyId: string
    readonly groupJid: string
    readonly mentionNumber: string
  }): Promise<unknown>
}

/** `sent`: no grupo; `email_fallback`: o grupo falhou e saiu o e-mail; `failed`: nada saiu (a varredura tenta de novo). */
export type ContractorOccurrenceGroupRecordStatus = 'email_fallback' | 'failed' | 'sent'

export type AutomaticOccurrenceMailReaderPort = {
  /** `null`: ocorrência inexistente nesta empresa, de parada ou sem contratante casada. */
  findPlan(input: {
    readonly companyId: string
    /**
     * Spec 324 (D1): lê contatos, modelo e grupo mesmo com o tipo desligado (`emails_contractor = false`). O plano
     * continua dizendo o `emailsContractor` real; a marca da 321 continua devolvendo o plano bloqueado.
     */
    readonly ignoreTypeOff?: boolean
    readonly occurrenceId: string
  }): Promise<AutomaticOccurrenceMailPlan | null>
}

/**
 * Spec 324 (D3, D8): a reserva do aviso manual, uma por ocorrência e por empresa, e a pergunta "o automático já
 * avisou?". `claim` devolve `false` com um aviso manual já enviado ou saindo agora; `failed` libera de novo.
 */
export type ManualContractorNoticePort = {
  claim(input: { readonly companyId: string; readonly occurrenceId: string }): Promise<boolean>
  /** O aviso automático saiu por algum canal (e-mail, grupo, ou a reserva por e-mail do grupo). */
  isAutomaticNoticeSent(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<boolean>
  /** O aviso manual já chegou à contratante: o automático (a varredura do worker) não repete. */
  isManualNoticeSent(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<boolean>
  /**
   * Fecha a reserva e, na mesma instrução, grava o registro do clique (T2: quem, quando, canal e desfecho) e a trilha
   * de auditoria. `result` nulo: o envio lançou (`failed`) ou a chave do e-mail já tinha saído com outro texto (`sent`).
   */
  record(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly occurrenceId: string
    readonly result: AutomaticOccurrenceMailResult | null
    readonly status: 'failed' | 'sent'
  }): Promise<void>
}

/**
 * Spec 324: o resultado do botão. `blocked` (321) e `already_notified` (o automático já avisou, ou o manual já saiu
 * ou está saindo) viram 409 na rota; `not_document` 404; o resto é o resultado do envio, com o motivo quando não saiu.
 */
export type ManualOccurrenceNoticeResult =
  | AutomaticOccurrenceMailResult
  | { readonly outcome: 'already_notified'; readonly by: 'automatic' | 'manual' }
  | { readonly outcome: 'blocked' }
  | { readonly outcome: 'not_document' }

export type AutomaticOccurrenceMailResult =
  | { readonly attempts: number; readonly outcome: 'sent_to_group' }
  | {
      readonly failure: ContractorOccurrenceGroupFailure
      /** O e-mail de reserva: `null` com a reserva desligada. */
      readonly fallback: AutomaticOccurrenceMailEmailResult | null
      readonly outcome: 'group_failed'
    }
  | AutomaticOccurrenceMailEmailResult
  | { readonly outcome: 'skipped'; readonly reason: 'group_already_sent' }

export type AutomaticOccurrenceMailEmailResult =
  | {
      readonly outcome: 'sent'
      readonly recipientCount: number
      readonly whatsappFallbackCount: number
      readonly whatsappUnreachableCount: number
    }
  | {
      readonly outcome: 'skipped'
      readonly reason:
        | 'contractor_notice_blocked'
        | 'mail_not_ready'
        | 'manual_notice_sent'
        | 'no_recipient'
        | 'no_template_selected'
        | 'not_document'
        | 'registered_before_template'
        | 'type_off'
    }

/** Configuração de e-mail da empresa que não está pronta: é motivo, não falha (a 150 decide). */
const MAIL_NOT_READY_CODES = new Set([
  'CONTRACTOR_MAIL_NOT_CONFIGURED',
  'CONTRACTOR_MAIL_SENDING_NOT_VERIFIED',
])

const OCCURRENCE_MAIL_TEMPLATE_MISSING_CODE = 'OCCURRENCE_MAIL_TEMPLATE_MISSING'

const IDEMPOTENCY_KEY_REUSED_CODE = 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED'

export const AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX = 'occurrence-auto-mail:'

/** Spec 324 (D3): a chave do aviso manual, no e-mail e no grupo; nunca a do automático. */
export const MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX = 'occurrence-manual-notice:'

/** O aviso manual chegou à contratante por algum canal: só aí a reserva fecha; o resto libera tentar de novo. */
export function isManualNoticeDelivered(result: AutomaticOccurrenceMailResult): boolean {
  if (result.outcome === 'sent' || result.outcome === 'sent_to_group') return true
  if (result.outcome === 'group_failed') return result.fallback?.outcome === 'sent'
  return false
}

/** Spec 324 T2: por onde o aviso manual foi (ou tentou ir); `null` quando nada chegou a ser tentado. */
export type ManualNoticeChannel = 'email' | 'email_fallback' | 'whatsapp_group'

/**
 * Spec 324 T2: o canal e o motivo que o registro do aviso manual guarda. Sem resultado, o envio lançou antes de dizer
 * por onde (`failed`) ou a chave do e-mail já tinha saído (`sent`, só o e-mail recusa chave reusada).
 */
export function describeManualNoticeAttempt(input: {
  readonly result: AutomaticOccurrenceMailResult | null
  readonly status: 'failed' | 'sent'
}): { readonly channel: ManualNoticeChannel | null; readonly reason: null | string } {
  const { result } = input
  if (result === null) return { channel: input.status === 'sent' ? 'email' : null, reason: null }
  switch (result.outcome) {
    case 'sent':
      return { channel: 'email', reason: null }
    case 'sent_to_group':
      return { channel: 'whatsapp_group', reason: null }
    case 'group_failed':
      return {
        channel: result.fallback?.outcome === 'sent' ? 'email_fallback' : 'whatsapp_group',
        reason: result.failure,
      }
    case 'skipped':
      return { channel: null, reason: result.reason }
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function groupFailureOf(error: unknown): ContractorOccurrenceGroupFailure {
  if (!(error instanceof ContractorReplyWhatsAppSendError)) return 'failed'
  if (error.failure === 'number_not_found') return 'group_not_found'
  return error.failure
}

type SendInput = {
  readonly companyId: string
  readonly correlationId: string
  readonly occurrenceId: string
}

/**
 * Quem manda: o automático (sem autor, chave `occurrence-auto-mail:`) ou o botão da 324 (o operador, chave própria).
 * O manual não olha o carimbo da escolha do modelo: o carimbo protege só o disparo sozinho.
 */
type Sender =
  | { readonly kind: 'automatic' }
  | { readonly actorUserId: string; readonly kind: 'manual' }

const AUTOMATIC_SENDER: Sender = { kind: 'automatic' }

function keyPrefixOf(sender: Sender): string {
  return sender.kind === 'manual'
    ? MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX
    : AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX
}

export function createSendAutomaticOccurrenceMailUseCase(dependencies: {
  /** Spec 318: sem a porta, a contratante com grupo segue por e-mail (composição antiga, testes). */
  readonly group?: ContractorOccurrenceGroupPort
  /** Spec 324: sem a porta, `sendManual` não existe para a composição (o botão responde 503). */
  readonly manualNotice?: ManualContractorNoticePort
  readonly reader: AutomaticOccurrenceMailReaderPort
  readonly sendMail: Pick<SendOccurrenceMailUseCase, 'send'>
  /** Espera entre as tentativas no grupo; injetável para o teste não dormir. */
  readonly sleep?: (milliseconds: number) => Promise<void>
}) {
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))

  /** Tenta o grupo até `CONTRACTOR_OCCURRENCE_GROUP_ATTEMPTS` vezes; só a falha passageira repete. */
  async function postToGroup(
    group: ContractorOccurrenceGroupPort,
    channel: ContractorOccurrenceGroupChannel,
    input: SendInput,
  ): Promise<{
    readonly attempts: number
    readonly failure: ContractorOccurrenceGroupFailure | null
  }> {
    const message = await group.readMessage(input)
    if (message === null) return { attempts: 0, failure: 'template_missing' }
    const body = buildContractorOccurrenceGroupMessage({
      mentionPhone: channel.mentionPhone,
      template: message.template,
      values: message.values,
    })
    let attempts = 0
    for (;;) {
      attempts += 1
      try {
        await group.send({
          body,
          companyId: input.companyId,
          groupJid: channel.groupJid,
          mentionNumber: channel.mentionPhone,
        })
        return { attempts, failure: null }
      } catch (error) {
        const failure = groupFailureOf(error)
        if (!isRetryableGroupFailure(failure) || attempts >= CONTRACTOR_OCCURRENCE_GROUP_ATTEMPTS) {
          return { attempts, failure }
        }
        await sleep(CONTRACTOR_OCCURRENCE_GROUP_RETRY_DELAYS_MS[attempts - 1] ?? 0)
      }
    }
  }

  async function sendThroughGroup(
    group: ContractorOccurrenceGroupPort,
    plan: AutomaticOccurrenceMailPlan,
    channel: ContractorOccurrenceGroupChannel,
    sendInput: SendInput,
    sender: Sender,
  ): Promise<AutomaticOccurrenceMailResult> {
    /** Spec 324 (D3): o botão reserva e grava na chave dele; o automático segue sem `keyPrefix`, como sempre. */
    const input =
      sender.kind === 'manual'
        ? { ...sendInput, keyPrefix: MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX }
        : sendInput
    if (!(await group.claim(input))) return { outcome: 'skipped', reason: 'group_already_sent' }
    let posted: Awaited<ReturnType<typeof postToGroup>>
    try {
      posted = await postToGroup(group, channel, input)
    } catch (error) {
      // Falha inesperada antes do envio (leitura do modelo): solta a reserva para a varredura tentar de novo.
      await group.record({ ...input, attempts: 0, failure: 'failed', status: 'failed' })
      throw error
    }
    if (posted.failure === null) {
      await group.record({ ...input, attempts: posted.attempts, failure: null, status: 'sent' })
      return { attempts: posted.attempts, outcome: 'sent_to_group' }
    }
    if (!channel.emailFallback) {
      await group.record({
        ...input,
        attempts: posted.attempts,
        failure: posted.failure,
        status: 'failed',
      })
      return { failure: posted.failure, fallback: null, outcome: 'group_failed' }
    }
    let fallback: AutomaticOccurrenceMailEmailResult
    try {
      fallback = await sendByEmail(plan, sendInput, sender)
    } catch (error) {
      await group.record({
        ...input,
        attempts: posted.attempts,
        failure: posted.failure,
        status: 'failed',
      })
      throw error
    }
    await group.record({
      ...input,
      attempts: posted.attempts,
      failure: posted.failure,
      status: fallback.outcome === 'sent' ? 'email_fallback' : 'failed',
    })
    return { failure: posted.failure, fallback, outcome: 'group_failed' }
  }

  async function sendByEmail(
    plan: AutomaticOccurrenceMailPlan,
    input: SendInput,
    sender: Sender,
  ): Promise<AutomaticOccurrenceMailEmailResult> {
    if (plan.suggested === null) return { outcome: 'skipped', reason: 'no_template_selected' }
    if (sender.kind === 'automatic' && plan.isRegisteredBeforeTemplate) {
      return { outcome: 'skipped', reason: 'registered_before_template' }
    }

    const resolved = resolveOccurrenceRecipients({
      chosenContactIds: plan.chosenContactIds,
      contacts: plan.recipients.map((recipient) => ({
        email: recipient.email,
        id: recipient.contactId,
        occurrenceStages: recipient.stages,
      })),
      stage: plan.stage,
    })
    const resolvedIds = new Set(resolved.contactIds)
    const ofStage = plan.recipients.filter((recipient) => resolvedIds.has(recipient.contactId))
    const byEmail = ofStage.filter((recipient) => recipient.email !== null)
    if (byEmail.length === 0) return { outcome: 'skipped', reason: 'no_recipient' }

    try {
      await dependencies.sendMail.send({
        ...(sender.kind === 'manual'
          ? { actorUserId: sender.actorUserId, automatic: false }
          : { actorUserId: null, automatic: true }),
        bodyText: plan.suggested.bodyText,
        companyId: input.companyId,
        contactIds: byEmail.map((recipient) => recipient.contactId),
        correlationId: input.correlationId,
        idempotencyKey: `${keyPrefixOf(sender)}${input.occurrenceId}`,
        occurrenceId: input.occurrenceId,
        subject: plan.suggested.subject,
      })
    } catch (error) {
      if (MAIL_NOT_READY_CODES.has(errorCode(error) ?? '')) {
        return { outcome: 'skipped', reason: 'mail_not_ready' }
      }
      /** Corrida: o modelo deixou de valer entre o plano e o envio — é motivo, não falha. */
      if (errorCode(error) === OCCURRENCE_MAIL_TEMPLATE_MISSING_CODE) {
        return { outcome: 'skipped', reason: 'no_template_selected' }
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
  }

  return {
    async send(input: SendInput): Promise<AutomaticOccurrenceMailResult> {
      const plan = await dependencies.reader.findPlan(input)
      if (plan === null) return { outcome: 'skipped', reason: 'not_document' }
      /** Spec 321 (D2): antes de qualquer canal, inclusive o grupo — a marca vence `emails_contractor`. */
      if (occurrenceTypeNeverNotifiesContractor(plan)) {
        return { outcome: 'skipped', reason: 'contractor_notice_blocked' }
      }
      if (!plan.emailsContractor) return { outcome: 'skipped', reason: 'type_off' }
      /** Spec 324 (D8): o automático falhou, o escritório avisou pelo botão; a varredura não manda de novo. */
      if (
        dependencies.manualNotice !== undefined &&
        (await dependencies.manualNotice.isManualNoticeSent(input))
      ) {
        return { outcome: 'skipped', reason: 'manual_notice_sent' }
      }
      const channel = plan.groupChannel ?? null
      if (channel !== null && dependencies.group !== undefined) {
        return sendThroughGroup(dependencies.group, plan, channel, input, AUTOMATIC_SENDER)
      }
      return sendByEmail(plan, input, AUTOMATIC_SENDER)
    },

    /**
     * Spec 324: o botão "Avisar a contratante". Ordem: plano (sem o corte `type_off`) → marca da 321 → o automático
     * já avisou (D8) → reserva do manual (D3) → o mesmo canal do automático (D2). Qualquer saída que não chegou à
     * contratante grava `failed` e libera o próximo clique; exceção também.
     */
    async sendManual(
      input: SendInput & { readonly actorUserId: string },
    ): Promise<ManualOccurrenceNoticeResult> {
      const manualNotice = dependencies.manualNotice
      if (manualNotice === undefined) throw new Error('Manual contractor notice is not configured')
      const sendInput: SendInput = {
        companyId: input.companyId,
        correlationId: input.correlationId,
        occurrenceId: input.occurrenceId,
      }
      const plan = await dependencies.reader.findPlan({
        companyId: input.companyId,
        ignoreTypeOff: true,
        occurrenceId: input.occurrenceId,
      })
      if (plan === null) return { outcome: 'not_document' }
      if (occurrenceTypeNeverNotifiesContractor(plan)) return { outcome: 'blocked' }
      if (plan.emailsContractor && (await manualNotice.isAutomaticNoticeSent(sendInput))) {
        return { by: 'automatic', outcome: 'already_notified' }
      }
      if (!(await manualNotice.claim(sendInput))) {
        return { by: 'manual', outcome: 'already_notified' }
      }
      const sender: Sender = { actorUserId: input.actorUserId, kind: 'manual' }
      const channel = plan.groupChannel ?? null
      let result: AutomaticOccurrenceMailResult
      try {
        result =
          channel !== null && dependencies.group !== undefined
            ? await sendThroughGroup(dependencies.group, plan, channel, sendInput, sender)
            : await sendByEmail(plan, sendInput, sender)
      } catch (error) {
        /**
         * A chave manual já tem um e-mail com outro texto (o modelo mudou depois de um envio que a reserva não
         * fechou, ex.: o processo caiu): o aviso já saiu. Fecha a reserva em vez de prometer um reenvio que a chave
         * recusa para sempre.
         */
        if (errorCode(error) === IDEMPOTENCY_KEY_REUSED_CODE) {
          await manualNotice.record({
            ...sendInput,
            actorUserId: input.actorUserId,
            result: null,
            status: 'sent',
          })
          return { by: 'manual', outcome: 'already_notified' }
        }
        await manualNotice.record({
          ...sendInput,
          actorUserId: input.actorUserId,
          result: null,
          status: 'failed',
        })
        throw error
      }
      await manualNotice.record({
        ...sendInput,
        actorUserId: input.actorUserId,
        result,
        status: isManualNoticeDelivered(result) ? 'sent' : 'failed',
      })
      return result
    },
  }
}
