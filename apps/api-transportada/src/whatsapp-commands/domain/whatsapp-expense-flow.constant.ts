/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 326 — o ramo "Lançar conta" da conversa direta. Ids de nó, `actionKind`, chaves de contexto e
 * falas num lugar só: o grafo e as FlowActions importam daqui.
 *
 * ⚠️ O `context` da sessão é jsonb persistido. Aqui entram o nome digitado e o valor da conta
 * (precisam sobreviver até a confirmação) e ids opacos; nada que seja relido a cada renderização.
 */
export const EXPENSE_FLOW_PERMISSION = 'expenses.manage'

/** Quem tem um destes papéis nunca lança conta pelo WhatsApp (regra do Anderson, spec 326). */
export const EXPENSE_FLOW_BLOCKED_ROLES = ['driver', 'aggregate', 'helper'] as const

export const EXPENSE_FLOW_ACTION_KIND = {
  router: 'expense.router',
  start: 'expense.start',
} as const

export const EXPENSE_FLOW_NODE = {
  entry: 'expense_entry',
  router: 'expense_router',
  start: 'expense_start',
} as const

export const EXPENSE_FLOW_CONTEXT_KEY = {
  amount: 'expenseAmount',
  answer: 'expenseAnswer',
  categoryId: 'expenseCategoryId',
  billLocation: 'expenseBillLocation',
  causedById: 'expenseCausedById',
  causedByName: 'expenseCausedByName',
  dueDate: 'expenseDueDate',
  dueDay: 'expenseDueDay',
  kind: 'expenseKind',
  listPage: 'expenseListPage',
  name: 'expenseName',
  recurrence: 'expenseRecurrence',
  step: 'expenseStep',
} as const

export const EXPENSE_FLOW_STEP = {
  amount: 'amount',
  billLocation: 'bill_location',
  category: 'category',
  causedBy: 'caused_by',
  causedByName: 'caused_by_name',
  confirm: 'confirm',
  dueDate: 'due_date',
  dueDay: 'due_day',
  kind: 'kind',
  name: 'name',
  recurrence: 'recurrence',
} as const

export const EXPENSE_FLOW_ANSWER = {
  cancel: 'cancel',
  confirm: 'confirm',
  fix: 'fix',
  otherName: 'other_name',
  skip: 'skip',
} as const

export const EXPENSE_RECURRENCE_OPTIONS = [
  ['monthly', '📆 Mensal'],
  ['bimonthly', '📆 Bimestral'],
  ['quarterly', '📆 Trimestral'],
  ['yearly', '📆 Anual'],
] as const

export const EXPENSE_NAME_MAX_LENGTH = 80

export const EXPENSE_TEXT = {
  amount: 'Qual o valor? Por exemplo: 1500 ou 1.500,50',
  amountInvalid: 'Não entendi o valor. Digite só números, por exemplo: 1500 ou 1.500,50',
  blocked: 'Lançar conta não está disponível para o seu perfil.',
  cancelled: 'Certo, não lancei nada.',
  categoryChoice: 'Em qual categoria?',
  causedByChoice:
    'Quem causou esta conta, se alguém causou? É opcional. Escolha a pessoa ou toque em Pular.',
  billLocationAsk:
    'Onde está a conta agora? Por exemplo: com a Andréia, ou fatura do cartão. É opcional: toque em Pular ou escreva.',
  causedByNameAsk: 'Digite o nome de quem causou.',
  causedByInvalid: 'Escolha uma pessoa da lista acima ou toque em Pular.',
  categoryInvalid: 'Escolha uma categoria da lista acima.',
  createFailed: 'Não consegui lançar a conta agora. Confira em Contas, no painel.',
  dueDate: 'Qual o vencimento? Por exemplo: 20/11, 20/11/2026, hoje ou amanhã.',
  dueDateInvalid: 'Não entendi a data. Use 20/11, 20/11/2026, hoje ou amanhã.',
  dueDay: 'Em que dia do mês ela vence? De 1 a 31.',
  dueDayInvalid: 'Digite o dia do mês, de 1 a 31.',
  kindChoice: 'Que tipo de conta você quer lançar?',
  name: 'Qual o nome da conta? Por exemplo: Aluguel do galpão.',
  nameInvalid: `O nome precisa ter de 2 a ${EXPENSE_NAME_MAX_LENGTH} letras. Digite de novo.`,
  noCategories: 'Não há categoria ativa para lançar. Cadastre uma em Contas, no painel.',
  recurrenceChoice: 'Com que frequência ela vence?',
  recurrenceInvalid: 'Escolha a frequência da lista acima.',
  saved: (name: string) =>
    `✅ Conta *${name}* lançada. Para lançar outra, toque em "Lançar conta" no menu.`,
} as const
