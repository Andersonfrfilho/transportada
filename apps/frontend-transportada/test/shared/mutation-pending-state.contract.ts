/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SOURCE_ROOT = 'src/modules'

/**
 * `isPending` de uma mutação só cai quando a promise devolvida por `onSuccess`/`onSettled` resolve,
 * e é ele que desabilita o botão e troca o rótulo para "Gerando...". Aguardar a revalidação ali
 * prende o botão muito depois de o trabalho ter acabado: numa fatura de 294 CT-es o efeito
 * `billingInvoiceItem` invalida seis raízes de consulta, e o operador lia trabalho pendente onde
 * havia só cache esfriando — e clicava de novo, arriscando repetir a operação.
 *
 * A revalidação continua acontecendo em todos esses lugares; ela só deixa de segurar o estado.
 * Quando alguma ordem depende do cache voltar, ela se encadeia com `.then()`, sem `await`.
 */
const FORBIDDEN_PATTERNS: readonly Readonly<{ label: string; pattern: RegExp }>[] = [
  { label: 'onSuccess: async', pattern: /onSuccess:\s*async\b/ },
  { label: 'async onSuccess(', pattern: /async\s+onSuccess\s*\(/ },
  { label: 'onSettled: async', pattern: /onSettled:\s*async\b/ },
  { label: 'async onSettled(', pattern: /async\s+onSettled\s*\(/ },
]

async function listSourceFiles(): Promise<readonly string[]> {
  const entries = await readdir(new URL(SOURCE_ROOT, APPLICATION_ROOT), {
    recursive: true,
    withFileTypes: true,
  })

  return entries
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => `${entry.parentPath}/${entry.name}`)
}

describe('mutation pending state contract', () => {
  test('no mutation callback awaits the cache before releasing the button', async () => {
    const offenders: string[] = []
    for (const filePath of await listSourceFiles()) {
      const source = await Bun.file(filePath).text()
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        if (pattern.test(source)) {
          offenders.push(`${filePath.split('/src/')[1] ?? filePath}: ${label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  /** A varredura precisa enxergar arquivo — uma lista vazia passaria sem provar nada. */
  test('actually reads the module sources', async () => {
    expect((await listSourceFiles()).length).toBeGreaterThan(100)
  })
})
