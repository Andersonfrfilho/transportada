/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  FlowActionHandler,
  FlowActionKind,
  FlowActionResult,
} from '@adatechnology/meta-whatsapp-contracts'

import type { AuthorizationService } from '../../identity/application/authorization.service.js'
import type { CompanyAuthorizationPolicy } from '../../identity/domain/authorization.policy.js'
import type { AuthenticatedContext, CompanyContext } from '../../identity/domain/tenant-context.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  WHATSAPP_COMMAND_FAILURE_REPLY,
  WHATSAPP_COMMAND_LOG,
} from '../domain/whatsapp-command.constant.js'
import {
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../domain/whatsapp-command.error.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from './resolve-whatsapp-actor.use-case.js'

export type WhatsAppAuthorizedActionInput = Parameters<FlowActionHandler>[0] & {
  readonly actor: AuthenticatedContext<CompanyContext>
}

export type WhatsAppAuthorizedActionHandler = (
  input: WhatsAppAuthorizedActionInput,
) => Promise<FlowActionResult | void>

/** Uma política, ou uma lista em que **qualquer uma** basta (ex.: `cte.submit` ou `nfse.issue`). */
export type WhatsAppFlowActionPolicy =
  | CompanyAuthorizationPolicy
  | readonly CompanyAuthorizationPolicy[]

export type WithAuthorizedActor = (
  policy: WhatsAppFlowActionPolicy,
  handler: WhatsAppAuthorizedActionHandler,
) => FlowActionHandler

export type WhatsAppFlowActionDefinition = {
  readonly handler: WhatsAppAuthorizedActionHandler
  readonly kind: FlowActionKind
  readonly policy: WhatsAppFlowActionPolicy
}

type CreateWithAuthorizedActorParams = {
  readonly authorization: Pick<AuthorizationService, 'authorize'>
  readonly clock: () => Date
  readonly logger: ApiLogger
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
}

/** O menu do ramo em que a FlowAction está: é para lá que toda FlowAction volta quando não há o que fazer. */
const BRANCH_MENU_NODE = 'menu'

/**
 * D2: a permissão é conferida **a cada ação**, com o ator resolvido de novo pelo número da sessão.
 * O `context` da sessão é jsonb persistido e nunca carrega ator; e quem esconde a opção é o menu,
 * que não é defesa — a ação recusa mesmo chamada direto.
 */
export function createWithAuthorizedActor({
  authorization,
  clock,
  logger,
  resolveActor,
}: CreateWithAuthorizedActorParams): WithAuthorizedActor {
  return (policy, handler) => async (input) => {
    const resolved = await resolveActor({
      companyId: input.session.companyId,
      fromPhone: input.session.whatsappNumber,
      now: clock(),
    })
    if (resolved.status === 'denied') throw new WhatsAppCommandDeniedError(resolved.reason)

    const policies: readonly CompanyAuthorizationPolicy[] = isPolicyList(policy) ? policy : [policy]
    const allowed = policies.some((candidate) =>
      isAuthorized(authorization, resolved.context, candidate),
    )
    if (!allowed) throw new WhatsAppCommandDeniedError('permission')

    try {
      return await handler({ ...input, actor: resolved.context })
    } catch (error) {
      if (error instanceof WhatsAppCommandDeniedError) throw error
      if (error instanceof WhatsAppCommandHandoffRequestedError) throw error
      return replyUnmappedFailure({ error, input, logger })
    }
  }
}

/**
 * T020 (B4): o erro que a FlowAction não mapeou subia até o despachante, que só logava — a pessoa
 * ficava sem resposta, parada no nó. Aqui ela recebe a mensagem neutra e volta ao menu do ramo. O
 * log leva o **nome** do erro: a mensagem do Postgres ecoa o texto que a pessoa digitou.
 */
async function replyUnmappedFailure(input: {
  readonly error: unknown
  readonly input: Parameters<FlowActionHandler>[0]
  readonly logger: ApiLogger
}): Promise<FlowActionResult> {
  const { session } = input.input
  input.logger.error(WHATSAPP_COMMAND_LOG.failed, {
    companyId: session.companyId,
    errorName: input.error instanceof Error ? input.error.name : typeof input.error,
    node: input.input.node.id,
  })
  await input.input.channel.sendText(session.whatsappNumber, WHATSAPP_COMMAND_FAILURE_REPLY)
  return { next: BRANCH_MENU_NODE }
}

function isPolicyList(
  policy: WhatsAppFlowActionPolicy,
): policy is readonly CompanyAuthorizationPolicy[] {
  return Array.isArray(policy)
}

/** O mesmo `authorize` do router, uma política por vez: basta uma passar. */
function isAuthorized(
  authorization: Pick<AuthorizationService, 'authorize'>,
  context: AuthenticatedContext<CompanyContext>,
  policy: CompanyAuthorizationPolicy,
): boolean {
  try {
    authorization.authorize(context, policy)
    return true
  } catch {
    return false
  }
}

/** O único caminho de registro: uma FlowAction não entra no interpretador sem passar pelo guarda. */
export function registerWhatsAppFlowActions(input: {
  readonly definitions: readonly WhatsAppFlowActionDefinition[]
  readonly registerFlowAction: (kind: FlowActionKind, handler: FlowActionHandler) => void
  readonly withAuthorizedActor: WithAuthorizedActor
}): void {
  for (const definition of input.definitions) {
    input.registerFlowAction(
      definition.kind,
      input.withAuthorizedActor(definition.policy, definition.handler),
    )
  }
}
