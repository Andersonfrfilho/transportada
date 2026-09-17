/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  initialReplicateSelection,
  resolveReplicateTargets,
  resolveSelectedTargetIds,
} from '@/modules/nfe-workspace/shared/packageBoxReplicateSelection.service'
import type { PackageBoxSibling } from '@/modules/nfe-workspace/shared/packageBoxClient.service'

function buildSibling(
  overrides: Partial<PackageBoxSibling> & { readonly id: string },
): PackageBoxSibling {
  return {
    commercialUnit: 'CX36',
    description: 'SAB FARNESE 180G AVEIA ESFOLIANT',
    grossWeightGrams: null,
    heightMm: null,
    lengthMm: null,
    measuredAt: null,
    measurementSource: null,
    packagingUnitCount: 36,
    productCode: '6959',
    unitsPerBox: 1,
    variantLabel: 'AVEIA ESFOLIANT',
    widthMm: null,
    ...overrides,
  }
}

/** Spec 155 (D4, G005): réplica nunca sobrescreve — alvo já medido não é selecionável. */
describe('alvos de replicação: só quem ainda não tem medida (D4)', () => {
  it('remove as irmãs já medidas da lista de alvos', () => {
    const measured = buildSibling({ id: 'measured', measuredAt: '2026-09-17T10:00:00Z' })
    const pending = buildSibling({ id: 'pending' })

    expect(resolveReplicateTargets([measured, pending])).toEqual([pending])
  })
})

/**
 * T14 (revisão final, MÉDIO-1): `selected` guarda ids escolhidos numa leitura anterior das irmãs —
 * um refetch pode devolver `targets` sem um desses ids (a irmã foi medida por outra pessoa nesse
 * meio-tempo). Contar/enviar o `selected` cru grava um alvo que a API vai recusar (409) para o lote
 * inteiro; o correto é sempre cruzar contra os `targets` da leitura atual.
 */
describe('ids selecionados: só os que ainda estão entre os alvos atuais (MÉDIO-1)', () => {
  it('descarta id selecionado que não está mais entre os alvos depois de um refetch', () => {
    const targets = [buildSibling({ id: 'a' }), buildSibling({ id: 'b' })]
    const selected = new Set(['a', 'stale-id-de-antes-do-refetch'])

    expect(resolveSelectedTargetIds({ selected, targets })).toEqual(['a'])
  })

  it('mantém a ordem e todos quando nada ficou obsoleto', () => {
    const targets = [buildSibling({ id: 'a' }), buildSibling({ id: 'b' })]
    const selected = new Set(['b', 'a'])

    expect(resolveSelectedTargetIds({ selected, targets })).toEqual(['a', 'b'])
  })
})

/**
 * Spec 155 (D5, D11, G010, G011): família normal abre pré-marcada (D5); família de formato
 * assimétrico abre com tudo desmarcado, porque o predicado da D11 avisa que o rótulo sozinho não
 * garante a mesma caixa física.
 */
describe('seleção inicial do diálogo de replicar (D5, D11, G010, G011)', () => {
  it('pré-marca todos os alvos quando a família é confiável', () => {
    const targets = [buildSibling({ id: 'a' }), buildSibling({ id: 'b' })]

    const selection = initialReplicateSelection({ isLowConfidenceFamily: false, targets })

    expect(selection).toEqual(new Set(['a', 'b']))
  })

  it('nasce tudo desmarcado quando a família é de formato assimétrico (D11)', () => {
    const targets = [buildSibling({ id: 'a' }), buildSibling({ id: 'b' })]

    const selection = initialReplicateSelection({ isLowConfidenceFamily: true, targets })

    expect(selection.size).toBe(0)
  })
})

/**
 * ⚠️ Contrato por texto de fonte (mesmo padrão do resto da suíte, sem DOM nos testes desta app).
 */
describe('diálogo de replicar depois de salvar (spec 155 D5, D6, D11, G010, G011)', () => {
  it('mostra descrição completa + cProd de cada alvo, nunca só o rótulo (D11 corolário)', async () => {
    const dialog = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxReplicateDialog.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(dialog).toContain('target.description')
    expect(dialog).toContain('target.productCode')
    expect(dialog).toContain('resolveReplicateTargets')
    expect(dialog).toContain('initialReplicateSelection')
    /** MÉDIO-1: conta e envia só o que sobrou de `selected` depois de cruzar com `targets`. */
    expect(dialog).toContain('resolveSelectedTargetIds')
    expect(dialog).not.toContain('Array.from(selected)')
    /** D11/G011: o motivo da família assimétrica fica à vista, não só o estado desmarcado. */
    expect(dialog).toContain('isLowConfidenceFamily')
    expect(dialog).toContain('packageBoxes.replicateDialog.lowConfidence')
    /** Cabeçalho mostra o que vai gravar — quem confirma precisa ver antes de clicar. */
    expect(dialog).toContain('packageBoxes.replicateDialog.dimensions')
  })

  it('cancelar fecha sem chamar onConfirm — nada é gravado (D5)', async () => {
    const dialog = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxReplicateDialog.component.tsx',
        import.meta.url,
      ),
    ).text()

    const cancelButton = dialog.slice(dialog.indexOf('replicateDialog.cancel') - 200)
    expect(cancelButton).toContain('onClick={onClose}')
  })

  /**
   * T14 (revisão final, ALTO-2/MÉDIO-4): a oferta e o fechamento viraram `onSuccess` por chamada
   * (`resolveReplicateOffer` no painel), não mais efeitos que reagiam a `saveStatus`/
   * `replicateSaving` globais — um `PUT` que falhava para outra caixa não tinha como sujar a oferta
   * pendente, mas o efeito antigo reagia ao estado inteiro da mutação, não a "esta chamada terminou".
   */
  it('o painel abre o diálogo no onSuccess da gravação, nunca por um efeito de saveStatus (G010)', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('PackageBoxReplicateDialog')
    expect(panel).toContain('resolveReplicateOffer')
    expect(panel).not.toContain("saveStatus !== 'success'")
    expect(panel).not.toContain('wasReplicatingRef')
    expect(panel).not.toContain('pendingReplicateOfferRef')
  })

  it('fecha o diálogo no onSuccess da própria réplica, nunca por um efeito de replicateSaving', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('closeReplicateDialog')
    expect(panel).toContain(
      'onReplicate({ boxId: replicateDialog.boxId, targetIds }, closeReplicateDialog)',
    )
  })

  /** Re-revisão (B1): oferta nova nunca substitui diálogo aberto nem entra por cima de gravação. */
  it('não abre nova oferta com o diálogo já aberto ou a réplica gravando (B1)', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    const openIfEligible = panel.slice(
      panel.indexOf('function openReplicateDialogIfEligible'),
      panel.indexOf('function closeReplicateDialog'),
    )
    const openFromFamilyApply = panel.slice(
      panel.indexOf('function openReplicateDialogFromFamilyApply'),
      panel.indexOf('useEffect(() => {\n    return () => window.clearTimeout'),
    )

    expect(openIfEligible).toContain('shouldOpenReplicateDialog')
    expect(openFromFamilyApply).toContain('shouldOpenReplicateDialog')
  })
})
