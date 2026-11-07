/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import {
  buildCodeBaseline,
  countRewrittenBotSpeech,
  preserveEditedBotSpeech,
} from '../domain/whatsapp-bot-speech.policy.js'
import {
  diffWhatsAppFlowGraphs,
  type WhatsAppFlowGraphDiff,
} from '../domain/whatsapp-flow-graph-diff.policy.js'
import {
  validateFlowGraphForWhatsApp,
  type WhatsAppFlowGraphViolation,
} from '../domain/whatsapp-menu.policy.js'
import type {
  WhatsAppFlowGraphHistoryPort,
  WhatsAppFlowGraphModulePort,
  WhatsAppFlowGraphPublisherRepositories,
} from './whatsapp-flow-graph-publisher.port.js'

export class WhatsAppFlowGraphInvalidError extends Error {
  public readonly violations: readonly WhatsAppFlowGraphViolation[]

  constructor(violations: readonly WhatsAppFlowGraphViolation[]) {
    super(`whatsapp flow graph has ${violations.length} violation(s) for the whatsapp channel`)
    this.name = 'WhatsAppFlowGraphInvalidError'
    this.violations = violations
  }
}

export class WhatsAppFlowGraphPanelEditedError extends Error {
  constructor(flowKey: string) {
    super(
      `whatsapp flow graph "${flowKey}" has panel edits: adopting the live graph as code baseline would overwrite them`,
    )
    this.name = 'WhatsAppFlowGraphPanelEditedError'
  }
}

export class WhatsAppFlowGraphUnknownOverwriteKeyError extends Error {
  public readonly unknownKeys: readonly string[]

  constructor(unknownKeys: readonly string[]) {
    super(`overwrite keys not found in the code graph: ${unknownKeys.join(', ')}`)
    this.name = 'WhatsAppFlowGraphUnknownOverwriteKeyError'
    this.unknownKeys = unknownKeys
  }
}

function assertOverwriteKeysExist(graph: FlowGraphData, overwriteNodeIds: readonly string[]): void {
  const unknownKeys = overwriteNodeIds.filter((id) => graph.nodes[id] === undefined)
  if (unknownKeys.length > 0) throw new WhatsAppFlowGraphUnknownOverwriteKeyError(unknownKeys)
}

export type WhatsAppFlowGraphOverwrittenNode = {
  readonly from: string | undefined
  readonly nodeId: string
  readonly to: string | undefined
}

export type WhatsAppFlowGraphPublicationRequest = {
  readonly companyId: string
  readonly graph: FlowGraphData
  /** Chaves de nós `fala_*` que levam o texto do código em vez do texto vivo (opt-in explícito). */
  readonly overwriteNodeIds?: readonly string[]
  /** `'code'` no comando de republicação; id do usuário quando um dia o painel salvar. */
  readonly publishedBy: string
  readonly source: 'code' | 'panel'
  /** Só para a primeira publicação com a regra de edição: declara que o grafo vivo ainda é o do código. */
  readonly adoptLiveAsCodeBaseline?: boolean
}

export type WhatsAppFlowGraphPublicationPreview = {
  readonly current: FlowGraphData | undefined
  readonly diff: WhatsAppFlowGraphDiff
  readonly rewrittenBotSpeechCount: number
  readonly overwritten: readonly WhatsAppFlowGraphOverwrittenNode[]
  readonly violations: readonly WhatsAppFlowGraphViolation[]
}

export type WhatsAppFlowGraphPublicationOutcome =
  | { readonly graph: FlowGraphData; readonly kind: 'created' }
  | { readonly graph: FlowGraphData; readonly kind: 'unchanged' }
  | {
      readonly diff: WhatsAppFlowGraphDiff
      readonly graph: FlowGraphData
      readonly kind: 'updated'
    }

/**
 * O diff e a validação do que a publicação faria — usado pelo script sem `--confirm` (RF8) e por
 * quem quiser conferir antes de publicar. Nunca grava nada.
 */
export async function previewWhatsAppFlowGraphPublication(input: {
  readonly adoptLiveAsCodeBaseline?: boolean
  readonly companyId: string
  readonly graph: FlowGraphData
  readonly history: Pick<WhatsAppFlowGraphHistoryPort, 'hasPanelEdits' | 'readCodeBaseline'>
  readonly module: Pick<WhatsAppFlowGraphModulePort, 'get'>
  readonly overwriteNodeIds?: readonly string[]
}): Promise<WhatsAppFlowGraphPublicationPreview> {
  const overwriteNodeIds = input.overwriteNodeIds ?? []
  assertOverwriteKeysExist(input.graph, overwriteNodeIds)
  const violations = validateFlowGraphForWhatsApp(input.graph)
  const current = await input.module.get(input.companyId, input.graph.key)
  const baseline = await resolveCodeBaseline({ ...input, current })
  /** O diff mostra o que a publicação faria de fato: as falas editadas no editor ficam como estão. */
  const published = preserveEditedBotSpeech(current, input.graph, baseline, overwriteNodeIds)
  const overwritten = overwriteNodeIds
    .map((nodeId) => ({
      from: current?.nodes[nodeId]?.directMessage,
      nodeId,
      to: published.nodes[nodeId]?.directMessage,
    }))
    .filter((node) => current !== undefined && node.from !== node.to)
  return {
    current,
    diff: diffWhatsAppFlowGraphs(current, published),
    overwritten,
    rewrittenBotSpeechCount: countRewrittenBotSpeech(current, published),
    violations,
  }
}

async function resolveCodeBaseline(input: {
  readonly adoptLiveAsCodeBaseline?: boolean
  readonly companyId: string
  readonly current: FlowGraphData | undefined
  readonly graph: FlowGraphData
  readonly history: Pick<WhatsAppFlowGraphHistoryPort, 'hasPanelEdits' | 'readCodeBaseline'>
}): Promise<FlowGraphData | undefined> {
  if (input.adoptLiveAsCodeBaseline === true) {
    if (await input.history.hasPanelEdits(input.companyId, input.graph.key)) {
      throw new WhatsAppFlowGraphPanelEditedError(input.graph.key)
    }
    return input.current
  }
  return input.history.readCodeBaseline(input.companyId, input.graph.key)
}

export type PublishWhatsAppFlowGraph = (
  request: WhatsAppFlowGraphPublicationRequest,
) => Promise<WhatsAppFlowGraphPublicationOutcome>

/**
 * Spec 144 T008 — republicação versionada, nunca sobrescrita muda: sem grafo publicado, `create`
 * (versão nasce em 1); com grafo igual, nada acontece (idempotente, a versão não sobe); com grafo
 * diferente, a versão viva antes do `save` entra no histórico **antes** de ser substituída — a
 * mesma transação cobre as duas escritas quando `runInTransaction` usa uma conexão só para os dois
 * repositórios (é o que `main.ts` e `scripts/whatsapp-flow-publish.ts` fazem).
 *
 * Conflito de versão (`OptimisticLockError`, de outra publicação correndo entre o `get` e o `save`)
 * sobe intacto: quem chama decide se tenta de novo. Grafo inválido nunca chega a abrir transação.
 */
export function createPublishWhatsAppFlowGraphUseCase(dependencies: {
  readonly runInTransaction: <T>(
    work: (repositories: WhatsAppFlowGraphPublisherRepositories) => Promise<T>,
  ) => Promise<T>
}): PublishWhatsAppFlowGraph {
  return async function publishWhatsAppFlowGraph(request) {
    const overwriteNodeIds = request.overwriteNodeIds ?? []
    assertOverwriteKeysExist(request.graph, overwriteNodeIds)
    const violations = validateFlowGraphForWhatsApp(request.graph)
    if (violations.length > 0) throw new WhatsAppFlowGraphInvalidError(violations)

    return dependencies.runInTransaction(async ({ history, module }) => {
      const current = await module.get(request.companyId, request.graph.key)

      /** Grafo novo não tem "versão atual" para guardar — o histórico nasce no próximo `save`. */
      if (current === undefined) {
        const created = await module.create(request.companyId, {
          key: request.graph.key,
          label: request.graph.label,
          nodes: request.graph.nodes,
          startNodeId: request.graph.startNodeId,
        })
        await history.recordCodeBaseline({
          companyId: request.companyId,
          graph: { ...request.graph, version: created.version },
        })
        return { graph: created, kind: 'created' }
      }

      /** Spec 286 T8 e 300 T6.1: fala editada no painel não volta ao padrão; a igual à do código é regravada. */
      const baseline = await resolveCodeBaseline({ ...request, current, history })
      const graph = preserveEditedBotSpeech(current, request.graph, baseline, overwriteNodeIds)
      const diff = diffWhatsAppFlowGraphs(current, graph)
      if (diff.isEqual) {
        if (request.adoptLiveAsCodeBaseline === true) {
          await history.recordCodeBaseline({
            companyId: request.companyId,
            graph: {
              ...buildCodeBaseline({
                codeGraph: request.graph,
                previousBaseline: baseline,
                published: graph,
              }),
              version: current.version,
            },
          })
        }
        return { graph: current, kind: 'unchanged' }
      }

      /** A versão sobre a mesa (a que `save` está prestes a substituir) fica no histórico. */
      await history.record({
        companyId: request.companyId,
        graph: current,
        publishedBy: request.publishedBy,
        source: request.source,
      })
      const updated = await module.save(
        request.companyId,
        { ...graph, version: current.version },
        current.version,
      )
      await history.recordCodeBaseline({
        companyId: request.companyId,
        graph: {
          ...buildCodeBaseline({
            codeGraph: request.graph,
            previousBaseline: baseline,
            published: graph,
          }),
          version: updated.version,
        },
      })
      return { diff, graph: updated, kind: 'updated' }
    })
  }
}
