/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T013 — o que o bot responde ao ✅ Confirmar. A emissão é assíncrona (D6.3): a resposta
 * imediata diz que foi enviado e o que já falhou na criação; o resultado da SEFAZ e da prefeitura
 * chega depois, pela liquidação (T014). Nenhuma mensagem nomeia permissão nem código cru.
 */
import type { FlowActionResult } from '@adatechnology/meta-whatsapp-contracts'

import {
  ISSUANCE_BLOCK_REASON_LABELS,
  ISSUANCE_UNKNOWN_REASON_LABEL,
} from '../domain/whatsapp-issuance-labels.constant.js'
import { WhatsAppCommandDeniedError } from '../domain/whatsapp-command.error.js'
import {
  ISSUANCE_BACK_ANSWER,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_FLOW_NODE,
} from '../domain/whatsapp-issuance-flow.constant.js'
import { WHATSAPP_LIST_BUTTON_TEXT } from '../domain/whatsapp-menu.constant.js'
import type {
  ConfirmDocumentSelectionOutcome,
  SupersededPreview,
} from './confirm-document-selection.use-case.js'
import { clearSelectionContext } from './issuance-flow-context.service.js'
import { sendConfirmationList, sendVolumetryMessages } from './issuance-flow-prompt.service.js'
import type { IssuanceStepFailure } from './issuance-journal.service.js'
import type { WhatsAppAuthorizedActionInput } from './with-authorized-actor.service.js'

export const ISSUANCE_DISPATCHED_MESSAGE =
  'Enviado. Aviso quando a SEFAZ e a prefeitura responderem.'
export const ISSUANCE_NOTHING_DISPATCHED_MESSAGE = 'Nenhum documento saiu.'
export const ISSUANCE_FORBIDDEN_MESSAGE =
  'Seu acesso não permite emitir todos os documentos desta prévia. Fale com o administrador.'
export const ISSUANCE_IN_PROGRESS_MESSAGE =
  'Este pedido já está sendo enviado. Aviso quando a SEFAZ e a prefeitura responderem.'
export const ISSUANCE_ALREADY_DISPATCHED_MESSAGE = 'Este pedido já foi enviado.'
export const ISSUANCE_NOT_FOUND_MESSAGE = 'Esse pedido não vale mais. Refaça a seleção.'
export const ISSUANCE_EXPIRED_MESSAGE = 'Prévia expirada.'
export const ISSUANCE_SUPERSEDED_MESSAGE =
  'As notas mudaram desde a prévia, e nada foi emitido. Confira de novo:'

const TO_MENU: FlowActionResult = { context: clearSelectionContext(), next: 'menu' }
const TO_CRITERION: FlowActionResult = {
  context: clearSelectionContext(),
  next: ISSUANCE_FLOW_NODE.criterionMenu,
}

export async function replyToConfirmation(
  input: WhatsAppAuthorizedActionInput,
  outcome: ConfirmDocumentSelectionOutcome,
): Promise<FlowActionResult> {
  const say = (body: string) => input.channel.sendText(input.session.whatsappNumber, body)
  switch (outcome.kind) {
    case 'dispatched':
      await say(
        outcome.issued === 0 ? ISSUANCE_NOTHING_DISPATCHED_MESSAGE : ISSUANCE_DISPATCHED_MESSAGE,
      )
      if (outcome.failures.length > 0) await say(formatFailures(outcome.failures))
      return TO_MENU
    case 'forbidden':
      await say(ISSUANCE_FORBIDDEN_MESSAGE)
      return TO_MENU
    case 'in_progress':
      await say(ISSUANCE_IN_PROGRESS_MESSAGE)
      return TO_MENU
    case 'already_dispatched':
      await say(ISSUANCE_ALREADY_DISPATCHED_MESSAGE)
      return TO_MENU
    case 'not_found':
      await say(ISSUANCE_NOT_FOUND_MESSAGE)
      return TO_CRITERION
    case 'expired':
      return offerRedo(input)
    case 'superseded':
      await say(ISSUANCE_SUPERSEDED_MESSAGE)
      return replyWithNewPreview(input, outcome.next)
  }
}

/** "Prévia expirada" com a opção de refazer: o 🔁 cai no mesmo Voltar que recomeça o critério. */
async function offerRedo(input: WhatsAppAuthorizedActionInput): Promise<FlowActionResult> {
  await input.channel.sendInteractiveList({
    body: ISSUANCE_EXPIRED_MESSAGE,
    buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
    rows: [{ id: ISSUANCE_BACK_ANSWER, title: '🔁 Refazer' }],
    to: input.session.whatsappNumber,
  })
  return {
    context: { [KEY.confirmAnswer]: undefined, [KEY.requestId]: undefined },
    next: ISSUANCE_FLOW_NODE.confirmEntry,
  }
}

async function replyWithNewPreview(
  input: WhatsAppAuthorizedActionInput,
  next: SupersededPreview,
): Promise<FlowActionResult> {
  const to = input.session.whatsappNumber
  switch (next.kind) {
    case 'previewed':
      await sendVolumetryMessages({ channel: input.channel, to, volumetry: next.volumetry })
      await sendConfirmationList({ channel: input.channel, requestId: next.requestId, to })
      return {
        context: { [KEY.confirmAnswer]: undefined, [KEY.requestId]: next.requestId },
        next: ISSUANCE_FLOW_NODE.confirmEntry,
      }
    case 'nothing_to_issue':
      await sendVolumetryMessages({ channel: input.channel, to, volumetry: next.volumetry })
      await input.channel.sendText(to, 'Nenhuma dessas notas pode ser emitida agora.')
      return TO_CRITERION
    case 'no_membership':
      throw new WhatsAppCommandDeniedError('no_membership')
    default:
      await input.channel.sendText(to, 'Refaça a seleção.')
      return TO_CRITERION
  }
}

function formatFailures(failures: readonly IssuanceStepFailure[]): string {
  const lines = failures.map(
    (failure) =>
      `• ${failure.label}: ${ISSUANCE_BLOCK_REASON_LABELS[failure.reason] ?? ISSUANCE_UNKNOWN_REASON_LABEL}`,
  )
  return ['Não saiu na criação:', ...lines].join('\n')
}
