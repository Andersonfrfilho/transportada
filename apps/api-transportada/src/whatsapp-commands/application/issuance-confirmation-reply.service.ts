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
import { BOT_SPEECH_DEFAULTS, type BotSpeechKey } from '../domain/whatsapp-bot-speech.constant.js'
import {
  CATALOG_BOT_SPEECH,
  createBotSayer,
  type WhatsAppBotSpeechPort,
} from './whatsapp-bot-speech.service.js'
import { clearSelectionContext } from './issuance-flow-context.service.js'
import { sendConfirmationList, sendVolumetryMessages } from './issuance-flow-prompt.service.js'
import type { IssuanceStepFailure } from './issuance-journal.service.js'
import type { WhatsAppAuthorizedActionInput } from './with-authorized-actor.service.js'

/** Os padrões do código das falas da confirmação; o texto vivo é o do nó `fala_*` do grafo publicado. */
export const ISSUANCE_DISPATCHED_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceDispatched
export const ISSUANCE_NOTHING_DISPATCHED_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceNothingDispatched
export const ISSUANCE_FORBIDDEN_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceForbidden
export const ISSUANCE_IN_PROGRESS_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceInProgress
export const ISSUANCE_ALREADY_DISPATCHED_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceAlreadyDispatched
export const ISSUANCE_NOT_FOUND_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceNotFound
export const ISSUANCE_EXPIRED_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceExpired
export const ISSUANCE_SUPERSEDED_MESSAGE = BOT_SPEECH_DEFAULTS.issuanceSuperseded

const TO_MENU: FlowActionResult = { context: clearSelectionContext(), next: 'menu' }
const TO_CRITERION: FlowActionResult = {
  context: clearSelectionContext(),
  next: ISSUANCE_FLOW_NODE.criterionMenu,
}

export async function replyToConfirmation(
  input: WhatsAppAuthorizedActionInput,
  outcome: ConfirmDocumentSelectionOutcome,
  speech: WhatsAppBotSpeechPort = CATALOG_BOT_SPEECH,
): Promise<FlowActionResult> {
  const sayKey = createBotSayer(speech)
  const say = (key: BotSpeechKey) => sayKey(input, key)
  switch (outcome.kind) {
    case 'dispatched':
      await say(outcome.issued === 0 ? 'issuanceNothingDispatched' : 'issuanceDispatched')
      if (outcome.failures.length > 0) {
        await sayKey(input, { text: await formatFailures(outcome.failures, input, speech) })
      }
      return TO_MENU
    case 'forbidden':
      await say('issuanceForbidden')
      return TO_MENU
    case 'in_progress':
      await say('issuanceInProgress')
      return TO_MENU
    case 'already_dispatched':
      await say('issuanceAlreadyDispatched')
      return TO_MENU
    case 'not_found':
      await say('issuanceNotFound')
      return TO_CRITERION
    case 'expired':
      return offerRedo(input, speech)
    case 'superseded':
      await say('issuanceSuperseded')
      return replyWithNewPreview(input, outcome.next, sayKey)
  }
}

/** "Prévia expirada" com a opção de refazer: o 🔁 cai no mesmo Voltar que recomeça o critério. */
async function offerRedo(
  input: WhatsAppAuthorizedActionInput,
  speech: WhatsAppBotSpeechPort,
): Promise<FlowActionResult> {
  const companyId = input.actor.scope.companyId
  await input.channel.sendInteractiveList({
    body: await speech.text({ companyId, key: 'issuanceExpired' }),
    buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
    rows: [
      {
        id: ISSUANCE_BACK_ANSWER,
        title: await speech.text({ companyId, key: 'issuanceRedoButton' }),
      },
    ],
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
  say: ReturnType<typeof createBotSayer>,
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
      await say(input, 'issuanceNothingToIssue')
      return TO_CRITERION
    case 'no_membership':
      throw new WhatsAppCommandDeniedError('no_membership')
    default:
      await say(input, 'issuanceRedo')
      return TO_CRITERION
  }
}

async function formatFailures(
  failures: readonly IssuanceStepFailure[],
  input: WhatsAppAuthorizedActionInput,
  speech: WhatsAppBotSpeechPort,
): Promise<string> {
  const lines = failures.map(
    (failure) =>
      `• ${failure.label}: ${ISSUANCE_BLOCK_REASON_LABELS[failure.reason] ?? ISSUANCE_UNKNOWN_REASON_LABEL}`,
  )
  const header = await speech.text({
    companyId: input.actor.scope.companyId,
    key: 'issuanceFailuresHeader',
  })
  return [header, ...lines].join('\n')
}
