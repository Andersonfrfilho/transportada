/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  countSelectionHiddenByFilter,
  scopeSelectionToFilter,
} from '@/modules/nfe-workspace/shared/documentSelectionScope.service'

describe('a seleção presa ao filtro (spec 103)', () => {
  /**
   * ⚠️ O defeito medido: 345 notas marcadas, filtro estreitado para 21, e a montagem despachou as
   * 345 — sete viagens, uma com 207 notas.
   */
  it('só o que o filtro mostra continua selecionado', () => {
    const scoped = scopeSelectionToFilter({
      filteredIds: ['a', 'b'],
      selectedIds: new Set(['a', 'b', 'c', 'd']),
    })

    expect([...scoped].sort()).toEqual(['a', 'b'])
  })

  /** Seleção entre páginas do mesmo filtro é legítima: a poda é pelo filtro, nunca pela página. */
  it('mantém o que está no filtro mesmo fora da página', () => {
    const scoped = scopeSelectionToFilter({
      filteredIds: ['a', 'b', 'c'],
      selectedIds: new Set(['a', 'c']),
    })

    expect([...scoped].sort()).toEqual(['a', 'c'])
  })

  it('filtro vazio não deixa seleção nenhuma sair', () => {
    expect(scopeSelectionToFilter({ filteredIds: [], selectedIds: new Set(['a']) }).size).toBe(0)
  })

  it('sem marcação, nada a podar', () => {
    expect(scopeSelectionToFilter({ filteredIds: ['a'], selectedIds: new Set() }).size).toBe(0)
  })

  /** A contagem escondida é o que a tela precisa dizer — descobrir pela viagem errada é tarde. */
  it('conta quantas marcações o filtro escondeu', () => {
    expect(
      countSelectionHiddenByFilter({
        filteredIds: ['a'],
        selectedIds: new Set(['a', 'b', 'c']),
      }),
    ).toBe(2)
    expect(
      countSelectionHiddenByFilter({ filteredIds: ['a', 'b'], selectedIds: new Set(['a']) }),
    ).toBe(0)
  })
})
