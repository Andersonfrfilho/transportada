/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  resolveReplicateOffer,
  shouldOpenReplicateDialog,
} from '@/modules/nfe-workspace/shared/packageBoxReplicateOffer.service'

const DIMENSIONS = { heightMm: 150, lengthMm: 300, unitsPerBox: 1, widthMm: 200 }

/**
 * Spec 155 (D9, G010), T14 (revisão final, ALTO-2/MÉDIO-2): a decisão de oferecer o diálogo de
 * replicar extraída do efeito que reagia a `saveStatus` — o painel agora chama esta função pura
 * dentro do `onSuccess` de cada gravação, amarrada à caixa e às dimensões daquela chamada.
 */
describe('oferta de replicar depois de salvar uma medida (D9, G010)', () => {
  it('não oferece quando não sobra pendente na família (primeira medição)', () => {
    const offer = resolveReplicateOffer({
      box: { familyPendingCount: 1, id: 'box-1', measuredAt: null },
      dimensions: DIMENSIONS,
    })

    expect(offer).toBeUndefined()
  })

  it('oferece quando sobra pendente além da própria caixa (primeira medição)', () => {
    const offer = resolveReplicateOffer({
      box: { familyPendingCount: 2, id: 'box-1', measuredAt: null },
      dimensions: DIMENSIONS,
    })

    expect(offer).toEqual({ boxId: 'box-1', dimensions: DIMENSIONS })
  })

  /**
   * MÉDIO-2: a caixa já medida não entra no `familyPendingCount` (ela conta como medida) — por
   * isso remedir não pode subtrair a si mesma da conta, senão a oferta nunca aparece com só uma
   * pendente sobrando.
   */
  it('remedir caixa já medida oferece com só uma pendente na família, sem subtrair a si mesma', () => {
    const offer = resolveReplicateOffer({
      box: { familyPendingCount: 1, id: 'box-1', measuredAt: '2026-09-10T12:00:00Z' },
      dimensions: DIMENSIONS,
    })

    expect(offer).toEqual({ boxId: 'box-1', dimensions: DIMENSIONS })
  })

  it('remedir caixa já medida sem pendente nenhuma na família não oferece', () => {
    const offer = resolveReplicateOffer({
      box: { familyPendingCount: 0, id: 'box-1', measuredAt: '2026-09-10T12:00:00Z' },
      dimensions: DIMENSIONS,
    })

    expect(offer).toBeUndefined()
  })
})

/**
 * Re-revisão (B1): uma oferta nova nunca substitui um diálogo já aberto nem entra por cima de uma
 * réplica em gravação.
 */
describe('abrir o diálogo de replicar por cima de outro (B1)', () => {
  it('abre quando não há diálogo aberto nem réplica gravando', () => {
    expect(shouldOpenReplicateDialog({ replicateDialogOpen: false, replicateSaving: false })).toBe(
      true,
    )
  })

  it('não abre com o diálogo já aberto', () => {
    expect(shouldOpenReplicateDialog({ replicateDialogOpen: true, replicateSaving: false })).toBe(
      false,
    )
  })

  it('não abre com uma réplica gravando', () => {
    expect(shouldOpenReplicateDialog({ replicateDialogOpen: false, replicateSaving: true })).toBe(
      false,
    )
  })

  it('não abre com os dois ao mesmo tempo', () => {
    expect(shouldOpenReplicateDialog({ replicateDialogOpen: true, replicateSaving: true })).toBe(
      false,
    )
  })
})
