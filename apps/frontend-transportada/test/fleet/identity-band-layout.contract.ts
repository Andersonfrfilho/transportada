/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readCssBlock, readStylesheet } from '../design-system/cssBlock.helper'

describe('faixa de identidade do veículo no celular (revisão do painel)', () => {
  /** Medido em 375px: com a placa fixa ao lado do texto, ele caía para 39px e virava uma coluna de letras. */
  test('a faixa quebra por conteúdo: o texto exige largura mínima e desce quando ela falta', async () => {
    const styles = await readStylesheet('src/modules/fleet/styles/fleet.module.css')
    const band = readCssBlock(styles, '.identityBand')
    const facts = readCssBlock(styles, '.identityFacts')

    expect(band).toContain('display: flex')
    expect(band).toContain('flex-wrap: wrap')
    expect(band).not.toContain('grid-template-columns')
    expect(facts).toContain('flex: 1 1 14rem')
    expect(facts).toContain('min-width: 0')
  })
})

describe('texto oculto dentro da tabela rolável da frota (revisão do painel)', () => {
  test('ancora o texto só-leitor à borda esquerda, em vez da posição estática', async () => {
    const styles = await readStylesheet('src/modules/fleet/styles/fleet.module.css')

    expect(readCssBlock(styles, '.srOnly')).toContain('left: 0')
  })
})
