/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T13 (CA9b/CA9c): a ocorrência registrada pelo WhatsApp do operador precisa nascer pela
 * MESMA persistência da rota HTTP (`persistSeparationOccurrenceWithAttachment`), nunca por um
 * `saveOccurrence` cru — só assim ela ganha `stored_objects` com purpose/retenção/chave corretos
 * (já provados pelo contrato de T6, `separation-upload.contract.ts`, sobre a mesma função). E o
 * resolver do módulo (`meta-whatsapp-module.resolver.ts`) precisa continuar **sem** `providers`: a
 * validação de arquitetura (D7) reprovou injetar `providers.objectStorage` porque o
 * `IngestInboundMediaUseCase` do pacote grava fora de `stored_objects`, sem purpose e sem retenção,
 * e a injeção acenderia `sendMedia`/`DeleteConversation`/`PurgeExpiredDocuments`/`send_media` — nada
 * disso pedido nesta spec. Este arquivo varre o texto-fonte, no molde de
 * `test/trip-schema/trip-status-writers.contract.ts`: a garantia comportamental de
 * `persistSeparationOccurrenceWithAttachment` já é do contrato de T6, este contrato garante que o
 * canal do WhatsApp de fato passa por ali.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const MAIN_TS_PATH = new URL('../../src/main.ts', import.meta.url)
const RESOLVER_PATH = new URL(
  '../../src/whatsapp/application/meta-whatsapp-module.resolver.ts',
  import.meta.url,
)

function readSource(path: URL): string {
  return readFileSync(path, 'utf8')
}

/**
 * Isola o bloco da dependência `registerOccurrence` do `createOperatorWhatsAppFlowActions`, entre
 * a assinatura do campo e o próximo campo do objeto (`separateDocument:`), para não confundir com
 * o `saveOccurrence` de outras fiações (escritório, rota HTTP) que também aparecem em `main.ts`.
 */
function extractWhatsAppRegisterOccurrenceBlock(source: string): string {
  /**
   * Há duas deps `registerOccurrence` em `main.ts`: a do motorista
   * (`createDriverWhatsAppFlowActions`, `registerDriverOccurrence`) e a do operador
   * (`createOperatorWhatsAppFlowActions`, alvo desta task). Ancorar em
   * `createOperatorWhatsAppFlowActions(` evita casar com a primeira.
   */
  const scopeStart = source.indexOf('createOperatorWhatsAppFlowActions(')
  if (scopeStart === -1)
    throw new Error('createOperatorWhatsAppFlowActions não encontrado em main.ts')
  const start = source.indexOf('registerOccurrence: (input) =>', scopeStart)
  if (start === -1) throw new Error('bloco registerOccurrence não encontrado em main.ts')
  const end = source.indexOf('separateDocument: (input) =>', start)
  if (end === -1) throw new Error('fim do bloco registerOccurrence não encontrado em main.ts')
  return source.slice(start, end)
}

describe('T13 — persistência do WhatsApp reusa persistSeparationOccurrenceWithAttachment', () => {
  test('a dep registerOccurrence do operador WhatsApp chama persistSeparationOccurrenceWithAttachment', () => {
    const block = extractWhatsAppRegisterOccurrenceBlock(readSource(MAIN_TS_PATH))

    expect(block).toContain('persistSeparationOccurrenceWithAttachment(')
    /**
     * `saveTripOccurrence` cru não pode mais ser a implementação de `saveOccurrence` neste bloco —
     * ele não sobe `stored_objects`, não grava purpose/retenção e não usa
     * `runWithStoredObjectCleanup`.
     */
    expect(block).not.toContain('saveOccurrence: (query) => saveTripOccurrence(')
  })

  test('CA9b regressão: meta-whatsapp-module.resolver.ts continua sem `providers`', () => {
    const source = readSource(RESOLVER_PATH)

    expect(source).not.toContain('providers')
    expect(source).not.toContain('objectStorage')
  })
})
