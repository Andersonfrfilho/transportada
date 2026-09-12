/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FlowGraphData } from '@adatechnology/meta-whatsapp-contracts'

import type { WhatsAppFlowGraphProviderPort } from './whatsapp-command-driver.port.js'

/** Grafos em código, iguais para toda empresa. A T008 troca por leitura da versão publicada. */
export function createStaticWhatsAppFlowGraphProvider(input: {
  readonly graphs: readonly FlowGraphData[]
  readonly rootFlowKey: string
}): WhatsAppFlowGraphProviderPort {
  const graphsByKey = new Map(input.graphs.map((graph) => [graph.key, graph]))

  return {
    findGraph: async ({ flowKey }) => graphsByKey.get(flowKey),
    rootFlowKey: input.rootFlowKey,
  }
}
