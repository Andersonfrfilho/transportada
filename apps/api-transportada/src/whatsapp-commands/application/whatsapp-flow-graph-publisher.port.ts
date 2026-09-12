/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import type { WhatsAppFlowGraphVersionSource } from '../../database/whatsapp-flow-graph-version.schema.js'

/**
 * O recorte da `FlowGraphRepository` do `@adatechnology/meta-whatsapp-module@0.1.0` que o
 * publicador usa. `create`/`save` seguem a assinatura do pacote — `create` recebe o grafo sem
 * `version` (a linha nasce em 1), `save` recebe o grafo completo e o `expectedVersion` da trava
 * otimista; o `version` do grafo passado não é lido por `save` — o pacote grava `expectedVersion + 1`
 * sozinho.
 */
export type WhatsAppFlowGraphModulePort = {
  get(companyId: string, key: string): Promise<FlowGraphData | undefined>
  create(
    companyId: string,
    graph: Omit<FlowGraphData, 'version'> & {
      readonly menuOptionLabel?: string
      readonly showInMenu?: boolean
    },
  ): Promise<FlowGraphData>
  save(companyId: string, graph: FlowGraphData, expectedVersion: number): Promise<FlowGraphData>
}

export type WhatsAppFlowGraphHistorySnapshot = {
  readonly companyId: string
  readonly graph: FlowGraphData
  readonly publishedBy: string
  readonly source: WhatsAppFlowGraphVersionSource
}

/** Append-only por trigger (drizzle/…/whatsapp_flow_graph_versions): só `record`, nunca update. */
export type WhatsAppFlowGraphHistoryPort = {
  record(snapshot: WhatsAppFlowGraphHistorySnapshot): Promise<void>
}

export type WhatsAppFlowGraphPublisherRepositories = {
  readonly history: WhatsAppFlowGraphHistoryPort
  readonly module: WhatsAppFlowGraphModulePort
}
