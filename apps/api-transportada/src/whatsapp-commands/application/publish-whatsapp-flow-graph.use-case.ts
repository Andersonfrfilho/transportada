/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import {
  diffWhatsAppFlowGraphs,
  type WhatsAppFlowGraphDiff,
} from '../domain/whatsapp-flow-graph-diff.policy.js'
import {
  validateFlowGraphForWhatsApp,
  type WhatsAppFlowGraphViolation,
} from '../domain/whatsapp-menu.policy.js'
import type {
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

export type WhatsAppFlowGraphPublicationRequest = {
  readonly companyId: string
  readonly graph: FlowGraphData
  /** `'code'` no comando de republicação; id do usuário quando um dia o painel salvar. */
  readonly publishedBy: string
  readonly source: 'code' | 'panel'
}

export type WhatsAppFlowGraphPublicationPreview = {
  readonly current: FlowGraphData | undefined
  readonly diff: WhatsAppFlowGraphDiff
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
  readonly companyId: string
  readonly graph: FlowGraphData
  readonly module: Pick<WhatsAppFlowGraphModulePort, 'get'>
}): Promise<WhatsAppFlowGraphPublicationPreview> {
  const violations = validateFlowGraphForWhatsApp(input.graph)
  const current = await input.module.get(input.companyId, input.graph.key)
  return { current, diff: diffWhatsAppFlowGraphs(current, input.graph), violations }
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
        return { graph: created, kind: 'created' }
      }

      const diff = diffWhatsAppFlowGraphs(current, request.graph)
      if (diff.isEqual) return { graph: current, kind: 'unchanged' }

      /** A versão sobre a mesa (a que `save` está prestes a substituir) fica no histórico. */
      await history.record({
        companyId: request.companyId,
        graph: current,
        publishedBy: request.publishedBy,
        source: request.source,
      })
      const updated = await module.save(
        request.companyId,
        { ...request.graph, version: current.version },
        current.version,
      )
      return { diff, graph: updated, kind: 'updated' }
    })
  }
}
