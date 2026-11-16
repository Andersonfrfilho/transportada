/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A conversa inteira de "Lançar conta" pelo Evolution, na composição real: grafo raiz do código, FlowInterpreter do
 * pacote, ações de contas de verdade, despachante, canal numerado e assistente. Só o banco (sessão, categorias, gravação)
 * e o envio são fakes. Em 16/11/2026 o "1" de "Fixa/Variável" voltava à mesma pergunta: o texto "Responda à pergunta
 * acima." apagava as linhas lembradas e a resposta chegava como "1" cru ao fluxo, que só entende o id.
 */
import { describe, expect, test } from 'bun:test'
import type { SessionRepository } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { createExpenseFlowActions } from '../../src/whatsapp-commands/application/register-expense-flow-actions.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createEvolutionAssistantRegistry } from '../../src/whatsapp-commands/infrastructure/evolution-assistant.factory.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000041'
const PHONE = '5516999990001'

async function actor() {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: ['expenses.manage'],
        membershipId: '00000000-0000-4000-8000-000000000043',
        roles: ['finance'],
      }),
    },
  })
  const context = await tenantContext.resolveCompanyForUser({
    channel: 'whatsapp',
    companyId: COMPANY_ID,
    userId: '00000000-0000-4000-8000-000000000042',
  })
  if (context === null) throw new Error('fixture sem contexto')
  return { context, status: 'authorized' as const }
}

/** A linha de sessão em memória, com a forma que o `SessionRepository` do módulo devolve. */
function memorySessions() {
  const now = new Date('2026-11-16T10:50:00.000Z')
  const row = {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {} as Record<string, unknown>,
    createdAt: now,
    currentNodeId: null as null | string,
    currentState: 'idle',
    flowKey: null as null | string,
    humanRequestedAt: null,
    id: 'S1',
    lastActivity: now,
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: now,
    whatsappNumber: PHONE,
  }
  return {
    async getContext() {
      return row
    },
    async getOrCreate() {
      return row
    },
    async requestHuman() {},
    async setFlowPosition(_c: string, _n: string, flowKey: null | string, node: null | string) {
      row.flowKey = flowKey
      row.currentNodeId = node
    },
    async setState(_c: string, _n: string, state: string, context?: Record<string, unknown>) {
      row.currentState = state
      row.context = context ?? {}
    },
  }
}

function setup() {
  const sent: string[] = []
  const created: Record<string, unknown>[] = []
  const expenseActions = createExpenseFlowActions({
    createExpense: async (input) => {
      created.push(input as unknown as Record<string, unknown>)
    },
    listCategories: async () => [
      { active: true, id: 'CAT1', name: 'Aluguel', requiresDriver: false },
      { active: true, id: 'CAT2', name: 'Seguro', requiresDriver: false },
    ],
    today: () => '2026-11-16',
  })
  const registry = createEvolutionAssistantRegistry({
    authorization: new AuthorizationService(),
    clock: () => new Date('2026-11-16T10:50:00.000Z'),
    flowActions: expenseActions,
    graphs: createStaticWhatsAppFlowGraphProvider({
      graphs: [WHATSAPP_ROOT_FLOW_GRAPH],
      rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
    }),
    logger: { error() {}, info() {}, warn() {} },
    rateLimiter: createRateLimiter(),
    resolveActor: actor,
    send: ({ text }) => {
      sent.push(text)
    },
    sessions: memorySessions() as unknown as SessionRepository,
  })
  const assistant = registry.forCompany(COMPANY_ID)
  let id = 0
  /** A pessoa responde; devolve o que o bot disse nesse turno. */
  const say = async (text: string) => {
    const before = sent.length
    await assistant.handle({ phone: PHONE, providerMessageId: `M${(id += 1)}`, text })
    return sent.slice(before).join('\n')
  }
  const open = async () => {
    const before = sent.length
    await assistant.start({ phone: PHONE, providerMessageId: `M${(id += 1)}` })
    return sent.slice(before).join('\n')
  }
  return { assistant, created, open, say, sent }
}

describe('lançar conta pelo Evolution, do menu à gravação', () => {
  test('conta fixa: o número escolhe a opção em cada pergunta e a conta é gravada', async () => {
    const t = setup()
    expect(await t.open()).toContain('Que tipo de conta você quer lançar?')

    // O caso do relato: "1" = Fixa tem de andar, não repetir a pergunta.
    const afterKind = await t.say('1')
    expect(afterKind).not.toContain('Que tipo de conta')

    expect(await t.say('Aluguel do galpão')).toContain('*1* - ')
    expect(await t.say('1')).toContain('valor')
    const afterAmount = await t.say('4500')
    expect(afterAmount).toContain('*1* - ')
    await t.say('1')
    const confirm = await t.say('5')
    expect(confirm).toContain('Aluguel do galpão')
    expect(confirm).toContain('*1* - ')
    expect(t.created).toEqual([])
    await t.say('1')
    expect(t.created).toHaveLength(1)
    expect(t.created[0]).toMatchObject({
      categoryId: 'CAT1',
      channel: 'whatsapp',
      companyId: COMPANY_ID,
      expectedAmount: '4500.00',
      kind: 'fixed',
      name: 'Aluguel do galpão',
    })
    expect(await t.assistant.isActive({ phone: PHONE })).toBe(false)
  })

  test('conta variável: nome, categoria, valor e vencimento, e "2" é Variável', async () => {
    const t = setup()
    await t.open()
    await t.say('2')
    await t.say('Troca de pneus')
    await t.say('2')
    await t.say('2300')
    await t.say('20/11')
    for (let step = 0; step < 4 && t.created.length === 0; step += 1) await t.say('1')
    expect(t.created[0]).toMatchObject({
      categoryId: 'CAT2',
      dueDate: '2026-11-20',
      expectedAmount: '2300.00',
      kind: 'variable',
    })
  })

  test('número fora da lista repete a pergunta uma vez e "sair" cancela sem gravar', async () => {
    const t = setup()
    await t.open()
    expect(await t.say('9')).toContain('Que tipo de conta')
    expect(await t.say('sair')).toContain('cancelada')
    expect(t.created).toEqual([])
    expect(await t.assistant.isActive({ phone: PHONE })).toBe(false)
  })
})
