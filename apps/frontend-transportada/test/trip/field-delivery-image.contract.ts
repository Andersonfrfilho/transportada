import { describe, expect, it } from 'bun:test'

import {
  buildFieldDeliveryImageQualitySequence,
  computeFieldDeliveryImageDimensions,
  FIELD_DELIVERY_IMAGE_MAX_SIDE,
} from '../../src/modules/trip/shared/fieldDeliveryImage.service'

/**
 * Spec 156 T11 (D9): a imagem é reduzida no navegador antes do envio — lado maior ≤ 2000px, JPEG.
 * `canvas.toBlob` não roda no ambiente de teste (§ instruções da task), então só a conta de
 * dimensões — a parte determinística e a que mais quebra por engano de arredondamento — é isolada
 * numa função pura e testada aqui, sem canvas nenhum.
 */
describe('dimensões da foto reduzida do canhoto (spec 156 D9)', () => {
  it('imagem menor que o teto não muda de tamanho', () => {
    expect(computeFieldDeliveryImageDimensions({ height: 800, width: 600 })).toEqual({
      height: 800,
      width: 600,
    })
  })

  it('lado maior no teto exato não muda', () => {
    expect(
      computeFieldDeliveryImageDimensions({
        height: FIELD_DELIVERY_IMAGE_MAX_SIDE,
        width: 1000,
      }),
    ).toEqual({ height: FIELD_DELIVERY_IMAGE_MAX_SIDE, width: 1000 })
  })

  it('retrato: reduz a altura ao teto e escala a largura na mesma proporção', () => {
    expect(computeFieldDeliveryImageDimensions({ height: 4000, width: 3000 })).toEqual({
      height: FIELD_DELIVERY_IMAGE_MAX_SIDE,
      width: 1500,
    })
  })

  it('paisagem: reduz a largura ao teto e escala a altura na mesma proporção', () => {
    expect(computeFieldDeliveryImageDimensions({ height: 1500, width: 4000 })).toEqual({
      height: 750,
      width: FIELD_DELIVERY_IMAGE_MAX_SIDE,
    })
  })

  it('nunca devolve dimensão zero, mesmo com proporção extrema', () => {
    const result = computeFieldDeliveryImageDimensions({ height: 1, width: 8000 })
    expect(result.width).toBe(FIELD_DELIVERY_IMAGE_MAX_SIDE)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })
})

/**
 * M7 (spec 156 T15): a foto do canhoto cai de qualidade em degraus até caber em ~900 KB —
 * `canvas.toBlob` não roda no ambiente de teste, então só a sequência de qualidades (pura,
 * determinística) é testada aqui.
 */
describe('buildFieldDeliveryImageQualitySequence (spec 156 T15, M7)', () => {
  it('começa no padrão (0.85) e desce em degraus de 0.1 até o piso (0.5)', () => {
    expect(buildFieldDeliveryImageQualitySequence()).toEqual([0.85, 0.75, 0.65, 0.55, 0.5])
  })

  it('nunca desce abaixo do piso de legibilidade', () => {
    const sequence = buildFieldDeliveryImageQualitySequence()
    expect(Math.min(...sequence)).toBe(0.5)
  })

  it('qualidade inicial já no piso devolve só o piso', () => {
    expect(buildFieldDeliveryImageQualitySequence(0.5)).toEqual([0.5])
  })
})
