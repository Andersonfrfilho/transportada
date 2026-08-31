/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_PREVIEW_PAYLOAD } from '../../src/modules/notification/shared/notificationCatalog.constant'

const API_CATALOG_PATH = fileURLToPath(
  new URL(
    '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
    import.meta.url,
  ),
)

/** As variáveis que os textos do catálogo declaram — lidas do arquivo da API, não copiadas aqui. */
function catalogPlaceholders(): readonly string[] {
  const source = readFileSync(API_CATALOG_PATH, 'utf8')
  const groups = [...source.matchAll(/placeholders: \[([^\]]*)\]/gu)]
  const names = groups.flatMap(([, body]) => [...(body ?? '').matchAll(/'([^']+)'/gu)])

  return [...new Set(names.map(([, name]) => name as string))].sort()
}

/**
 * O preview existe para mostrar a frase que a pessoa vai ler. Variável sem exemplo volta a aparecer
 * crua (`{{batchName}}`), e quem está escrevendo o texto perde exatamente o que veio ver.
 */
describe('o preview tem exemplo para toda variável do catálogo', () => {
  test('o catálogo declara variáveis', () => {
    expect(catalogPlaceholders().length).toBeGreaterThan(0)
  })

  test('cada variável do catálogo tem valor de exemplo', () => {
    const missing = catalogPlaceholders().filter(
      (name) => NOTIFICATION_PREVIEW_PAYLOAD[name] === undefined,
    )

    expect(missing).toEqual([])
  })

  /** Exemplo sobrando é variável que sumiu do catálogo: some do preview antes de virar confusão. */
  test('não há exemplo para variável que o catálogo não usa', () => {
    const known = new Set(catalogPlaceholders())
    const extra = Object.keys(NOTIFICATION_PREVIEW_PAYLOAD).filter((name) => !known.has(name))

    expect(extra).toEqual([])
  })

  /** Valor comprido esconde quebra de linha em vez de revelá-la — que é o oposto do preview. */
  test('os exemplos são curtos', () => {
    for (const [name, value] of Object.entries(NOTIFICATION_PREVIEW_PAYLOAD)) {
      expect(`${name}: ${value.length <= 40}`).toBe(`${name}: true`)
    }
  })
})
