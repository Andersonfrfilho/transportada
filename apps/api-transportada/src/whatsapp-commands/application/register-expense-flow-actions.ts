/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326: **o financeiro lança conta pela conversa direta com a assistente.** Duas ações do fluxo:
 *
 * - `start`: confere o papel, oferece fixa/variável e abre a entrada de respostas;
 * - `router`: uma resposta por vez (`step` no contexto), até o resumo com Confirmar/Corrigir/Cancelar.
 *
 * Grava pelo mesmo caso de uso do painel (`createExpense`, spec 325), só depois do Confirmar. A
 * permissão `expenses.manage` é conferida pelo despachante (`withAuthorizedActor`); aqui se recusa
 * também quem tem papel de motorista, agregado ou ajudante.
 */
import {
  EXPENSE_FLOW_ACTION_KIND,
  EXPENSE_FLOW_ANSWER,
  EXPENSE_FLOW_BLOCKED_ROLES,
  EXPENSE_FLOW_CONTEXT_KEY as KEY,
  EXPENSE_FLOW_NODE as NODE,
  EXPENSE_FLOW_PERMISSION,
  EXPENSE_FLOW_STEP as STEP,
  EXPENSE_NAME_MAX_LENGTH,
  EXPENSE_RECURRENCE_OPTIONS,
  EXPENSE_TEXT,
} from '../domain/whatsapp-expense-flow.constant.js'
import {
  parseExpenseAmount,
  parseExpenseDueDate,
  parseExpenseDueDay,
} from '../domain/whatsapp-expense-input.policy.js'
import { parseMenuPageNavigation } from '../domain/whatsapp-menu.policy.js'
import { sendDynamicChoice } from './whatsapp-dynamic-choice.service.js'
import type {
  WhatsAppAuthorizedActionHandler,
  WhatsAppFlowActionDefinition,
} from './with-authorized-actor.service.js'

type Recurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'

export type ExpenseFlowCategory = {
  readonly active: boolean
  readonly id: string
  readonly name: string
  readonly requiresDriver: boolean
}

export type ExpenseFlowCreateInput = {
  readonly categoryId: string
  readonly billLocation?: string
  readonly causedByDriverId?: string
  readonly causedByName?: string
  readonly causedByUserId?: string
  readonly channel: 'whatsapp'
  readonly companyId: string
  readonly createdBy: string
  readonly dueDate?: string
  readonly dueDay?: number
  readonly expectedAmount: string
  readonly kind: 'fixed' | 'variable'
  readonly name: string
  readonly recurrence?: Recurrence
  readonly today: string
}

export type ExpenseFlowDependencies = {
  readonly createExpense: (input: ExpenseFlowCreateInput) => Promise<unknown>
  /** Pessoas da frota ativas (motorista, agregado, ajudante): só rótulo informativo da conta. */
  readonly listPeople?: (input: {
    readonly companyId: string
  }) => Promise<
    readonly { readonly id: string; readonly kind: 'driver' | 'user'; readonly name: string }[]
  >
  readonly listCategories: (input: {
    readonly companyId: string
  }) => Promise<readonly ExpenseFlowCategory[]>
  /** `yyyy-mm-dd` civil de America/Sao_Paulo. */
  readonly today: () => string
}

type Input = Parameters<WhatsAppAuthorizedActionHandler>[0]

const POLICY = { permission: EXPENSE_FLOW_PERMISSION, scope: 'company' } as const

const CLEARED = {
  [KEY.amount]: undefined,
  [KEY.answer]: undefined,
  [KEY.categoryId]: undefined,
  [KEY.billLocation]: undefined,
  [KEY.causedById]: undefined,
  [KEY.causedByName]: undefined,
  [KEY.dueDate]: undefined,
  [KEY.dueDay]: undefined,
  [KEY.kind]: undefined,
  [KEY.listPage]: undefined,
  [KEY.name]: undefined,
  [KEY.recurrence]: undefined,
  [KEY.step]: undefined,
}

const readString = (context: Record<string, unknown>, key: string): string | undefined => {
  const value = context[key]
  return typeof value === 'string' ? value : undefined
}

const ASK_AGAIN = (step: string, extra: Record<string, unknown> = {}) => ({
  context: { ...extra, [KEY.answer]: undefined, [KEY.step]: step },
  next: NODE.entry,
})

const END = { context: CLEARED, next: 'menu' }

export function createExpenseFlowActions(
  deps: ExpenseFlowDependencies,
): readonly WhatsAppFlowActionDefinition[] {
  const offerable = async (companyId: string) =>
    (await deps.listCategories({ companyId })).filter(
      (category) => category.active && !category.requiresDriver,
    )

  async function askKind(input: Input) {
    await sendDynamicChoice({
      body: EXPENSE_TEXT.kindChoice,
      channel: input.channel,
      options: [
        { id: 'fixed', title: '🔁 Fixa' },
        { id: 'variable', title: '🧾 Variável' },
      ],
      page: 1,
      to: input.session.whatsappNumber,
    })
    return ASK_AGAIN(STEP.kind, CLEARED)
  }

  async function askCategory(input: Input, page: number) {
    const categories = await offerable(input.actor.scope.companyId)
    const shown = await sendDynamicChoice({
      body: EXPENSE_TEXT.categoryChoice,
      channel: input.channel,
      options: categories.map((category) => ({ id: category.id, title: category.name })),
      page,
      to: input.session.whatsappNumber,
    })
    if (!shown) {
      await input.channel.sendText(input.session.whatsappNumber, EXPENSE_TEXT.noCategories)
      return END
    }
    return ASK_AGAIN(STEP.category)
  }

  const people = async (companyId: string) =>
    deps.listPeople === undefined ? [] : await deps.listPeople({ companyId })

  /** As perguntas de quem causou e de onde a conta está só existem com a lista de pessoas ligada (produção). */
  async function askCausedByOrConfirm(input: Input, context: Record<string, unknown>, page = 1) {
    if (deps.listPeople === undefined) return confirmWith(input, context)
    const everyone = await people(input.actor.scope.companyId)
    await sendDynamicChoice({
      body: EXPENSE_TEXT.causedByChoice,
      channel: input.channel,
      options: [
        { id: EXPENSE_FLOW_ANSWER.skip, title: '⏭️ Pular' },
        { id: EXPENSE_FLOW_ANSWER.otherName, title: '✍️ Digitar um nome' },
        ...everyone.map((person) => ({ id: `${person.kind}:${person.id}`, title: person.name })),
      ],
      page,
      to: input.session.whatsappNumber,
    })
    return ASK_AGAIN(STEP.causedBy, context)
  }

  async function askBillLocation(input: Input, context: Record<string, unknown>) {
    await sendDynamicChoice({
      body: EXPENSE_TEXT.billLocationAsk,
      channel: input.channel,
      options: [{ id: EXPENSE_FLOW_ANSWER.skip, title: '⏭️ Pular' }],
      page: 1,
      to: input.session.whatsappNumber,
    })
    return ASK_AGAIN(STEP.billLocation, context)
  }

  /** `askConfirm` devolve só o passo; o que já foi respondido segue no contexto. */
  async function confirmWith(input: Input, context: Record<string, unknown>) {
    const asked = await askConfirm(input, context)
    return { ...asked, context: { ...context, ...asked.context } }
  }

  async function askRecurrence(input: Input) {
    await sendDynamicChoice({
      body: EXPENSE_TEXT.recurrenceChoice,
      channel: input.channel,
      options: EXPENSE_RECURRENCE_OPTIONS.map(([id, title]) => ({ id, title })),
      page: 1,
      to: input.session.whatsappNumber,
    })
    return ASK_AGAIN(STEP.recurrence)
  }

  async function askConfirm(input: Input, context: Record<string, unknown>) {
    const categories = await offerable(input.actor.scope.companyId)
    const category = categories.find((item) => item.id === readString(context, KEY.categoryId))
    const kind = readString(context, KEY.kind)
    const recurrence = EXPENSE_RECURRENCE_OPTIONS.find(
      ([id]) => id === readString(context, KEY.recurrence),
    )
    const causedById = readString(context, KEY.causedById)
    const causedBy =
      readString(context, KEY.causedByName) ??
      (causedById === undefined
        ? undefined
        : (await people(input.actor.scope.companyId)).find(
            (person) => `${person.kind}:${person.id}` === causedById,
          )?.name)
    const billLocation = readString(context, KEY.billLocation)
    const when =
      kind === 'fixed'
        ? `${recurrence?.[1].replace('📆 ', '') ?? ''}, todo dia ${readString(context, KEY.dueDay) ?? ''}`
        : `vence em ${formatDate(readString(context, KEY.dueDate) ?? '')}`
    const summary = [
      '📋 *Confira a conta*',
      '',
      `Nome: ${readString(context, KEY.name) ?? ''}`,
      `Tipo: ${kind === 'fixed' ? 'Fixa' : 'Variável'}`,
      `Categoria: ${category?.name ?? ''}`,
      `Valor: R$ ${formatBrl(readString(context, KEY.amount) ?? '0.00')}`,
      `Vencimento: ${when}`,
      ...(causedBy === undefined ? [] : [`Quem causou: ${causedBy}`]),
      ...(billLocation === undefined ? [] : [`Onde está: ${billLocation}`]),
    ].join('\n')
    await sendDynamicChoice({
      body: summary,
      channel: input.channel,
      options: [
        { id: EXPENSE_FLOW_ANSWER.confirm, title: '✅ Confirmar' },
        { id: EXPENSE_FLOW_ANSWER.fix, title: '✏️ Corrigir' },
        { id: EXPENSE_FLOW_ANSWER.cancel, title: '❌ Cancelar' },
      ],
      page: 1,
      to: input.session.whatsappNumber,
    })
    return ASK_AGAIN(STEP.confirm)
  }

  const start: WhatsAppAuthorizedActionHandler = async (input) => {
    const blocked = input.actor.scope.roles.some((role) =>
      (EXPENSE_FLOW_BLOCKED_ROLES as readonly string[]).includes(role),
    )
    if (blocked) {
      await input.channel.sendText(input.session.whatsappNumber, EXPENSE_TEXT.blocked)
      return END
    }
    return askKind(input)
  }

  const router: WhatsAppAuthorizedActionHandler = async (input) => {
    const { actor, channel, context, session } = input
    const to = session.whatsappNumber
    const answer = readString(context, KEY.answer)?.trim()
    const step = readString(context, KEY.step)
    if (answer === undefined || step === undefined) return END

    const reject = async (text: string) => {
      await channel.sendText(to, text)
      return ASK_AGAIN(step)
    }

    if (answer === EXPENSE_FLOW_ANSWER.cancel || answer.toLowerCase() === 'cancelar') {
      await channel.sendText(to, EXPENSE_TEXT.cancelled)
      return END
    }

    if (step === STEP.kind) {
      if (answer !== 'fixed' && answer !== 'variable') return askKind(input)
      await channel.sendText(to, EXPENSE_TEXT.name)
      return ASK_AGAIN(STEP.name, { [KEY.kind]: answer })
    }

    if (step === STEP.name) {
      if (answer.length < 2 || answer.length > EXPENSE_NAME_MAX_LENGTH) {
        return reject(EXPENSE_TEXT.nameInvalid)
      }
      const asked = await askCategory(input, 1)
      return asked === END ? END : { ...asked, context: { ...asked.context, [KEY.name]: answer } }
    }

    if (step === STEP.category) {
      const page = parseMenuPageNavigation(answer)
      if (page !== undefined) return askCategory(input, page)
      const categories = await offerable(actor.scope.companyId)
      if (!categories.some((category) => category.id === answer)) {
        return reject(EXPENSE_TEXT.categoryInvalid)
      }
      await channel.sendText(to, EXPENSE_TEXT.amount)
      return ASK_AGAIN(STEP.amount, { [KEY.categoryId]: answer })
    }

    if (step === STEP.amount) {
      const amount = parseExpenseAmount(answer)
      if (amount === undefined) return reject(EXPENSE_TEXT.amountInvalid)
      if (readString(context, KEY.kind) === 'fixed') {
        const asked = await askRecurrence(input)
        return { ...asked, context: { ...asked.context, [KEY.amount]: amount } }
      }
      await channel.sendText(to, EXPENSE_TEXT.dueDate)
      return ASK_AGAIN(STEP.dueDate, { [KEY.amount]: amount })
    }

    if (step === STEP.dueDate) {
      const dueDate = parseExpenseDueDate(answer, deps.today())
      if (dueDate === undefined) return reject(EXPENSE_TEXT.dueDateInvalid)
      return askCausedByOrConfirm(input, { ...context, [KEY.dueDate]: dueDate })
    }

    if (step === STEP.recurrence) {
      if (!EXPENSE_RECURRENCE_OPTIONS.some(([id]) => id === answer)) {
        return reject(EXPENSE_TEXT.recurrenceInvalid)
      }
      await channel.sendText(to, EXPENSE_TEXT.dueDay)
      return ASK_AGAIN(STEP.dueDay, { [KEY.recurrence]: answer })
    }

    if (step === STEP.dueDay) {
      const day = parseExpenseDueDay(answer)
      if (day === undefined) return reject(EXPENSE_TEXT.dueDayInvalid)
      return askCausedByOrConfirm(input, { ...context, [KEY.dueDay]: String(day) })
    }

    if (step === STEP.causedBy) {
      const page = parseMenuPageNavigation(answer)
      if (page !== undefined) return askCausedByOrConfirm(input, context, page)
      if (answer === EXPENSE_FLOW_ANSWER.skip || answer.toLowerCase() === 'pular') {
        return askBillLocation(input, context)
      }
      if (answer === EXPENSE_FLOW_ANSWER.otherName) {
        await channel.sendText(to, EXPENSE_TEXT.causedByNameAsk)
        return ASK_AGAIN(STEP.causedByName, context)
      }
      const everyone = await people(actor.scope.companyId)
      if (!everyone.some((person) => `${person.kind}:${person.id}` === answer)) {
        return reject(EXPENSE_TEXT.causedByInvalid)
      }
      return askBillLocation(input, { ...context, [KEY.causedById]: answer })
    }

    if (step === STEP.causedByName) {
      if (answer.length < 2 || answer.length > EXPENSE_NAME_MAX_LENGTH + 40) {
        return reject(EXPENSE_TEXT.nameInvalid)
      }
      return askBillLocation(input, { ...context, [KEY.causedByName]: answer })
    }

    if (step === STEP.billLocation) {
      if (answer === EXPENSE_FLOW_ANSWER.skip || answer.toLowerCase() === 'pular') {
        return confirmWith(input, context)
      }
      if (answer.length > 120) return reject(EXPENSE_TEXT.billLocationAsk)
      return confirmWith(input, { ...context, [KEY.billLocation]: answer })
    }

    if (step === STEP.confirm) {
      if (answer === EXPENSE_FLOW_ANSWER.fix) return askKind(input)
      if (answer !== EXPENSE_FLOW_ANSWER.confirm) return reject(EXPENSE_TEXT.categoryInvalid)
      return save(input)
    }
    return END
  }

  async function save(input: Input) {
    const { actor, channel, context, session } = input
    const to = session.whatsappNumber
    const kind = readString(context, KEY.kind)
    const name = readString(context, KEY.name)
    const categoryId = readString(context, KEY.categoryId)
    const amount = readString(context, KEY.amount)
    const recurrence = readString(context, KEY.recurrence) as Recurrence | undefined
    const dueDate = readString(context, KEY.dueDate)
    const dueDay = Number(readString(context, KEY.dueDay))
    const causedById = readString(context, KEY.causedById)
    const causedByName = readString(context, KEY.causedByName)
    const billLocation = readString(context, KEY.billLocation)
    const complete =
      (kind === 'fixed' || kind === 'variable') &&
      name !== undefined &&
      categoryId !== undefined &&
      amount !== undefined &&
      (kind === 'fixed' ? recurrence !== undefined && dueDay >= 1 : dueDate !== undefined)
    if (!complete) return END
    const schedule =
      kind === 'fixed'
        ? { dueDay, recurrence: recurrence as Recurrence }
        : { dueDate: dueDate as string }
    try {
      await deps.createExpense({
        categoryId,
        ...(billLocation === undefined ? {} : { billLocation }),
        ...(causedByName === undefined ? {} : { causedByName }),
        ...(causedById?.startsWith('driver:') === true
          ? { causedByDriverId: causedById.slice('driver:'.length) }
          : {}),
        ...(causedById?.startsWith('user:') === true
          ? { causedByUserId: causedById.slice('user:'.length) }
          : {}),
        channel: 'whatsapp',
        companyId: actor.scope.companyId,
        createdBy: actor.scope.userId,
        expectedAmount: amount,
        kind,
        name,
        today: deps.today(),
        ...schedule,
      })
    } catch {
      await channel.sendText(to, EXPENSE_TEXT.createFailed)
      return END
    }
    await channel.sendText(to, EXPENSE_TEXT.saved(name))
    return END
  }

  return [
    { handler: start, kind: EXPENSE_FLOW_ACTION_KIND.start, policy: POLICY },
    { handler: router, kind: EXPENSE_FLOW_ACTION_KIND.router, policy: POLICY },
  ]
}

/** `2026-11-20` → `20/11/2026`. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/** `2300.00` → `2.300,00`. */
function formatBrl(amount: string): string {
  const [whole = '0', cents = '00'] = amount.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')},${cents}`
}
