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

import { botSpeechNodeId } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import {
  createPublishWhatsAppFlowGraphUseCase,
  previewWhatsAppFlowGraphPublication,
  WhatsAppFlowGraphInvalidError,
  WhatsAppFlowGraphPanelEditedError,
  WhatsAppFlowGraphUnknownOverwriteKeyError,
} from '../../src/whatsapp-commands/application/publish-whatsapp-flow-graph.use-case.js'
import type {
  WhatsAppFlowGraphHistoryPort,
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

function createFakeHistory(initialBaseline?: FlowGraphData, hasPanelEdits = false) {
  const recorded: WhatsAppFlowGraphHistorySnapshot[] = []
  const baselines: FlowGraphData[] = initialBaseline === undefined ? [] : [initialBaseline]
  const history: WhatsAppFlowGraphHistoryPort = {
    hasPanelEdits: async () => hasPanelEdits,
    readCodeBaseline: async () => baselines.at(-1),
    record: async (snapshot: WhatsAppFlowGraphHistorySnapshot) => void recorded.push(snapshot),
    recordCodeBaseline: async ({ graph }) => void baselines.push(graph),
  }
  return { baselines, history, recorded }
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
          history: createFakeHistory().history,
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
      history: createFakeHistory().history,
      module,
    })

    expect(preview.violations).toEqual([])
    expect(preview.current).toEqual(current)
    expect(preview.diff.labelChanged).toBeTrue()
    expect(preview.diff.isEqual).toBeFalse()
  })
})

describe('republicação das falas do bot (spec 300 T6.1)', () => {
  const EDITED_ID = botSpeechNodeId('tripUnavailable')
  const UNEDITED_ID = botSpeechNodeId('operatorNoTrips')
  const EMPTY_ID = botSpeechNodeId('groupRegisterFailed')

  function speechGraph(texts: Record<string, string>, version: number): FlowGraphData {
    const nodes: FlowGraphData['nodes'] = {}
    for (const [id, directMessage] of Object.entries(texts)) {
      nodes[id] = { directMessage, id, type: 'action' }
    }
    return { ...GRAPH_V1, nodes, version }
  }

  async function republish(input: {
    baseline?: FlowGraphData
    live: FlowGraphData
    next: FlowGraphData
  }) {
    const { module } = createFakeModule(input.live)
    const { baselines, history } = createFakeHistory(input.baseline)
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })
    const outcome = await publish({
      companyId: COMPANY_ID,
      graph: input.next,
      publishedBy: 'code',
      source: 'code',
    })
    return { baselines, outcome }
  }

  test('nó editado fica, nó igual ao último publicado pelo código é regravado, nó vazio e novo recebem o padrão', async () => {
    const baseline = speechGraph(
      { [EDITED_ID]: 'Padrão antigo.', [UNEDITED_ID]: 'Padrão antigo.' },
      2,
    )
    const live = speechGraph(
      { [EDITED_ID]: 'Editada pela empresa.', [UNEDITED_ID]: 'Padrão antigo.', [EMPTY_ID]: '  ' },
      2,
    )
    const next = speechGraph(
      {
        [EDITED_ID]: 'Padrão novo.',
        [UNEDITED_ID]: 'Padrão novo.',
        [EMPTY_ID]: 'Padrão novo.',
        [botSpeechNodeId('operatorNoTrips') + '_extra']: 'Nó novo.',
      },
      1,
    )

    const { baselines, outcome } = await republish({ baseline, live, next })

    const texts = Object.fromEntries(
      Object.entries(outcome.graph.nodes).map(([id, node]) => [id, node.directMessage]),
    )
    expect(texts).toEqual({
      [EDITED_ID]: 'Editada pela empresa.',
      [UNEDITED_ID]: 'Padrão novo.',
      [EMPTY_ID]: 'Padrão novo.',
      [botSpeechNodeId('operatorNoTrips') + '_extra']: 'Nó novo.',
    })
    expect(baselines.at(-1)?.nodes[EDITED_ID]?.directMessage).toBe('Padrão antigo.')
    expect(baselines.at(-1)?.nodes[UNEDITED_ID]?.directMessage).toBe('Padrão novo.')
  })

  test('sem referência do código, o texto vivo fica — nunca se adivinha que ninguém editou', async () => {
    const live = speechGraph({ [UNEDITED_ID]: 'Texto vivo.' }, 2)
    const next = speechGraph({ [UNEDITED_ID]: 'Padrão novo.' }, 1)

    const { outcome } = await republish({ live, next })

    expect(outcome.graph.nodes[UNEDITED_ID]?.directMessage).toBe('Texto vivo.')
  })
})

describe('baseline do que o código publicou de fato (spec 300 review)', () => {
  const FIRST_ID = botSpeechNodeId('tripUnavailable')
  const SECOND_ID = botSpeechNodeId('operatorNoTrips')

  function speechGraph(texts: Record<string, string>, version: number): FlowGraphData {
    const nodes: FlowGraphData['nodes'] = {}
    for (const [id, directMessage] of Object.entries(texts)) {
      nodes[id] = { directMessage, id, type: 'action' }
    }
    return { ...GRAPH_V1, nodes, version }
  }

  function textsOf(graph: FlowGraphData | undefined) {
    return Object.fromEntries(
      Object.entries(graph?.nodes ?? {}).map(([id, node]) => [id, node.directMessage]),
    )
  }

  function createPublisher(live: FlowGraphData, baseline?: FlowGraphData, hasPanelEdits = false) {
    const { module, stored } = createFakeModule(live)
    const { baselines, history } = createFakeHistory(baseline, hasPanelEdits)
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })
    return { baselines, publish, stored }
  }

  const request = (graph: FlowGraphData, adoptLiveAsCodeBaseline = false) => ({
    adoptLiveAsCodeBaseline,
    companyId: COMPANY_ID,
    graph,
    publishedBy: 'code',
    source: 'code' as const,
  })

  test('sem referência, o nó preservado não ganha entrada no baseline e o padrão novo não vira "editado"', async () => {
    const live = speechGraph({ [FIRST_ID]: 'Texto vivo antigo.' }, 2)
    const nextOne = speechGraph({ [FIRST_ID]: 'Padrão novo.', [SECOND_ID]: 'Outro novo.' }, 1)
    const { baselines, publish, stored } = createPublisher(live)

    await publish(request(nextOne))

    expect(textsOf(stored.value)).toEqual({
      [FIRST_ID]: 'Texto vivo antigo.',
      [SECOND_ID]: 'Outro novo.',
    })
    expect(textsOf(baselines.at(-1))).toEqual({ [SECOND_ID]: 'Outro novo.' })

    const nextTwo = speechGraph({ [FIRST_ID]: 'Padrão novo.', [SECOND_ID]: 'Outro mais novo.' }, 1)
    await publish(request(nextTwo))

    expect(textsOf(stored.value)).toEqual({
      [FIRST_ID]: 'Texto vivo antigo.',
      [SECOND_ID]: 'Outro mais novo.',
    })
  })

  test('nó editado e preservado mantém a entrada do baseline anterior e continua preservado', async () => {
    const baseline = speechGraph({ [FIRST_ID]: 'Padrão antigo.' }, 2)
    const live = speechGraph({ [FIRST_ID]: 'Editada.' }, 2)
    const { baselines, publish, stored } = createPublisher(live, baseline)

    await publish(request(speechGraph({ [FIRST_ID]: 'Padrão novo.', [SECOND_ID]: 'A.' }, 1)))
    expect(textsOf(baselines.at(-1))).toEqual({ [FIRST_ID]: 'Padrão antigo.', [SECOND_ID]: 'A.' })

    await publish(request(speechGraph({ [FIRST_ID]: 'Padrão novo.', [SECOND_ID]: 'B.' }, 1)))
    expect(textsOf(stored.value)).toEqual({ [FIRST_ID]: 'Editada.', [SECOND_ID]: 'B.' })
  })

  test('adotar o vivo recusa quando o histórico tem edição do painel', async () => {
    const live = speechGraph({ [FIRST_ID]: 'Editada.' }, 2)
    const { publish, stored } = createPublisher(live, undefined, true)

    const failure = await publish(
      request(speechGraph({ [FIRST_ID]: 'Padrão novo.' }, 1), true),
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(WhatsAppFlowGraphPanelEditedError)
    expect((failure as Error).message).toBe(
      'whatsapp flow graph "root" has panel edits: adopting the live graph as code baseline would overwrite them',
    )
    expect(textsOf(stored.value)).toEqual({ [FIRST_ID]: 'Editada.' })
  })

  test('a prévia mostra quantos fala_* seriam regravados e recusa a adoção com edição do painel', async () => {
    const live = speechGraph({ [FIRST_ID]: 'Antiga.', [SECOND_ID]: 'Outra antiga.' }, 2)
    const next = speechGraph({ [FIRST_ID]: 'Nova.', [SECOND_ID]: 'Outra antiga.' }, 1)
    const { module } = createFakeModule(live)

    const preview = await previewWhatsAppFlowGraphPublication({
      adoptLiveAsCodeBaseline: true,
      companyId: COMPANY_ID,
      graph: next,
      history: createFakeHistory().history,
      module,
    })
    expect(preview.rewrittenBotSpeechCount).toBe(1)

    const failure = await previewWhatsAppFlowGraphPublication({
      adoptLiveAsCodeBaseline: true,
      companyId: COMPANY_ID,
      graph: next,
      history: createFakeHistory(undefined, true).history,
      module,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WhatsAppFlowGraphPanelEditedError)
  })
})

describe('--overwrite-nodes (spec 299)', () => {
  const speech = (text: string): FlowGraphData => ({
    ...GRAPH_V1,
    nodes: {
      ...GRAPH_V1.nodes,
      fala_a: { directMessage: text, id: 'fala_a', type: 'action' },
      fala_b: { directMessage: text, id: 'fala_b', type: 'action' },
    },
  })
  const live = (): FlowGraphData => {
    const base = speech('texto vivo')
    return { ...base, version: 4 }
  }
  const code = speech('texto do código')

  test('chave listada leva o texto do código e aparece no preview com antes e depois', async () => {
    const { module } = createFakeModule(live())
    const preview = await previewWhatsAppFlowGraphPublication({
      companyId: COMPANY_ID,
      graph: code,
      history: createFakeHistory().history,
      module,
      overwriteNodeIds: ['fala_a'],
    })

    expect(preview.overwritten).toEqual([
      { from: 'texto vivo', nodeId: 'fala_a', to: 'texto do código' },
    ])
    expect(preview.diff.changedNodeIds).toEqual(['fala_a'])
  })

  test('publica só a chave listada, guarda histórico e preserva a não listada', async () => {
    const { module, stored } = createFakeModule(live())
    const { history, recorded } = createFakeHistory()
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const outcome = await publish({
      companyId: COMPANY_ID,
      graph: code,
      overwriteNodeIds: ['fala_a'],
      publishedBy: 'code',
      source: 'code',
    })

    expect(outcome.kind).toBe('updated')
    expect(stored.value?.nodes.fala_a?.directMessage).toBe('texto do código')
    expect(stored.value?.nodes.fala_b?.directMessage).toBe('texto vivo')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.graph.nodes.fala_a?.directMessage).toBe('texto vivo')
  })

  test('chave desconhecida é erro e nada é publicado', async () => {
    const { module, stored } = createFakeModule(live())
    const { history, recorded } = createFakeHistory()
    const publish = createPublishWhatsAppFlowGraphUseCase({
      runInTransaction: (work) => work({ history, module }),
    })

    const failure = await publish({
      companyId: COMPANY_ID,
      graph: code,
      overwriteNodeIds: ['fala_inexistente'],
      publishedBy: 'code',
      source: 'code',
    }).catch((error: unknown) => error)
    const previewFailure = await previewWhatsAppFlowGraphPublication({
      companyId: COMPANY_ID,
      graph: code,
      history: createFakeHistory().history,
      module,
      overwriteNodeIds: ['fala_inexistente'],
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(WhatsAppFlowGraphUnknownOverwriteKeyError)
    expect(previewFailure).toBeInstanceOf(WhatsAppFlowGraphUnknownOverwriteKeyError)
    expect(stored.value?.version).toBe(4)
    expect(recorded).toEqual([])
  })

  test('sem a flag o comportamento é o de sempre: fala viva preservada, nada a publicar', async () => {
    const { module } = createFakeModule(live())
    const preview = await previewWhatsAppFlowGraphPublication({
      companyId: COMPANY_ID,
      graph: code,
      history: createFakeHistory().history,
      module,
    })

    expect(preview.overwritten).toEqual([])
    expect(preview.diff.isEqual).toBeTrue()
  })
})
