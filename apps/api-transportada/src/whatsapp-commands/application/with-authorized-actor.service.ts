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
import { WhatsAppCommandDeniedError } from '../domain/whatsapp-command.error.js'
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

export type WithAuthorizedActor = (
  policy: CompanyAuthorizationPolicy,
  handler: WhatsAppAuthorizedActionHandler,
) => FlowActionHandler

export type WhatsAppFlowActionDefinition = {
  readonly handler: WhatsAppAuthorizedActionHandler
  readonly kind: FlowActionKind
  readonly policy: CompanyAuthorizationPolicy
}

type CreateWithAuthorizedActorParams = {
  readonly authorization: Pick<AuthorizationService, 'authorize'>
  readonly clock: () => Date
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
}

/**
 * D2: a permissão é conferida **a cada ação**, com o ator resolvido de novo pelo número da sessão.
 * O `context` da sessão é jsonb persistido e nunca carrega ator; e quem esconde a opção é o menu,
 * que não é defesa — a ação recusa mesmo chamada direto.
 */
export function createWithAuthorizedActor({
  authorization,
  clock,
  resolveActor,
}: CreateWithAuthorizedActorParams): WithAuthorizedActor {
  return (policy, handler) => async (input) => {
    const resolved = await resolveActor({
      companyId: input.session.companyId,
      fromPhone: input.session.whatsappNumber,
      now: clock(),
    })
    if (resolved.status === 'denied') throw new WhatsAppCommandDeniedError(resolved.reason)

    try {
      authorization.authorize(resolved.context, policy)
    } catch {
      throw new WhatsAppCommandDeniedError('permission')
    }

    return handler({ ...input, actor: resolved.context })
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
