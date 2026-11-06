/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomUUID } from 'node:crypto'

import type {
  ChannelAdapterInterface,
  FlowGraphData,
  FlowNodeData,
  MessageHookOutcome,
  MetaWhatsAppHooks,
} from '@adatechnology/meta-whatsapp-contracts'

import type { RateLimiter } from '../../http/rate-limiter.service.js'
import { maskPhone } from '../../logging/phone-mask.policy.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  extractWhatsAppAnswer,
  extractWhatsAppIncomingImage,
  isChoiceNode,
  isOfferedOption,
} from '../domain/whatsapp-answer.policy.js'
import {
  WHATSAPP_COMMAND_LOG,
  WHATSAPP_COMMAND_RATE_LIMIT,
  WHATSAPP_DEFAULT_FALLBACK_REPLY,
  WHATSAPP_COMMAND_FAILURE_REPLY,
  WHATSAPP_DENIED_REPLY,
  WHATSAPP_DENIED_REPLY_LIMIT,
  WHATSAPP_HANDOFF_REPLY,
  WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY,
  WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF,
  WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY,
  WHATSAPP_MAX_CROSS_FLOW_HOPS,
  WHATSAPP_SHARED_LOCATION_PERMISSION,
  WHATSAPP_SHARED_LOCATION_REPLY,
} from '../domain/whatsapp-command.constant.js'
import {
  DRIVER_FLOW_CONTEXT_KEY,
  DRIVER_FLOW_NODE,
} from '../domain/whatsapp-driver-flow.constant.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../../trips/domain/trip-permission.constant.js'
import {
  ATTENDANT_FLOW_CONTEXT_KEY,
  ATTENDANT_FLOW_NODE,
} from '../domain/whatsapp-attendant-flow.constant.js'
import { interpretAttendantFieldCommand } from './register-attendant-field-flow-actions.js'
import { interpretWhatsAppDriverEventCommand } from '../domain/whatsapp-driver-event-command.policy.js'
import { parseMenuPageNavigation } from '../domain/whatsapp-menu.policy.js'
import { filterWhatsAppRootFlowGraph } from '../domain/whatsapp-root-menu.policy.js'
import { WHATSAPP_PHONE_VERIFICATION_CODE_MESSAGE_PATTERN } from '../domain/whatsapp-phone-verification.constant.js'
import {
  type WhatsAppCommandDenialReason,
  WhatsAppCommandDeniedError,
  WhatsAppCommandHandoffRequestedError,
} from '../domain/whatsapp-command.error.js'
import { toWhatsAppPhoneKey } from '../domain/whatsapp-phone-key.policy.js'
import { toWhatsAppPhone } from '../domain/whatsapp-phone.policy.js'
import { buildWhatsAppPhoneVerifiedReply } from '../domain/whatsapp-verified-reply.policy.js'
import type {
  ResolveWhatsAppActorParams,
  ResolveWhatsAppActorResult,
} from './resolve-whatsapp-actor.use-case.js'
import type { VerifyWhatsAppPhone } from './verify-whatsapp-phone.use-case.js'
import {
  extractWhatsAppIncomingLocation,
  type WhatsAppSharedLocationStore,
} from './whatsapp-shared-location.service.js'
import type { WhatsAppChoiceRenderer } from './whatsapp-choice-renderer.service.js'
import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from './whatsapp-delivery-preparation.service.js'
import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  readDriverPrompt,
} from '../domain/whatsapp-driver-prompt.policy.js'
import {
  buildRouteOfferReply,
  type WhatsAppDriverPrompts,
} from './whatsapp-driver-prompts.service.js'
import { DELIVERY_PROOF_SPEECH } from '../domain/whatsapp-delivery-proof-speech.constant.js'
import {
  BOT_AUDIO_SPEECH,
  type WhatsAppBotAudio,
} from '../../whatsapp/application/whatsapp-bot-audio.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppFlowGraphProviderPort,
  WhatsAppFlowInterpreterPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from './whatsapp-command-driver.port.js'
import {
  clearWhatsAppFlowPosition,
  renderChoicePage,
  runWhatsAppFlow,
  type WhatsAppCommandTurn,
  withoutInvalidAttempts,
} from './whatsapp-flow-step.service.js'

export type WhatsAppMessageHandler = NonNullable<MetaWhatsAppHooks['onMessageReceived']>

/**
 * Spec 293 T15: a entrega em preparo na conversa individual. A foto, a localização e as respostas em
 * texto (quem recebeu, nome, "pular", 1/2) do motorista com preparação aberta vão para ela antes do
 * menu; o resto segue o fluxo de sempre.
 */
export type WhatsAppDeliveryProofIntake = {
  readonly preparations: WhatsAppDeliveryPreparations
  /** O motorista (ficha) da conta que escreveu; `null` quando não é motorista. */
  readonly resolveDriver: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<null | string>
}

export type WhatsAppCommandDriverDependencies = {
  /**
   * Spec 292 T9: o áudio na conversa individual vira texto (transcrito pelo worker) e só segue o fluxo
   * depois do "1 - Sim". Ausente, áudio é tratado como qualquer outra mensagem fora do menu.
   */
  readonly botAudio?: WhatsAppBotAudio<null>
  readonly channel: ChannelAdapterInterface
  readonly clock: () => Date
  /** Spec 293 T15: ausente, foto e texto seguem o fluxo de sempre (sem entrega em preparo). */
  readonly deliveryProofs?: WhatsAppDeliveryProofIntake
  /** Spec 294 RF8: a oferta da próxima rota e as conferências do bot; ausente, a baixa responde como antes. */
  readonly driverPrompts?: WhatsAppDriverPrompts
  readonly graphs: WhatsAppFlowGraphProviderPort
  readonly interpreter: WhatsAppFlowInterpreterPort
  readonly logger: ApiLogger
  /** Compartilhado entre as instâncias por empresa: trocar o token não pode zerar o teto. */
  readonly rateLimiter: RateLimiter
  readonly renderChoice?: WhatsAppChoiceRenderer
  readonly resolveActor: (params: ResolveWhatsAppActorParams) => Promise<ResolveWhatsAppActorResult>
  readonly sender: WhatsAppMessageSenderPort
  readonly sessions: WhatsAppCommandSessionPort
  /** Ausente, a mensagem de localização é tratada como qualquer outra — resposta fora do menu. */
  readonly sharedLocations?: WhatsAppSharedLocationStore
  /** Ausente, o número não vinculado só recebe a recusa neutra — como antes da T004. */
  readonly verifyPhone?: VerifyWhatsAppPhone
}

const HANDLED: MessageHookOutcome = { outcome: 'handled' }
const CONTINUE: MessageHookOutcome = { outcome: 'continue' }

/**
 * Spec 144 T006 — a mensagem recebida vira passo de fluxo. Ordem por mensagem: teto por número
 * (antes de qualquer banco) → modo humano segue para a inbox → ator → posição → validação da
 * resposta → interpretador → posição gravada → próxima pergunta renderizada.
 *
 * ⚠️ Falha de envio ou de banco **não sobe para o webhook**: a rota responde 200 à Meta de qualquer
 * jeito, e uma exceção aqui só viraria 500 — o que leva a Meta a desativar o webhook de todos.
 */
export function createWhatsAppCommandDriver(
  deps: WhatsAppCommandDriverDependencies,
): WhatsAppMessageHandler {
  return async function onMessageReceived(message, session) {
    const phone = message.from ?? session.whatsappNumber
    const turn: WhatsAppCommandTurn = {
      deps,
      maskedPhone: maskPhone(phone),
      message,
      phone,
      session,
    }
    try {
      return await dispatch(turn)
    } catch (error) {
      deps.logger.error(WHATSAPP_COMMAND_LOG.failed, {
        companyId: session.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        phone: turn.maskedPhone,
      })
      return HANDLED
    }
  }
}

async function dispatch(incoming: WhatsAppCommandTurn): Promise<MessageHookOutcome> {
  let turn = incoming
  const { deps, session } = turn
  const limit = deps.rateLimiter.consume({
    key: `command:${buildLimitKey(turn)}`,
    policy: WHATSAPP_COMMAND_RATE_LIMIT,
  })
  if (!limit.allowed) {
    logDenied({ reason: 'rate_limited', turn })
    return HANDLED
  }
  if (session.mode === 'human') return CONTINUE

  const actor = await deps.resolveActor({
    companyId: session.companyId,
    fromPhone: turn.phone,
    now: deps.clock(),
  })
  if (actor.status === 'denied') {
    const code = readVerificationCode(turn.message)
    const { verifyPhone } = deps
    if (code !== undefined && verifyPhone !== undefined) {
      await guardConversation(turn, () => verifyEntry({ code, turn, verifyPhone }))
      return HANDLED
    }
    await denyTurn({ reason: actor.reason, turn })
    return HANDLED
  }

  const audio = await acceptBotAudio(turn)
  if (audio === 'handled') return HANDLED
  turn = audio

  const proofActor = await resolveProofActor({ scope: actor.context.scope, turn })
  if (
    await acknowledgeSharedLocation({
      permissions: actor.context.scope.permissions,
      proofActor,
      scope: actor.context.scope,
      turn,
    })
  ) {
    return HANDLED
  }
  if (proofActor !== null && (await acceptDeliveryProof({ proofActor, turn }))) return HANDLED
  if (await acceptDriverPrompt({ scope: actor.context.scope, turn })) return HANDLED

  await guardConversation(turn, () =>
    advanceConversation(turn, actor.context.scope.permissions, proofActor !== null),
  )
  return HANDLED
}

/**
 * Spec 292 T9: o áudio do motorista. Chegou áudio: "recebi", e o texto vem depois para confirmar.
 * Chegou "1"/"2" com áudio esperando: "1" troca a mensagem pelo texto do áudio e o turno segue como se
 * ele tivesse digitado; "2" descarta. Outra mensagem descarta o áudio e segue normalmente.
 */
async function acceptBotAudio(turn: WhatsAppCommandTurn): Promise<'handled' | WhatsAppCommandTurn> {
  const { botAudio } = turn.deps
  if (botAudio === undefined) return turn
  const { companyId } = turn.session
  const conversation = `user:${turn.phone}`
  const reply = async (texts: readonly string[]) => {
    for (const body of texts) await turn.deps.sender.sendText({ body, to: turn.phone })
  }
  const audio = turn.message.audio
  if (audio?.id !== undefined) {
    const mediaId = audio.id
    await botAudio.receive({
      companyId,
      context: null,
      conversation,
      download: () => turn.deps.channel.fetchMediaAsBase64(mediaId),
      mimeType: audio.mime_type ?? 'audio/ogg',
      owner: turn.phone,
      reply,
      seconds: null,
    })
    return 'handled'
  }
  const text = turn.message.text?.body
  if (text === undefined || !botAudio.hasPending({ companyId, conversation, owner: turn.phone })) {
    return turn
  }
  // A pergunta mais recente é a dona do "1"/"2": pedido aberto depois do áudio não perde a resposta para ele.
  const askedAt = botAudio.pendingSince({ companyId, conversation, owner: turn.phone })
  const position = await turn.deps.sessions.getContext(companyId, turn.phone)
  const prompt = readDriverPrompt(position?.context ?? {}, turn.deps.clock())
  if (askedAt !== undefined && prompt !== undefined && Date.parse(prompt.offeredAt) > askedAt) {
    botAudio.supersede({ companyId, conversation, owner: turn.phone })
    return turn
  }
  const answer = botAudio.answer({ companyId, conversation, owner: turn.phone, text })
  if (answer.kind === 'discarded') {
    await reply([BOT_AUDIO_SPEECH.discarded])
    return 'handled'
  }
  if (answer.kind === 'none') return turn
  return {
    ...turn,
    isFromAudio: true,
    message: { ...turn.message, text: { body: answer.text }, type: 'text' },
  }
}

/**
 * Spec 196 T3.6: a localização é mensagem própria, não resposta do menu — consumida aqui, ela não
 * conta como tentativa inválida nem mexe na posição do fluxo. Só quem reporta como motorista
 * (`trip.report`) tem ponto lembrado: o operador que mande uma localização cai no fluxo de sempre.
 */
async function acknowledgeSharedLocation(input: {
  readonly permissions: ReadonlySet<string>
  readonly proofActor: null | ProofActor
  readonly scope: DriverPromptScope
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { permissions, proofActor, scope, turn } = input
  const { sharedLocations } = turn.deps
  if (sharedLocations === undefined) return false
  if (!permissions.has(WHATSAPP_SHARED_LOCATION_PERMISSION)) return false

  const location = extractWhatsAppIncomingLocation(turn.message, turn.deps.clock())
  if (location === undefined) return false

  // Spec 294 RF24: com o pedido de localização do "saí"/"cheguei" em aberto, o ponto é dele e não fica lembrado.
  if (await answerLocationPrompt({ location, scope, turn })) return true

  sharedLocations.remember({
    companyId: turn.session.companyId,
    location,
    whatsappNumber: turn.session.whatsappNumber,
  })
  // Spec 293 T15: a localização também completa a entrega em preparo que ainda não a tinha.
  const reply =
    proofActor === null
      ? null
      : await proofActor.intake.preparations.receiveLocation({ actor: proofActor.actor, location })
  if (reply !== null && reply.texts.length > 0 && proofActor !== null) {
    await sendProofReply({ actor: proofActor.actor, intake: proofActor.intake, reply, turn })
    return true
  }
  await turn.deps.sender.sendText({ body: WHATSAPP_SHARED_LOCATION_REPLY, to: turn.phone })
  return true
}

type ProofActor = {
  readonly actor: {
    readonly actorUserId: string
    readonly companyId: string
    readonly driverId: string
  }
  readonly intake: WhatsAppDeliveryProofIntake
}

/** O motorista com entrega em preparo aberta; `null` sem a intake, sem ficha ou sem preparação. */
async function resolveProofActor(input: {
  readonly scope: {
    readonly companyId: string
    readonly membershipId: string
    readonly permissions: ReadonlySet<string>
    readonly userId: string
  }
  readonly turn: WhatsAppCommandTurn
}): Promise<null | ProofActor> {
  const intake = input.turn.deps.deliveryProofs
  if (intake === undefined) return null
  if (!input.scope.permissions.has(WHATSAPP_SHARED_LOCATION_PERMISSION)) return null
  const driverId = await intake.resolveDriver({
    companyId: input.scope.companyId,
    membershipId: input.scope.membershipId,
  })
  if (driverId === null) return null
  const scope = { companyId: input.scope.companyId, driverId }
  // Spec 294 T4.8: a foto sem preparação aberta também entra, para o bot reconhecer o canhoto (só mensagem de imagem).
  const mayRecognizePhoto =
    extractWhatsAppIncomingImage(input.turn.message) !== undefined &&
    (await intake.preparations.acceptsUnsolicitedPhoto?.(scope)) === true
  if (!mayRecognizePhoto && !(await intake.preparations.hasOpen(scope))) return null
  return {
    actor: { actorUserId: input.scope.userId, companyId: input.scope.companyId, driverId },
    intake,
  }
}

/**
 * Spec 293 T15: a foto (baixada pelo canal, o mesmo `fetchMediaAsBase64` da foto do operador) e a
 * resposta em texto à pergunta aberta. Texto que não é resposta (menu, comando) segue o fluxo.
 */
async function acceptDeliveryProof(input: {
  readonly proofActor: ProofActor
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { proofActor, turn } = input
  const { actor, intake } = proofActor
  const image = extractWhatsAppIncomingImage(turn.message)
  if (image !== undefined) {
    let downloaded: { readonly data: string; readonly mimeType: string }
    try {
      downloaded = await turn.deps.channel.fetchMediaAsBase64(image.mediaId)
    } catch {
      await turn.deps.sender.sendText({
        body: DELIVERY_PROOF_SPEECH.downloadFailed,
        to: turn.phone,
      })
      return true
    }
    const reply = await intake.preparations.receivePhoto({
      actor,
      bytes: Uint8Array.from(Buffer.from(downloaded.data, 'base64')),
      caption: turn.message.image?.caption ?? null,
      channel: 'individual',
      mimeType: downloaded.mimeType.split(';')[0]?.trim() || image.mimeType,
      providerMessageId: turn.message.id ?? image.mediaId,
    })
    if (reply === null) return false
    await sendProofReply({ actor, intake, reply, turn })
    return true
  }
  const text = extractWhatsAppAnswer(turn.message)
  if (text === undefined) return false
  const reply = await intake.preparations.answer({ actor, strict: true, text })
  if (reply === null) {
    // Spec 294 RF22: o bot pediu foto ou localização e veio áudio — repete o pedido dizendo que vai por mídia.
    if (turn.isFromAudio !== true) return false
    const again = await intake.preparations.repeatMediaRequest?.({ actor })
    if (again === null || again === undefined) return false
    await sendProofReply({ actor, intake, reply: again, turn })
    return true
  }
  await sendProofReply({ actor, intake, reply, turn })
  return true
}

async function sendProofReply(input: {
  readonly actor: ProofActor['actor']
  readonly intake: WhatsAppDeliveryProofIntake
  readonly reply: WhatsAppDeliveryPreparationReply
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { actor, intake, reply, turn } = input
  for (const body of reply.texts) await turn.deps.sender.sendText({ body, to: turn.phone })
  if (reply.routeContinuation !== undefined) {
    await offerNextRoute({ actor, continuation: reply.routeContinuation, intake, turn })
  }
}

/**
 * Spec 294 RF8–RF10: a baixa que fechou a parada oferece a próxima rota. A pergunta só abre quando nada
 * mais espera resposta deste motorista (RNF1); o pedido fica no contexto da sessão.
 */
async function offerNextRoute(input: {
  readonly actor: ProofActor['actor']
  readonly continuation: NonNullable<WhatsAppDeliveryPreparationReply['routeContinuation']>
  readonly intake: WhatsAppDeliveryProofIntake
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { actor, continuation, intake, turn } = input
  const { botAudio, driverPrompts, sessions } = turn.deps
  if (driverPrompts === undefined) return
  const { companyId } = turn.session
  const position = await sessions.getContext(companyId, turn.phone)
  const context = position?.context ?? {}
  const offer = buildRouteOfferReply({
    continuation,
    gate: {
      hasOpenCollection: await intake.preparations.hasOpen(actor),
      hasOpenStopChoice: position?.currentNodeId === DRIVER_FLOW_NODE.stopEntry,
      hasPendingAudio:
        botAudio?.hasPending({
          companyId,
          conversation: `user:${turn.phone}`,
          owner: turn.phone,
        }) ?? false,
      hasPendingPrompt: driverPrompts.pending(context) !== undefined,
    },
    now: turn.deps.clock(),
  })
  for (const body of offer.texts) await turn.deps.sender.sendText({ body, to: turn.phone })
  if (offer.prompt === undefined) return
  await sessions.setState(
    companyId,
    turn.phone,
    position?.currentState ?? turn.session.currentState,
    {
      ...context,
      [DRIVER_PROMPT_CONTEXT_KEY]: offer.prompt,
    },
  )
}

type DriverPromptScope = {
  readonly companyId: string
  readonly membershipId: string
  readonly permissions: ReadonlySet<string>
  readonly userId: string
}

/** Spec 294 RF24: a localização compartilhada responde ao pedido de localização em aberto. */
async function answerLocationPrompt(input: {
  readonly location: ReportedLocation
  readonly scope: DriverPromptScope
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { location, scope, turn } = input
  const { deliveryProofs, driverPrompts, sessions } = turn.deps
  if (driverPrompts === undefined || deliveryProofs === undefined) return false
  const position = await sessions.getContext(scope.companyId, turn.phone)
  const context = position?.context ?? {}
  if (driverPrompts.pending(context) === undefined) return false
  const driverId = await deliveryProofs.resolveDriver({
    companyId: scope.companyId,
    membershipId: scope.membershipId,
  })
  if (driverId === null) return false
  const result = await driverPrompts.answerLocation({
    actor: { actorUserId: scope.userId, companyId: scope.companyId, driverId },
    context,
    location,
    whatsappNumber: turn.session.whatsappNumber,
  })
  if (result === null) return false
  await sessions.setState(
    scope.companyId,
    turn.phone,
    position?.currentState ?? turn.session.currentState,
    result.context,
  )
  for (const body of result.texts) await turn.deps.sender.sendText({ body, to: turn.phone })
  return true
}

/**
 * Spec 294 RNF1: a resposta ("1"/"2", digitada ou falada) ao pedido em aberto da conversa — a oferta da
 * próxima rota. Só responde ao pedido; qualquer outra mensagem o encerra e segue o fluxo de sempre.
 */
async function acceptDriverPrompt(input: {
  readonly scope: DriverPromptScope
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { scope, turn } = input
  const { deliveryProofs, driverPrompts, sessions } = turn.deps
  if (driverPrompts === undefined || deliveryProofs === undefined) return false
  if (!scope.permissions.has(WHATSAPP_SHARED_LOCATION_PERMISSION)) return false
  const text = extractWhatsAppAnswer(turn.message)
  if (text === undefined) return false
  const position = await sessions.getContext(scope.companyId, turn.phone)
  const context = position?.context ?? {}
  if (driverPrompts.pending(context) === undefined) return false
  const driverId = await deliveryProofs.resolveDriver({
    companyId: scope.companyId,
    membershipId: scope.membershipId,
  })
  if (driverId === null) return false
  const result = await driverPrompts.answer({
    actor: { actorUserId: scope.userId, companyId: scope.companyId, driverId },
    context,
    text,
    whatsappNumber: turn.session.whatsappNumber,
  })
  if (result === null) return false
  await sessions.setState(
    scope.companyId,
    turn.phone,
    position?.currentState ?? turn.session.currentState,
    result.context,
  )
  if (!result.handled) return false
  for (const body of result.texts) await turn.deps.sender.sendText({ body, to: turn.phone })
  return true
}

/**
 * A FlowAction re-resolveu o ator e recusou: mesma saída neutra, e o fluxo termina.
 *
 * T020 (B4): qualquer outro erro — inclusive no menu que abre depois de `verifyEntry`, que rodava
 * fora deste `try` — vira a mensagem neutra e a conversa recomeça do menu. Antes ele subia, o
 * `catch` de fora só logava, e a pessoa ficava sem resposta, parada no nó.
 */
async function guardConversation(
  turn: WhatsAppCommandTurn,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work()
  } catch (error) {
    // T020 (B5): a FlowAction recusou duas respostas de lista seguidas — o mesmo handoff da D8.
    if (error instanceof WhatsAppCommandHandoffRequestedError) {
      await handOff({ context: {}, turn })
      return
    }
    await clearWhatsAppFlowPosition({ context: {}, turn })
    if (error instanceof WhatsAppCommandDeniedError) {
      await denyTurn({ reason: error.reason, turn })
      return
    }
    turn.deps.logger.error(WHATSAPP_COMMAND_LOG.failed, {
      companyId: turn.session.companyId,
      errorName: error instanceof Error ? error.name : typeof error,
      phone: turn.maskedPhone,
    })
    await turn.deps.sender.sendText({ body: WHATSAPP_COMMAND_FAILURE_REPLY, to: turn.phone })
  }
}

async function advanceConversation(
  turn: WhatsAppCommandTurn,
  permissions: ReadonlySet<string>,
  isRegisteredDriver: boolean,
): Promise<void> {
  const position = await turn.deps.sessions.getContext(turn.session.companyId, turn.phone)
  const context = position?.context ?? {}
  const located = await locateNode({ permissions, position, turn })
  const graph = located?.graph ?? (await findRootGraph(turn, permissions))
  if (graph === undefined) return

  if (await runDirectDriverCommand({ context, graph, located, permissions, turn })) return
  if (
    !isRegisteredDriver &&
    (await runAttendantFieldCommand({ context, graph, located, permissions, turn }))
  ) {
    return
  }

  if (located === undefined) {
    await runWhatsAppFlow({
      cursor: {
        context: withoutInvalidAttempts(context),
        currentNodeId: graph.startNodeId,
        graph,
        userAnswer: undefined,
      },
      hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
      turn,
    })
    return
  }

  const answer = extractWhatsAppAnswer(turn.message)
  if (isChoiceNode(located.node)) {
    const page = parseMenuPageNavigation(answer)
    if (page !== undefined) {
      await renderChoicePage({ node: located.node, page, turn })
      return
    }
    if (!isOfferedOption(located.node, answer)) {
      /** RF17/D16 (CA9): imagem num nó de escolha nunca é opção válida — vira resposta inválida,
       * como qualquer texto fora do menu, e conta para o handoff (D8). */
      await rejectAnswer({ context, node: located.node, turn })
      return
    }
  }

  /**
   * Spec 161 T14 (RF17/D16): a imagem viaja pelo contexto, nunca pela assinatura de
   * `userAnswer` — só o router do nó alcançado (o passo de foto, T15) sabe o que fazer com ela.
   * O driver escreve e sempre apaga a chave ao persistir o turno (`withoutIncomingImage`, no
   * `settleFlow`/`clearWhatsAppFlowPosition`), consumida ou não pelo `FlowActionHandler` —
   * `media-id` é credencial de curta duração e nunca sobrevive além do turno em que chegou.
   */
  const incomingImage = extractWhatsAppIncomingImage(turn.message)
  await runWhatsAppFlow({
    cursor: {
      context: {
        ...withoutInvalidAttempts(context),
        ...(incomingImage === undefined
          ? {}
          : { [WHATSAPP_INCOMING_IMAGE_CONTEXT_KEY]: incomingImage }),
      },
      currentNodeId: located.node.id,
      graph,
      userAnswer: answer,
    },
    hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
    turn,
  })
}

/**
 * Spec 293 T14: o comando direto do motorista ("saí", "cheguei", "entreguei 17234") no texto livre.
 * Só vale onde o motorista não está respondendo outra pergunta (começo da conversa, menu raiz ou menu
 * da viagem) — uma observação digitada de ocorrência nunca vira comando. O interpretador é o mesmo do
 * grupo (`whatsapp-driver-event-command.policy.ts`); a `FlowAction` reconfere a permissão e o motorista.
 */
async function runDirectDriverCommand(input: {
  readonly context: Record<string, unknown>
  readonly graph: FlowGraphData
  readonly located: { readonly node: FlowNodeData } | undefined
  readonly permissions: ReadonlySet<string>
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { context, graph, located, permissions, turn } = input
  if (!permissions.has(WHATSAPP_SHARED_LOCATION_PERMISSION)) return false
  const text = turn.message.text?.body
  if (text === undefined) return false
  const nodeId = located?.node.id
  if (
    nodeId !== undefined &&
    nodeId !== graph.startNodeId &&
    nodeId !== DRIVER_FLOW_NODE.tripMenu
  ) {
    return false
  }
  // Grafo publicado antes da T14 não tem o nó: segue o fluxo de sempre até a republicação.
  if (graph.nodes[DRIVER_FLOW_NODE.directCommand] === undefined) return false
  const command = interpretWhatsAppDriverEventCommand(text)
  if (command === undefined) return false

  await runWhatsAppFlow({
    cursor: {
      context: {
        ...withoutInvalidAttempts(context),
        [DRIVER_FLOW_CONTEXT_KEY.directCommand]: command,
      },
      currentNodeId: DRIVER_FLOW_NODE.directCommand,
      graph,
      userAnswer: undefined,
    },
    hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
    turn,
  })
  return true
}

/**
 * Spec 294 RF21: o comando do atendente ("entreguei 17234 17235", "encerrar a rota") no texto livre.
 * Mesmas condições do comando do motorista (só onde ninguém responde outra pergunta); a FlowAction
 * reconfere a permissão da baixa do escritório. Quem é motorista cadastrado segue as regras de motorista.
 */
async function runAttendantFieldCommand(input: {
  readonly context: Record<string, unknown>
  readonly graph: FlowGraphData
  readonly located: { readonly node: FlowNodeData } | undefined
  readonly permissions: ReadonlySet<string>
  readonly turn: WhatsAppCommandTurn
}): Promise<boolean> {
  const { context, graph, located, permissions, turn } = input
  if (!permissions.has(TRIP_REPORT_ON_BEHALF_PERMISSION)) return false
  const text = turn.message.text?.body
  if (text === undefined) return false
  const nodeId = located?.node.id
  if (nodeId !== undefined && nodeId !== graph.startNodeId) return false
  // Grafo publicado antes da spec 294 não tem o nó: segue o fluxo de sempre até a republicação.
  if (graph.nodes[ATTENDANT_FLOW_NODE.fieldCommand] === undefined) return false
  const command = interpretAttendantFieldCommand(text)
  if (command === undefined) return false

  await runWhatsAppFlow({
    cursor: {
      context: {
        ...withoutInvalidAttempts(context),
        [ATTENDANT_FLOW_CONTEXT_KEY.fieldCommand]: command,
      },
      currentNodeId: ATTENDANT_FLOW_NODE.fieldCommand,
      graph,
      userAnswer: undefined,
    },
    hopsLeft: WHATSAPP_MAX_CROSS_FLOW_HOPS,
    turn,
  })
  return true
}

async function locateNode(input: {
  readonly permissions: ReadonlySet<string>
  readonly position: WhatsAppSessionPosition | undefined
  readonly turn: WhatsAppCommandTurn
}): Promise<{ readonly graph: FlowGraphData; readonly node: FlowNodeData } | undefined> {
  const { permissions, position, turn } = input
  if (position === undefined || position.flowKey === null || position.currentNodeId === null) {
    return undefined
  }

  const graph = await findFlowGraph({ flowKey: position.flowKey, permissions, turn })
  /** Nó que sumiu numa republicação recomeça do menu, em vez de prender a conversa. */
  const node = graph?.nodes[position.currentNodeId]
  return graph === undefined || node === undefined ? undefined : { graph, node }
}

async function findRootGraph(
  turn: WhatsAppCommandTurn,
  permissions: ReadonlySet<string>,
): Promise<FlowGraphData | undefined> {
  const graph = await findFlowGraph({ flowKey: turn.deps.graphs.rootFlowKey, permissions, turn })
  if (graph === undefined) {
    turn.deps.logger.error(WHATSAPP_COMMAND_LOG.flowMissing, {
      companyId: turn.session.companyId,
      flowKey: turn.deps.graphs.rootFlowKey,
    })
  }
  return graph
}

/**
 * D2 — "o menu raiz é filtrado por permissão": o grafo publicado tem todas as opções, e é aqui —
 * único ponto por onde o despachante lê qualquer grafo, tanto para renderizar quanto para validar a
 * resposta — que a vitrine é recortada pela membership do ator. Resposta a uma opção escondida cai
 * em `isOfferedOption` como resposta inválida, porque o nó que a checa já saiu filtrado daqui.
 */
async function findFlowGraph(input: {
  readonly flowKey: string
  readonly permissions: ReadonlySet<string>
  readonly turn: WhatsAppCommandTurn
}): Promise<FlowGraphData | undefined> {
  const { flowKey, permissions, turn } = input
  const graph = await turn.deps.graphs.findGraph({ companyId: turn.session.companyId, flowKey })
  if (graph === undefined || graph.key !== turn.deps.graphs.rootFlowKey) return graph

  return filterWhatsAppRootFlowGraph(graph, permissions)
}

async function rejectAnswer(input: {
  readonly context: Record<string, unknown>
  readonly node: FlowNodeData
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { context, node, turn } = input
  const attempts = readInvalidAttempts(context) + 1
  if (attempts >= WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF) {
    await handOff({ context, turn })
    return
  }

  await turn.deps.sessions.setState(turn.session.companyId, turn.phone, turn.session.currentState, {
    ...context,
    [WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY]: attempts,
  })
  await turn.deps.sender.sendText({
    body: node.fallbackMessage ?? WHATSAPP_DEFAULT_FALLBACK_REPLY,
    to: turn.phone,
  })
}

/** Na segunda resposta fora do menu o bot não improvisa: chama uma pessoa (conversation-flow §5). */
async function handOff(input: {
  readonly context: Record<string, unknown>
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  const { turn } = input
  await turn.deps.sessions.requestHuman(turn.session.companyId, turn.phone)
  await clearWhatsAppFlowPosition(input)
  turn.deps.logger.info(WHATSAPP_COMMAND_LOG.handoff, {
    companyId: turn.session.companyId,
    phone: turn.maskedPhone,
  })
  await turn.deps.sender.sendText({ body: WHATSAPP_HANDOFF_REPLY, to: turn.phone })
}

/**
 * T004 — o número ainda não vinculado que manda só o código. A verificação roda **antes** do menu
 * porque é ela que cria o ator; o `from` é o que prova a posse. Qualquer recusa é a mesma resposta
 * neutra: "código errado" daria ao número um oráculo.
 */
async function verifyEntry(input: {
  readonly code: string
  readonly turn: WhatsAppCommandTurn
  readonly verifyPhone: VerifyWhatsAppPhone
}): Promise<void> {
  const { turn } = input
  const { companyId } = turn.session
  const result = await input.verifyPhone({
    code: input.code,
    companyId,
    correlationId: turn.message.id ?? randomUUID(),
    fromPhone: turn.phone,
    now: turn.deps.clock(),
  })
  if (result.status === 'rejected') {
    turn.deps.logger.warn(WHATSAPP_COMMAND_LOG.phoneVerificationRejected, {
      companyId,
      phone: turn.maskedPhone,
      reason: result.reason,
    })
    await sendDeniedReply(turn)
    return
  }

  turn.deps.logger.info(WHATSAPP_COMMAND_LOG.phoneVerified, { companyId, phone: turn.maskedPhone })
  await turn.deps.sender.sendText({
    body: buildWhatsAppPhoneVerifiedReply(result.displayName),
    to: turn.phone,
  })
  await clearWhatsAppFlowPosition({ context: {}, turn })

  /**
   * D2: o menu que vem a seguir precisa da permissão do ator, e o número acabou de deixar de ser
   * "denied" — resolver de novo é a mesma conferência que toda `FlowAction` já faz
   * (`with-authorized-actor.service.ts`), não uma chamada extra por descuido. Se ainda não houver
   * membership (verificado sem vínculo), a resposta é a mesma neutra de D1 — nenhum menu.
   */
  const actor = await turn.deps.resolveActor({
    companyId,
    fromPhone: turn.phone,
    now: turn.deps.clock(),
  })
  if (actor.status === 'denied') {
    await denyTurn({ reason: actor.reason, turn })
    return
  }
  await advanceConversation(turn, actor.context.scope.permissions, false)
}

function readVerificationCode(message: WhatsAppCommandTurn['message']): string | undefined {
  const body = message.text?.body
  if (body === undefined) return undefined
  return WHATSAPP_PHONE_VERIFICATION_CODE_MESSAGE_PATTERN.exec(body)?.[1]
}

async function denyTurn(input: {
  readonly reason: WhatsAppCommandDenialReason
  readonly turn: WhatsAppCommandTurn
}): Promise<void> {
  logDenied(input)
  await sendDeniedReply(input.turn)
}

async function sendDeniedReply(turn: WhatsAppCommandTurn): Promise<void> {
  const reply = turn.deps.rateLimiter.consume({
    key: `denied-reply:${buildLimitKey(turn)}`,
    policy: WHATSAPP_DENIED_REPLY_LIMIT,
  })
  if (!reply.allowed) return

  await turn.deps.sender.sendText({ body: WHATSAPP_DENIED_REPLY, to: turn.phone })
}

function logDenied(input: {
  readonly reason: WhatsAppCommandDenialReason | 'rate_limited'
  readonly turn: WhatsAppCommandTurn
}): void {
  input.turn.deps.logger.warn(WHATSAPP_COMMAND_LOG.denied, {
    companyId: input.turn.session.companyId,
    phone: input.turn.maskedPhone,
    reason: input.reason,
  })
}

/**
 * T005b M4: a chave é a `phone_key`, sem o nono dígito — a Meta alterna as duas grafias, e com a
 * forma canônica elas eram dois baldes. O mapa vive só em memória, por processo (`docs/SECURITY.md`).
 */
function buildLimitKey(turn: WhatsAppCommandTurn): string {
  const phone = toWhatsAppPhone(turn.phone)
  return `${turn.session.companyId}:${phone === undefined ? turn.phone : toWhatsAppPhoneKey(phone)}`
}

function readInvalidAttempts(context: Record<string, unknown>): number {
  const attempts = context[WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY]
  return typeof attempts === 'number' ? attempts : 0
}
