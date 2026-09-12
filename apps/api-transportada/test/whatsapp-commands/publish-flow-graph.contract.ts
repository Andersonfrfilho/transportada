/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T008 — o comando de republicação: idempotente, nunca sobrescreve sem histórico, aborta
 * grafo inválido antes de abrir transação, e propaga `OptimisticLockError` intacto quando o `save`
 * do módulo recusa. A transação de verdade (histórico + linha viva no mesmo commit) e o trigger
 * append-only são cobertos com Postgres em
 * `test/integration/whatsapp-flow-graph-publish.integration.ts`.
 */
import { describe, expect, test } from 'bun:test'
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'
import { OptimisticLockError } from '@adatechnology/meta-whatsapp-module'

import {
  createPublishWhatsAppFlowGraphUseCase,
  previewWhatsAppFlowGraphPublication,
  WhatsAppFlowGraphInvalidError,
} from '../../src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.js'
import type {
  WhatsAppFlowGraphHistorySnapshot,
  WhatsAppFlowGraphModulePort,
} from '../../src/whatsapp-commands/application/whatsapp-flow-graph-publisher.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000f8'

const GRAPH_V1: FlowGraphData = {
  key: 'root',
  label: 'Menu',
  nodes: {
    about: { directMessage: 'sobre', id: 'about', type: 'action' },
    menu: {
      fallbackMessage: 'Escolha.',
      id: 'menu',
      next: { byAnswer: { about: 'about' }, default: 'menu' },
      options: [['about', 'ℹ️ Sobre']],
      question: 'O que você quer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}

const INVALID_MENU_NODE = { ...GRAPH_V1.nodes.menu! }
delete (INVALID_MENU_NODE as { fallbackMessage?: string }).fallbackMessage

const INVALID_GRAPH: FlowGraphData = {
  ...GRAPH_V1,
  nodes: { ...GRAPH_V1.nodes, menu: INVALID_MENU_NODE },
}

function createFakeModule(seed?: FlowGraphData) {
  const stored: { value: FlowGraphData | undefined } = { value: seed }
  const module: WhatsAppFlowGraphModulePort = {
    async get() {
      return stored.value
    },
    async create(_companyId, graph) {
      const created: FlowGraphData = { ...graph, version: 1 }
      stored.value = created
      return created
    },
    async save(_companyId, graph, expectedVersion) {
      if (stored.value?.version !== expectedVersion) throw new Error('OptimisticLockError')
      const saved: FlowGraphData = { ...graph, version: expectedVersion + 1 }
      stored.value = saved
      return saved
    },
  }
  return { module, stored }
}

function createFakeHistory() {
  const recorded: WhatsAppFlowGraphHistorySnapshot[] = []
  return {
    history: {
      record: async (snapshot: WhatsAppFlowGraphHistorySnapshot) => void recorded.push(snapshot),
    },
    recorded,
  }
}

describe('publishWhatsAppFlowGraph', () => {
  test('sem grafo publicado, cria a versão 1 — nada entra no histórico ainda', async () => {
    const { module, stored } = createFakeModule(undefined)
    const { history, recorded } = createFakeHistory()
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const outcome = await publish({
      companyId: COMPANY_ID,
      graph: GRAPH_V1,
      publishedBy: 'code',
      source: 'code',
    })

    expect(outcome).toEqual({ graph: { ...GRAPH_V1, version: 1 }, kind: 'created' })
    expect(stored.value?.version).toBe(1)
    // Grafo novo não tem "versão atual" a guardar — o histórico nasce no próximo save.
    expect(recorded).toEqual([])
  })

  test('grafo igual ao publicado é idempotente: não grava histórico, versão não sobe', async () => {
    const { module, stored } = createFakeModule({ ...GRAPH_V1, version: 3 })
    const { history, recorded } = createFakeHistory()
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const outcome = await publish({
      companyId: COMPANY_ID,
      graph: GRAPH_V1,
      publishedBy: 'code',
      source: 'code',
    })

    expect(outcome).toEqual({ graph: { ...GRAPH_V1, version: 3 }, kind: 'unchanged' })
    expect(stored.value?.version).toBe(3)
    expect(recorded).toEqual([])
  })

  test('grafo diferente do publicado grava a versão atual no histórico antes de sobrescrever', async () => {
    const current: FlowGraphData = { ...GRAPH_V1, label: 'Menu antigo', version: 5 }
    const { module, stored } = createFakeModule(current)
    const { history, recorded } = createFakeHistory()
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const outcome = await publish({
      companyId: COMPANY_ID,
      graph: GRAPH_V1,
      publishedBy: 'code',
      source: 'code',
    })

    expect(outcome.kind).toBe('updated')
    expect(outcome.graph.version).toBe(6)
    expect(stored.value?.version).toBe(6)
    expect(recorded).toHaveLength(1)
    // A linha gravada no histórico é a que ESTAVA viva, não a nova.
    expect(recorded[0]?.graph).toEqual(current)
  })

  test('grafo inválido para o WhatsApp nunca chega a abrir transação', async () => {
    let opened = false
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => {
        opened = true
        return work({
          history: { record: async () => undefined },
          module: createFakeModule().module,
        })
      },
    })

    const failure = await publish({
      companyId: COMPANY_ID,
      graph: INVALID_GRAPH,
      publishedBy: 'code',
      source: 'code',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(WhatsAppFlowGraphInvalidError)
    expect((failure as WhatsAppFlowGraphInvalidError).violations).toEqual([
      { nodeId: 'menu', rule: 'missing_fallback_message' },
    ])
    expect(opened).toBeFalse()
  })

  test('conflito de versão sobe intacto — quem chama decide se tenta de novo', async () => {
    const current: FlowGraphData = { ...GRAPH_V1, version: 7 }
    const { history } = createFakeHistory()
    const module: WhatsAppFlowGraphModulePort = {
      async get() {
        return current
      },
      async create() {
        throw new Error('não deveria criar: já existe grafo publicado')
      },
      async save() {
        // Outra publicação avançou a versão entre o `get` e o `save` desta.
        throw new OptimisticLockError(GRAPH_V1.key)
      },
    }
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const failure = await publish({
      companyId: COMPANY_ID,
      graph: { ...GRAPH_V1, label: 'Outro rótulo' },
      publishedBy: 'code',
      source: 'code',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(OptimisticLockError)
  })
})

describe('previewWhatsAppFlowGraphPublication', () => {
  test('devolve o diff e as violações sem gravar nada', async () => {
    const current: FlowGraphData = { ...GRAPH_V1, label: 'Menu antigo', version: 2 }
    const { module } = createFakeModule(current)

    const preview = await previewWhatsAppFlowGraphPublication({
      companyId: COMPANY_ID,
      graph: GRAPH_V1,
      module,
    })

    expect(preview.violations).toEqual([])
    expect(preview.current).toEqual(current)
    expect(preview.diff.labelChanged).toBeTrue()
    expect(preview.diff.isEqual).toBeFalse()
  })
})
