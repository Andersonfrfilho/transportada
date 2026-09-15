/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { DEFAULT_SORT } from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SEARCH_PATH = 'src/modules/trip/components/TripDocumentSearch.component.tsx'

function readTableCall(): string {
  const source = readFileSync(new URL(SEARCH_PATH, APPLICATION_ROOT), 'utf8')
  const start = source.indexOf('useNfeDocumentTable({')
  if (start < 0) throw new Error('A busca do diálogo precisa usar a tabela das notas')
  return source.slice(start, source.indexOf('\n  })', start))
}

/**
 * "Montar roteiro pela busca de notas" lê a mesma `/nfe-documents` e roda na mesma tabela das
 * notas: se ela abrisse por outra ordem, a nota que acabou de chegar estaria no topo de uma tela e
 * no fim da outra.
 */
describe('ordem padrão da busca de notas do diálogo', () => {
  test('abre pela nota atualizada por último, como a tabela "Notas"', () => {
    expect(DEFAULT_SORT).toEqual({ column: 'updatedAt', direction: 'desc' })
  })

  test('não traz preferência nem ordem própria que substitua o padrão', () => {
    const call = readTableCall()

    expect(call).not.toContain('preferences')
    expect(call).not.toContain('sort')
  })
})
