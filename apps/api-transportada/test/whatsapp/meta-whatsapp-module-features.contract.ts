/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 245 T2.2 (RF4): o resolver liga `features.redactInboundLocation` ao criar o módulo, para a
 * linha do transcript nascer sem `payload.location` e sem rótulo. A prova de comportamento é a
 * integração `whatsapp-driver-flow-actions.integration.ts` (webhook real pelo resolver de
 * verdade); este contrato prende a opção na chamada da fábrica, onde ela some em silêncio — sem
 * ela o módulo `0.8.0` volta a gravar o ponto e nenhum teste unitário percebe.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const RESOLVER_PATH = new URL(
  '../../src/whatsapp/application/meta-whatsapp-module.resolver.ts',
  import.meta.url,
)

function extractCreateModuleCall(source: string): string {
  const start = source.indexOf('createMetaWhatsAppModule({')
  if (start === -1) throw new Error('chamada createMetaWhatsAppModule não encontrada no resolver')
  const end = source.indexOf('hooks.onMessageReceived', start)
  if (end === -1) throw new Error('fim da chamada createMetaWhatsAppModule não encontrado')
  return source.slice(start, end)
}

describe('spec 245 — o resolver cria o módulo sem guardar a localização no transcript', () => {
  test('a chamada da fábrica passa features.redactInboundLocation ligada', () => {
    const call = extractCreateModuleCall(readFileSync(RESOLVER_PATH, 'utf8'))

    expect(call).toMatch(/features:\s*\{\s*redactInboundLocation:\s*true\s*\}/)
  })

  test('a opção não é desligada em nenhum ponto da chamada', () => {
    const call = extractCreateModuleCall(readFileSync(RESOLVER_PATH, 'utf8'))

    expect(call).not.toMatch(/redactInboundLocation:\s*false/)
  })
})
