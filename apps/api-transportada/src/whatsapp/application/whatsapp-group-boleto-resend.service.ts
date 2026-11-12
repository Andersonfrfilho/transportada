/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7 (pedido do Anderson em 04/11): **"pedir boleto de novo" no grupo.** Quando o boleto não chega (ou o que
 * chegou não serviu), o motorista marca o bot e pede de novo; o pedido volta à contratante na mesma conversa de e-mail,
 * pelo mesmo caso de uso do botão "Reenviar o pedido" do painel (spec 248 RF6), com as mesmas travas (só retorno que
 * espera a contratante, uma vez por intervalo de alerta).
 *
 * Só vale para ocorrência aberta por pedido **deste grupo**: a nota do texto escolhe entre elas; sem número e com uma
 * só aguardando, é ela. Nada de cliente nem valor no texto do grupo.
 */
import { normalizeDriverCommandText } from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'

export type GroupBoletoPendingRequest = {
  readonly documentNumber: string
  readonly occurrenceId: string
}

export type GroupBoletoResendResult = 'failed' | 'not_resendable' | 'sent'

export type GroupBoletoResendPorts = {
  /** As ocorrências abertas por pedidos deste grupo cujo retorno ainda espera a contratante (ou não serviu). */
  listPending(input: {
    readonly companyId: string
    readonly groupJid: string
  }): Promise<readonly GroupBoletoPendingRequest[]>
  resend(input: {
    readonly companyId: string
    readonly driverId: string
    /** Por pedido do grupo: a mesma mensagem reentregue não reenvia duas vezes. */
    readonly idempotencyKey: string
    readonly occurrenceId: string
  }): Promise<GroupBoletoResendResult>
}

export const GROUP_BOLETO_RESEND_TEXT = {
  askDocument: (pending: readonly GroupBoletoPendingRequest[]) =>
    [
      '📄 *Qual nota?*',
      'Me marque e escreva *pedir boleto de novo* com o número:',
      '',
      ...pending.map((request) => `• NF \`${request.documentNumber}\``),
    ].join('\n'),
  failed: (documentNumber: string) =>
    [
      `⚠️ *Não consegui pedir de novo o boleto da NF \`${documentNumber}\` agora.*`,
      'Tente daqui a pouco ou fale com o escritório.',
    ].join('\n'),
  none: (documentNumber: null | string) =>
    documentNumber === null
      ? '🔎 *Não achei pedido de boleto aguardando a contratante neste grupo.*'
      : `🔎 *Não achei pedido de boleto aguardando a contratante para a NF \`${documentNumber}\` neste grupo.*`,
  notResendable: (documentNumber: string) =>
    [
      `⏳ *O pedido do boleto da NF \`${documentNumber}\` já foi reenviado há pouco.*`,
      'Ou ele não está mais aguardando a contratante. O escritório acompanha.',
    ].join('\n'),
  sent: (documentNumber: string) =>
    [
      `📨 *Pedi de novo o boleto da NF \`${documentNumber}\`.*`,
      'Assim que a contratante responder, ele vem para cá.',
    ].join('\n'),
} as const

/**
 * "pedir boleto de novo 899884", "boleto de novo", "reenviar boleto", "cobrar o boleto": a palavra boleto com um pedido
 * de repetir. `null` quando não é este comando; senão o número da nota, se veio.
 */
export function interpretGroupBoletoResend(
  text: string,
): null | { readonly documentNumber: null | string } {
  const normalized = normalizeDriverCommandText(text)
  if (!/\bboletos?\b/u.test(normalized)) return null
  if (!/\b(de novo|novamente|outra vez|reenvi\w*|cobra\w*)\b/u.test(normalized)) return null
  const digits = normalized.match(/\b\d{3,}\b/u)?.[0]
  return { documentNumber: digits === undefined ? null : digits.replace(/^0+/u, '') }
}

const sameNumber = (left: string, right: string) =>
  left.replace(/\D/gu, '').replace(/^0+/u, '') === right.replace(/\D/gu, '').replace(/^0+/u, '')

export function createGroupBoletoResend(ports: GroupBoletoResendPorts) {
  return {
    interpret: interpretGroupBoletoResend,

    async run(turn: GroupFlowTurn, documentNumber: null | string): Promise<GroupFlowOutcome> {
      const pending = await ports.listPending({
        companyId: turn.request.companyId,
        groupJid: turn.request.groupJid,
      })
      const matching =
        documentNumber === null
          ? pending
          : pending.filter((request) => sameNumber(request.documentNumber, documentNumber))
      if (matching.length === 0) {
        return { kind: 'done', replies: [GROUP_BOLETO_RESEND_TEXT.none(documentNumber)] }
      }
      const [target] = matching
      if (matching.length > 1 || target === undefined) {
        return { kind: 'done', replies: [GROUP_BOLETO_RESEND_TEXT.askDocument(matching)] }
      }
      const result = await ports.resend({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
        idempotencyKey: `whatsapp-group-boleto-resend:${turn.request.id}`,
        occurrenceId: target.occurrenceId,
      })
      const reply =
        result === 'sent'
          ? GROUP_BOLETO_RESEND_TEXT.sent(target.documentNumber)
          : result === 'not_resendable'
            ? GROUP_BOLETO_RESEND_TEXT.notResendable(target.documentNumber)
            : GROUP_BOLETO_RESEND_TEXT.failed(target.documentNumber)
      return { kind: 'done', replies: [reply] }
    },
  }
}

export type GroupBoletoResend = ReturnType<typeof createGroupBoletoResend>
