/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — as FlowActions do ramo "Emitir documentos" (D4, D5). Abrir o ramo pede
 * `cte.submit` **ou** `nfse.issue`, conferido a cada ação com o ator re-resolvido pelo número (D2);
 * a conferência das três permissões de emissão fica na confirmação (T013).
 *
 * Nada aqui emite: o ramo termina num pedido congelado (`whatsapp_command_requests`) e num botão
 * de confirmar que carrega o id dele.
 */
import { parseMenuPageNavigation } from '../domain/whatsapp-menu.policy.js'
import { readSelectionState } from '../domain/document-selection.policy.js'
import {
  ISSUANCE_BACK_ANSWER,
  ISSUANCE_CONFIRM_ANSWER_PREFIX,
  ISSUANCE_FLOW_ACTION_KIND,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_FLOW_NODE,
  ISSUANCE_OPEN_PERMISSIONS,
} from '../domain/whatsapp-issuance-flow.constant.js'
import { acceptIssuanceAnswer } from './issuance-answer.service.js'
import {
  clearSelectionContext,
  type IssuanceFlowActionDependencies,
  readContextString,
} from './issuance-flow-context.service.js'
import { createIssuancePromptHandler } from './issuance-flow-prompt.service.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppFlowActionDefinition,
  WhatsAppFlowActionPolicy,
} from './with-authorized-actor.service.js'

export type { IssuanceFlowActionDependencies } from './issuance-flow-context.service.js'

const ISSUANCE_OPEN_POLICY: WhatsAppFlowActionPolicy = ISSUANCE_OPEN_PERMISSIONS.map(
  (permission) => ({ permission, scope: 'company' as const }),
)

/**
 * Enquanto a T013 não chega, confirmar diz o que acontece e devolve ao menu: o pedido fica
 * congelado e expira sozinho em 15 minutos, sem emitir nada.
 */
const CONFIRMATION_NOT_AVAILABLE =
  'A confirmação pelo WhatsApp ainda não está disponível. Por enquanto, emita pelo painel.'

export function createIssuanceWhatsAppFlowActions(
  deps: IssuanceFlowActionDependencies,
): readonly WhatsAppFlowActionDefinition[] {
  const start: WhatsAppAuthorizedActionHandler = async () => ({
    context: clearSelectionContext(),
    next: ISSUANCE_FLOW_NODE.criterionMenu,
  })

  return [
    { handler: start, kind: ISSUANCE_FLOW_ACTION_KIND.start, policy: ISSUANCE_OPEN_POLICY },
    {
      handler: createIssuancePromptHandler(deps),
      kind: ISSUANCE_FLOW_ACTION_KIND.prompt,
      policy: ISSUANCE_OPEN_POLICY,
    },
    {
      handler: createParamRouter(deps),
      kind: ISSUANCE_FLOW_ACTION_KIND.paramRouter,
      policy: ISSUANCE_OPEN_POLICY,
    },
    {
      handler: confirmRouter,
      kind: ISSUANCE_FLOW_ACTION_KIND.confirmRouter,
      policy: ISSUANCE_OPEN_POLICY,
    },
  ]
}

function createParamRouter(deps: IssuanceFlowActionDependencies): WhatsAppAuthorizedActionHandler {
  return async ({ actor, channel, context, session }) => {
    const answer = readContextString(context, KEY.answer)
    const step = readContextString(context, KEY.step)
    if (answer === undefined || step === undefined) return { next: ISSUANCE_FLOW_NODE.prompt }

    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      return { context: { [KEY.listPage]: page }, next: ISSUANCE_FLOW_NODE.prompt }
    }

    const verdict = await acceptIssuanceAnswer({
      answer,
      companyId: actor.scope.companyId,
      deps,
      state: readSelectionState(context),
      step,
    })
    if (verdict.kind === 'rejected') {
      await channel.sendText(session.whatsappNumber, verdict.message)
      return { context: { [KEY.answer]: undefined }, next: ISSUANCE_FLOW_NODE.prompt }
    }
    return {
      context: {
        ...verdict.patch,
        [KEY.answer]: undefined,
        [KEY.listPage]: undefined,
        [KEY.step]: undefined,
      },
      next: ISSUANCE_FLOW_NODE.prompt,
    }
  }
}

/** Só vale o botão do pedido que **esta** sessão congelou: id de outro pedido não confirma nada. */
const confirmRouter: WhatsAppAuthorizedActionHandler = async ({ channel, context, session }) => {
  const answer = readContextString(context, KEY.confirmAnswer)
  const requestId = readContextString(context, KEY.requestId)
  if (answer === ISSUANCE_BACK_ANSWER) {
    return { context: clearSelectionContext(), next: ISSUANCE_FLOW_NODE.criterionMenu }
  }
  if (requestId !== undefined && answer === `${ISSUANCE_CONFIRM_ANSWER_PREFIX}${requestId}`) {
    await channel.sendText(session.whatsappNumber, CONFIRMATION_NOT_AVAILABLE)
    return { context: clearSelectionContext(), next: 'menu' }
  }
  await channel.sendText(
    session.whatsappNumber,
    'Toque em ✅ Confirmar ou 🔙 Voltar, na lista acima.',
  )
  return { context: { [KEY.confirmAnswer]: undefined }, next: ISSUANCE_FLOW_NODE.confirmEntry }
}
