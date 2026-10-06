/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readCssBlock, readStylesheet } from '../design-system/cssBlock.helper'

describe('faixa de identidade do veículo no celular (revisão do painel)', () => {
  /** Medido em 375px no detalhe da viagem: com `auto minmax(0, 1fr)` a placa de 10rem começava em x=262 e a página rolava até 422. */
  test('abaixo de 40rem a faixa é uma coluna só, e a placa não escolhe a segunda', async () => {
    const styles = await readStylesheet('src/modules/fleet/styles/fleet.module.css')
    const band = readCssBlock(styles, '.identityBand')

    expect(band).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(band).not.toContain('auto minmax(0, 1fr)')
  })
})

describe('texto oculto dentro da tabela rolável da frota (revisão do painel)', () => {
  test('ancora o texto só-leitor à borda esquerda, em vez da posição estática', async () => {
    const styles = await readStylesheet('src/modules/fleet/styles/fleet.module.css')

    expect(readCssBlock(styles, '.srOnly')).toContain('left: 0')
  })
})
