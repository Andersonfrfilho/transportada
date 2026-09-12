/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — o nó que pergunta. A cada passagem ele vê qual parâmetro falta (D4) e pergunta
 * **só ele**, numa mensagem; o que tem uma resposta só (a única série, o único emitente do período)
 * não é perguntado. Com a seleção completa, chama a prévia e renderiza o que ela devolveu.
 */
import type {
  ChannelAdapterInterface,
  FlowActionResult,
} from '@adatechnology/meta-whatsapp-contracts'

import { WHATSAPP_COMMAND_PERIOD_MAX_LENGTH } from '../../database/whatsapp-command.schema.js'
import {
  buildEmitterKey,
  nextSelectionStep,
  readSelectionState,
  type SelectionState,
  type SelectionStep,
} from '../domain/document-selection.policy.js'
import {
  formatVolumetryDetails,
  formatVolumetryHeadline,
} from '../domain/issuance-volumetry.policy.js'
import { WhatsAppCommandDeniedError } from '../domain/whatsapp-command.error.js'
import {
  ISSUANCE_BACK_ANSWER,
  ISSUANCE_CONFIRM_ANSWER_PREFIX,
  ISSUANCE_DUE_DAYS_OPTIONS,
  ISSUANCE_FLOW_CONTEXT_KEY as KEY,
  ISSUANCE_FLOW_NODE,
  ISSUANCE_PERIOD_SKIP_ANSWER,
  ISSUANCE_PREVIEW_TTL_MINUTES,
} from '../domain/whatsapp-issuance-flow.constant.js'
import { WHATSAPP_LIST_BUTTON_TEXT } from '../domain/whatsapp-menu.constant.js'
import { planChoiceMessage, type WhatsAppMenuOption } from '../domain/whatsapp-menu.policy.js'
import {
  buildSelectionCriterion,
  clearSelectionContext,
  type IssuanceFlowActionDependencies,
  listEmittersFor,
  readContextString,
  readDueDays,
  resolveEmitterTaxId,
  tripWindowStart,
} from './issuance-flow-context.service.js'
import type { PreviewDocumentSelectionOutcome } from './preview-document-selection.use-case.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppAuthorizedActionInput,
} from './with-authorized-actor.service.js'

type StepResult =
  | Readonly<{ kind: 'auto'; patch: Record<string, unknown> }>
  | Readonly<{ kind: 'reply'; result: FlowActionResult }>

type StepInput = Readonly<{
  context: Readonly<Record<string, unknown>>
  deps: IssuanceFlowActionDependencies
  input: WhatsAppAuthorizedActionInput
  state: SelectionState
  step: SelectionStep
}>

const tripDay = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

export function createIssuancePromptHandler(
  deps: IssuanceFlowActionDependencies,
): WhatsAppAuthorizedActionHandler {
  return async (input) => {
    const patch: Record<string, unknown> = {}
    for (;;) {
      const context = { ...input.context, ...patch }
      const state = readSelectionState(context)
      const outcome = await promptStep({
        context,
        deps,
        input,
        state,
        step: nextSelectionStep(state),
      })
      if (outcome.kind === 'reply') {
        return { ...outcome.result, context: { ...patch, ...outcome.result.context } }
      }
      Object.assign(patch, outcome.patch)
    }
  }
}

async function promptStep(step: StepInput): Promise<StepResult> {
  switch (step.step) {
    case 'criterion':
      return reply({ next: ISSUANCE_FLOW_NODE.criterionMenu })
    case 'emitter':
    case 'date_emitter':
      return promptEmitter(step)
    case 'series':
      return promptSeries(step)
    case 'first_number':
      return ask(step, 'Qual o número inicial da faixa? Digite só os números.')
    case 'last_number':
      return ask(step, `E o número final? Igual ou maior que ${step.state.firstNumber}.`)
    case 'trip':
      return promptTrip(step)
    case 'start_date':
      return ask(step, 'Qual a data inicial da emissão? Use dd/mm/aaaa.')
    case 'end_date':
      return ask(step, 'E a data final? Use dd/mm/aaaa.')
    case 'complete':
      return runPreview(step)
  }
}

async function promptEmitter(step: StepInput): Promise<StepResult> {
  const companyId = step.input.actor.scope.companyId
  const emitters = await listEmittersFor(step.deps, companyId, step.state)
  const [only] = emitters
  if (only === undefined) {
    const empty =
      step.state.criterion === 'issue_date'
        ? 'Nenhuma nota foi emitida nesse período.'
        : 'Não há notas pendentes de documento agora.'
    return restart(step, empty)
  }
  if (step.step === 'date_emitter' && emitters.length === 1) {
    return { kind: 'auto', patch: { [KEY.emitterKey]: buildEmitterKey(only.taxId) } }
  }
  const options = emitters.map((emitter) => ({
    id: buildEmitterKey(emitter.taxId),
    title: emitter.name,
  }))
  return choose(step, 'De qual emitente são as notas?', options)
}

async function promptSeries(step: StepInput): Promise<StepResult> {
  const companyId = step.input.actor.scope.companyId
  const emitterTaxId = await resolveEmitterTaxId(step.deps, companyId, step.state)
  const series =
    emitterTaxId === undefined ? [] : await step.deps.listPendingSeries({ companyId, emitterTaxId })
  const [only] = series
  if (only === undefined) return restart(step, 'Esse emitente não tem mais notas pendentes.')
  if (series.length === 1) return { kind: 'auto', patch: { [KEY.series]: only } }
  const options = series.map((value) => ({ id: value, title: `Série ${value}` }))
  return choose(step, 'Qual a série das notas?', options)
}

async function promptTrip(step: StepInput): Promise<StepResult> {
  const trips = await step.deps.listRecentTrips({
    companyId: step.input.actor.scope.companyId,
    since: tripWindowStart(step.deps),
  })
  if (trips.length === 0) return restart(step, 'Não há viagens recentes com notas.')
  const options = trips.map((trip) => ({
    id: trip.id,
    title: `${trip.vehiclePlate} · ${tripDay.format(trip.createdAt)}`,
  }))
  return choose(step, 'De qual viagem são as notas?', options)
}

async function runPreview(step: StepInput): Promise<StepResult> {
  const { actor } = step.input
  const emitterTaxId = await resolveEmitterTaxId(step.deps, actor.scope.companyId, step.state)
  const criterion = buildSelectionCriterion(step.state, emitterTaxId)
  if (criterion === undefined) return restart(step, 'Esse emitente não tem mais notas pendentes.')

  const outcome = await step.deps.previewSelection({
    context: actor.scope,
    criterion,
    dueDays: readDueDays(step.context),
    period: readContextString(step.context, KEY.period),
  })
  return renderOutcome(step, outcome)
}

async function renderOutcome(
  step: StepInput,
  outcome: PreviewDocumentSelectionOutcome,
): Promise<StepResult> {
  switch (outcome.kind) {
    case 'needs_due_date':
      return choose(
        step,
        'Qual o vencimento da fatura dos CT-e?',
        ISSUANCE_DUE_DAYS_OPTIONS.map((days) => ({ id: String(days), title: `📅 ${days} dias` })),
        'due_date',
      )
    case 'needs_period':
      return askPeriod(step)
    case 'too_many':
      return restart(
        step,
        `A seleção achou ${outcome.found} notas, acima do limite de ${outcome.limit} por emissão. Escolha um critério mais estreito.`,
      )
    case 'empty':
      return restart(step, 'Nenhuma nota encontrada com esse critério.')
    case 'nothing_to_issue':
      await sendVolumetry(step, outcome.volumetry)
      return restart(step, 'Nenhuma dessas notas pode ser emitida agora.')
    case 'no_membership':
      throw new WhatsAppCommandDeniedError('no_membership')
    case 'previewed':
      await sendVolumetry(step, outcome.volumetry)
      return askConfirmation(step, outcome.requestId)
  }
}

async function sendVolumetry(
  step: StepInput,
  volumetry: Parameters<typeof formatVolumetryHeadline>[0],
): Promise<void> {
  const { channel, session } = step.input
  await channel.sendText(session.whatsappNumber, formatVolumetryHeadline(volumetry))
  const details = formatVolumetryDetails(volumetry)
  if (details !== undefined) await channel.sendText(session.whatsappNumber, details)
}

/** O botão de confirmar carrega o id do pedido congelado (D5), nunca o da mensagem. */
async function askConfirmation(step: StepInput, requestId: string): Promise<StepResult> {
  await step.input.channel.sendInteractiveList({
    body: `Confirma a emissão? A prévia vale por ${ISSUANCE_PREVIEW_TTL_MINUTES} minutos.`,
    buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
    rows: [
      { id: `${ISSUANCE_CONFIRM_ANSWER_PREFIX}${requestId}`, title: '✅ Confirmar' },
      { id: ISSUANCE_BACK_ANSWER, title: '🔙 Voltar' },
    ],
    to: step.input.session.whatsappNumber,
  })
  return reply({
    context: { [KEY.requestId]: requestId, [KEY.step]: undefined },
    next: ISSUANCE_FLOW_NODE.confirmEntry,
  })
}

async function askPeriod(step: StepInput): Promise<StepResult> {
  await step.input.channel.sendInteractiveList({
    body: `Qual o período do serviço, para a descrição da NFS-e? Digite até ${WHATSAPP_COMMAND_PERIOD_MAX_LENGTH} caracteres, ou toque em Pular.`,
    buttonLabel: WHATSAPP_LIST_BUTTON_TEXT,
    rows: [{ id: ISSUANCE_PERIOD_SKIP_ANSWER, title: '⏭️ Pular' }],
    to: step.input.session.whatsappNumber,
  })
  return reply({ context: { [KEY.step]: 'period' }, next: ISSUANCE_FLOW_NODE.paramEntry })
}

async function ask(step: StepInput, question: string): Promise<StepResult> {
  await step.input.channel.sendText(step.input.session.whatsappNumber, question)
  return reply({ context: { [KEY.step]: step.step }, next: ISSUANCE_FLOW_NODE.paramEntry })
}

async function choose(
  step: StepInput,
  body: string,
  options: readonly WhatsAppMenuOption[],
  marker: string = step.step,
): Promise<StepResult> {
  const page = step.context[KEY.listPage]
  await sendDynamicChoice({
    body,
    channel: step.input.channel,
    options,
    page: typeof page === 'number' && page > 0 ? page : 1,
    to: step.input.session.whatsappNumber,
  })
  return reply({ context: { [KEY.step]: marker }, next: ISSUANCE_FLOW_NODE.paramEntry })
}

async function restart(step: StepInput, message: string): Promise<StepResult> {
  await step.input.channel.sendText(step.input.session.whatsappNumber, message)
  return reply({ context: clearSelectionContext(), next: ISSUANCE_FLOW_NODE.criterionMenu })
}

function reply(result: FlowActionResult): StepResult {
  return { kind: 'reply', result }
}

/**
 * ⚠️ `ChannelAdapterInterface` desta instalação é a 0.1.0: sem `sendInteractiveButtons`. Toda lista
 * dinâmica sai como lista — mesma ressalva dos ramos do motorista e do operador.
 */
async function sendDynamicChoice(input: {
  readonly body: string
  readonly channel: ChannelAdapterInterface
  readonly options: readonly WhatsAppMenuOption[]
  readonly page: number
  readonly to: string
}): Promise<void> {
  const plan = planChoiceMessage({
    body: input.body,
    options: input.options,
    page: input.page,
    source: 'dynamic',
  })
  await input.channel.sendInteractiveList({
    body: plan.body,
    buttonLabel: plan.kind === 'buttons' ? WHATSAPP_LIST_BUTTON_TEXT : plan.buttonText,
    rows: [...(plan.kind === 'buttons' ? plan.buttons : plan.rows)],
    to: input.to,
  })
}
