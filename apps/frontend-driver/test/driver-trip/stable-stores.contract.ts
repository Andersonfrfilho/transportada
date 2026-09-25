/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const HOOK_PATH = join(
  new URL('../..', import.meta.url).pathname,
  'src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
)
const HOOK_SOURCE = readFileSync(HOOK_PATH, 'utf8')

/**
 * ⚠️ **Um parâmetro com padrão de função (`= createIndexedDbQueueStore()`) cria uma loja nova a
 * cada chamada sem argumento** — e `useDriverTrip()` é chamado sem argumento em produção. A loja
 * nova muda a identidade de `store`/`attachmentStore` a cada render, o `useCallback` que depende
 * delas é recriado junto, e o `useEffect` de montagem (que depende dele) roda de novo a cada
 * render — uma drenagem emendada na outra, sem fim, com `isSyncing` nunca voltando a `false` mesmo
 * sem pedido nenhum em voo. A loja estável mora num `useState` com inicializador preguiçoso; este
 * contrato varre a fonte para o padrão de função nunca voltar à assinatura do hook.
 */
describe('as lojas de useDriverTrip são estáveis entre renders', () => {
  test('a assinatura não tem loja criada como valor padrão de parâmetro', () => {
    const signature = HOOK_SOURCE.slice(
      HOOK_SOURCE.indexOf('export function useDriverTrip('),
      HOOK_SOURCE.indexOf(') {', HOOK_SOURCE.indexOf('export function useDriverTrip(')),
    )

    expect(signature).not.toMatch(/=\s*createIndexedDb\w*\(\)/u)
  })

  test('a loja padrão nasce de um useState preguiçoso, uma vez por instância', () => {
    expect(HOOK_SOURCE).toMatch(
      /useState\(\(\) => \(\{\s*attachmentStore: createIndexedDbAttachmentStore\(\),\s*store: createIndexedDbQueueStore\(\),\s*\}\)\)/u,
    )
  })
})
