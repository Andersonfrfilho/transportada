/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveStopArrangement,
  type PlacementBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/** Fiorino furgão, a viagem real que gerou a spec 100: 1,70 × 1,45 × 1,30 m. */
const FIORINO = {
  heightM: '1.300',
  lengthM: '1.700',
  source: 'measured' as const,
  widthM: '1.450',
} as const

function box(overrides: Partial<PlacementBox>): PlacementBox {
  return {
    count: 1,
    heightMm: 300,
    isFragile: null,
    isStackable: null,
    keepUpright: null,
    label: 'CAIXA',
    lengthMm: 400,
    maxStackCount: null,
    source: 'measured',
    stopSequence: 1,
    widthMm: 300,
    ...overrides,
  }
}

/** Três paradas de volume igual, caixa pequena: cada faixa recebe ~48 cm de 1,45 m. */
function tresParadas(): readonly PlacementBox[] {
  return [1, 2, 3].map((stopSequence) => box({ stopSequence }))
}

/**
 * ⚠️ **O arranjo é decisão, não coordenada.** Esta política diz apenas se a viagem sai em faixas
 * paralelas à porta ou em fatias de profundidade; onde cada caixa pousa é do empacotador. Misturar
 * as duas responsabilidades faria a decisão depender do resultado que ela mesma determina.
 */
describe('qual arranjo a viagem usa (spec 100 D2)', () => {
  /**
   * Aceite 1. Na viagem da crítica as três paradas cabem lado a lado — e cabendo, é assim que elas
   * ficam: com fatias em profundidade, duas das três só se alcançam descarregando a da frente.
   */
  test('três paradas que cabem lado a lado saem em faixas', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: tresParadas(),
        payloadRatio: null,
      }),
    ).toMatchObject({ arrangement: 'lanes' })
  })

  /**
   * Aceite 2. ⚠️ **Sem exceção silenciosa.** Uma parada que não cabe derruba a viagem inteira, e não
   * só a faixa dela: metade da carga em faixas e metade em profundidade produziria um desenho que
   * ninguém consegue seguir, e o operador seguiria mesmo assim.
   */
  test('uma parada com caixa larga demais derruba a viagem inteira para profundidade', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [
        box({ stopSequence: 1 }),
        box({ stopSequence: 2 }),
        /** 1,20 m de menor dimensão contra os ~0,48 m que a faixa proporcional dá. */
        box({ heightMm: 300, lengthMm: 1_200, stopSequence: 3, widthMm: 1_200 }),
      ],
      payloadRatio: null,
    })

    expect(arranjo).toMatchObject({ arrangement: 'depth' })
  })

  /**
   * ⚠️ A caixa pode **girar**: quem decide o cabimento é a menor dimensão de planta, não o
   * comprimento. Cobrar o comprimento recusaria faixa para uma caixa que entra de lado — e o
   * empacotador já testa as duas orientações em `fitSlot`.
   */
  test('a caixa comprida e estreita cabe na faixa, porque ela gira', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [1, 2, 3].map((stopSequence) => box({ lengthMm: 1_200, stopSequence, widthMm: 300 })),
      payloadRatio: null,
    })

    expect(arranjo).toMatchObject({ arrangement: 'lanes' })
  })

  /**
   * Aceite 3. Com uma parada os dois arranjos desenham a mesma coisa, e nomear um arranjo que não
   * muda nada só daria à tela uma distinção sem diferença.
   */
  test('uma parada só é sempre profundidade', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: [box({ stopSequence: 1 })],
        payloadRatio: null,
      }),
    ).toMatchObject({ arrangement: 'depth' })
  })

  /**
   * Aceite 4. ⚠️ **A física vence o acesso** (spec 099 D3, mantida). Massa concentrada numa faixa
   * junto da porta alivia o eixo dianteiro do mesmo jeito que a carga colada na traseira, e faixa
   * não é motivo para desfazer física.
   */
  /**
   * ⚠️ **Spec 113: as faixas caem, e a grade entra no lugar da profundidade.** A física que a 099 D3
   * protege é a da carga encostada na porta; a grade equilibra **dentro de cada faixa**, então o peso
   * fica espalhado no comprimento como na profundidade — e as primeiras entregas continuam lado a
   * lado. O motivo continua sendo o peso, para a tela dizer por que as faixas caíram.
   */
  test('acima de metade do teto de massa, o peso derruba as faixas', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: tresParadas(),
        payloadRatio: '0.6000',
      }),
    ).toMatchObject({ arrangement: 'grid', reason: 'weight' })
  })

  /** O degrau é em metade exata: `0,5` ainda é faixa, e `0,5001` já não é. */
  test('a metade exata ainda é faixa', () => {
    expect(
      resolveStopArrangement({ bed: FIORINO, boxes: tresParadas(), payloadRatio: '0.5000' }),
    ).toMatchObject({ arrangement: 'lanes' })
  })

  /**
   * Aceite 5. ⚠️ Teto desconhecido **não** afirma peso: ausência de denominador não é motivo para
   * mudar o arranjo, é a mesma regra que a 099 D3 já escreveu.
   */
  test('teto de massa desconhecido não derruba as faixas', () => {
    expect(
      resolveStopArrangement({ bed: FIORINO, boxes: tresParadas(), payloadRatio: null }),
    ).toMatchObject({ arrangement: 'lanes' })
  })

  /** Sem baú não há faixa: a largura da faixa é fração de uma largura que ninguém mediu. */
  test('sem as medidas do baú o arranjo é profundidade', () => {
    expect(
      resolveStopArrangement({ bed: null, boxes: tresParadas(), payloadRatio: null }),
    ).toMatchObject({ arrangement: 'depth', reason: 'noBed' })
  })

  /**
   * ⚠️ Caixa sem medida não decide arranjo — ela já não entra no desenho (spec 085). Deixá-la pesar
   * aqui faria uma linha de zeros derrubar as faixas de uma viagem inteira.
   */
  test('caixa sem medida não conta para o cabimento', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [...tresParadas(), box({ heightMm: 0, lengthMm: 0, stopSequence: 3, widthMm: 0 })],
      payloadRatio: null,
    })

    expect(arranjo).toMatchObject({ arrangement: 'lanes' })
  })

  /**
   * ⚠️ **Carroceria aberta não ganha faixa**, e a razão é a mesma que a 099 D3 escreveu para o
   * equilíbrio: quem abre o comprimento inteiro já tem toda a carga à mão, e não existe "a porta" a
   * que encostar. Faixa ali não resolve acesso nenhum e só desfaria o equilíbrio de peso.
   */
  test('carroceria aberta sai em profundidade, e equilibra como sempre', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: tresParadas(),
        loadingAccess: 'open',
        payloadRatio: null,
      }),
    ).toMatchObject({ arrangement: 'depth' })
  })

  /** Baú que abre atrás é o caso que a spec mira: é ali que a parada de trás fica inalcançável. */
  test('baú que só abre atrás é justamente quem ganha faixa', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: tresParadas(),
        loadingAccess: 'rear',
        payloadRatio: null,
      }),
    ).toMatchObject({ arrangement: 'lanes' })
  })

  /**
   * ⚠️ **A faixa não é proporcional ao volume, e a viagem real provou isso.** A primeira versão media
   * o cabimento pela fatia proporcional, e na crítica a parada menor levava 19% do volume, ganhava
   * 0,28 m de faixa e tinha caixa de 0,30 m — a feature não disparava justamente no caso que a
   * motivou. A faixa vai do chão ao teto e da porta à testeira: o que a parada exige da largura é
   * caber a caixa mais larga dela.
   */
  test('a parada menor não derruba as faixas só por ser pequena', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [
        box({ count: 12, stopSequence: 1 }),
        box({ stopSequence: 2 }),
        box({ stopSequence: 3 }),
      ],
      payloadRatio: null,
    })

    expect(arranjo).toMatchObject({ arrangement: 'lanes', reason: 'fits' })
  })

  /**
   * ⚠️ **Caber em largura não é caber, e este é o defeito que a revisão pegou.** Duas paradas de uma
   * caixa cada seguram 0,60 m de um baú de 1,45 m; a parada dominante fica com 0,85 m, que não
   * comporta o volume dela. Sem este teste o arranjo saía `lanes` e o empacotador descartava **15 de
   * 57 caixas** como `bedFull` num baú 64% cheio — as mesmas 57 cabiam em profundidade.
   */
  test('a parada dominante estrangulada pelo mínimo das vizinhas derruba as faixas', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [
        box({ stopSequence: 1 }),
        box({ stopSequence: 2 }),
        box({ count: 55, stopSequence: 3 }),
      ],
      payloadRatio: null,
    })

    expect(arranjo).toMatchObject({ arrangement: 'depth', reason: 'volumeDoesNotFit' })
  })

  /** E o motivo distingue as causas, que é o que a tela precisa para explicar a troca. */
  test('cada recusa diz por que recusou', () => {
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: tresParadas(),
        loadingAccess: 'open',
        payloadRatio: null,
      }).reason,
    ).toBe('openBody')
    expect(
      resolveStopArrangement({ bed: FIORINO, boxes: tresParadas(), payloadRatio: '0.6000' }).reason,
    ).toBe('weight')
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: [box({ stopSequence: 1 })],
        payloadRatio: null,
      }).reason,
    ).toBe('singleStop')
    expect(
      resolveStopArrangement({
        bed: FIORINO,
        boxes: [1, 2, 3].map((stopSequence) => box({ lengthMm: 600, stopSequence, widthMm: 600 })),
        payloadRatio: null,
      }).reason,
    ).toBe('tooWide')
  })

  /**
   * O que derruba as faixas é a soma dos mínimos não caber na largura: três caixas de 0,60 m pedem
   * 1,80 m num baú de 1,45 m.
   */
  test('faixas cabem todas ou nenhuma, e a soma dos mínimos é quem decide', () => {
    const arranjo = resolveStopArrangement({
      bed: FIORINO,
      boxes: [1, 2, 3].map((stopSequence) => box({ lengthMm: 600, stopSequence, widthMm: 600 })),
      payloadRatio: null,
    })

    /**
     * ⚠️ Spec 113: continua sendo tudo ou nada **para as faixas** — nenhuma parada ganha faixa própria
     * enquanto outra fica em profundidade. O que mudou é o que entra no lugar: a grade, que não é meia
     * faixa, e sim a mesma regra em toda faixa.
     */
    expect(arranjo).toMatchObject({ arrangement: 'grid', reason: 'tooWide' })
  })
})
