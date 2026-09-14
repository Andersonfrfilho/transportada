/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildCargoPrintSummary } from '@/modules/trip/shared/cargoPrintSummary.service'
import { resolveSliceCuts } from '@/modules/trip/shared/cargoLegend.service'

const CAMADAS = 'src/modules/trip/components/TripCargoLayers.component.tsx'
const LOCALE = 'src/modules/trip/locales/trip.locale.json'

function fonte(caminho: string): string {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')
}

function caixa(overrides: Record<string, unknown>) {
  return {
    depthM: 0.4,
    isEstimated: false,
    isSplit: false,
    stopSequence: 1,
    widthM: 0.3,
    xM: 0,
    yM: 0,
    ...overrides,
  }
}

/**
 * **A tabela impressa acompanha o eixo do arranjo** (spec 100 D5).
 *
 * ⚠️ O cabeçalho "da testeira para a porta" e a coluna "Faixa do baú" descrevem **profundidade**.
 * Com as paradas lado a lado eles passam a mentir: a faixa é de largura, e nenhuma parada está atrás
 * de outra. O galpão imprime esta folha em laser mono e carrega o caminhão por ela.
 */
describe('a folha de carregamento em faixas', () => {
  const EM_FAIXAS = [
    caixa({ stopSequence: 1, yM: 0 }),
    caixa({ stopSequence: 2, yM: 0.5 }),
    caixa({ stopSequence: 3, yM: 1 }),
  ]

  it('mede a faixa na largura, e não na profundidade', () => {
    const linhas = buildCargoPrintSummary(EM_FAIXAS, 'lanes')

    expect(linhas.map((linha) => linha.fromM)).toEqual([0, 0.5, 1])
    expect(linhas.map((linha) => linha.toM)).toEqual([0.3, 0.8, 1.3])
  })

  /**
   * ⚠️ **A ordem da folha inverte com o eixo.** Em profundidade ela é a de carregamento — a última
   * entrega primeiro, porque vai ao fundo. Em faixas quem carrega começa pela faixa mais à mão, que
   * é a da primeira entrega.
   */
  it('lista da primeira entrega para a última', () => {
    expect(buildCargoPrintSummary(EM_FAIXAS, 'lanes').map((linha) => linha.stopSequence)).toEqual([
      1, 2, 3,
    ])
  })

  /** Em profundidade nada muda: a última entrega continua encabeçando a folha. */
  it('em profundidade continua da última entrega para a primeira', () => {
    const linhas = buildCargoPrintSummary(
      [
        caixa({ stopSequence: 1, xM: 1 }),
        caixa({ stopSequence: 2, xM: 0.5 }),
        caixa({ stopSequence: 3, xM: 0 }),
      ],
      'depth',
    )

    expect(linhas.map((linha) => linha.stopSequence)).toEqual([3, 2, 1])
    expect(linhas[0]?.fromM).toBe(0)
  })
})

/**
 * ⚠️ **A divisa entre paradas muda de eixo com o arranjo.** Em faixas ela é um plano ao longo do
 * comprimento; desenhá-la no eixo antigo cortaria a carga de todas as paradas de uma vez, sugerindo
 * uma separação que o arranjo não tem.
 */
describe('a divisa desenhada', () => {
  const CAIXAS = [
    caixa({ stopSequence: 1, xM: 0, yM: 0 }),
    caixa({ stopSequence: 2, xM: 0, yM: 0.5 }),
  ]

  it('em faixas a divisa é medida na largura', () => {
    expect(resolveSliceCuts(CAIXAS, 'lanes')).toEqual([0.5])
  })

  /** Em profundidade nada muda: as duas paradas no mesmo `x` não têm divisa nenhuma. */
  it('em profundidade a divisa continua na profundidade', () => {
    expect(resolveSliceCuts(CAIXAS, 'depth')).toEqual([])
  })

  it('a planta recebe o eixo da divisa junto com o desenho', () => {
    expect(fonte(CAMADAS)).toContain('sliceCutsAcrossWidth')
  })
})

/**
 * ⚠️ **A tela diz qual arranjo desenhou.** Sem isso, quem viu faixas numa viagem e profundidade na
 * seguinte conclui que o desenho é aleatório — e o corte entre os dois (caixa larga demais, ou peso
 * acima de metade do teto) não é adivinhável olhando a planta.
 */
describe('a tela nomeia o arranjo', () => {
  it('imprime o arranjo e troca o cabeçalho da folha com ele', () => {
    const source = fonte(CAMADAS)

    expect(source).toContain('stopArrangement')
    expect(source).toContain('cargoLayers.arrangement.')
    expect(source).toContain('cargoLayers.print.caption.')
  })

  /**
   * ⚠️ **A troca por peso é anunciada** (spec 100 D4). O peso venceu o acesso, e sem dizer isso a
   * tela deixa a impressão de que a faixa simplesmente não coube.
   */
  it('avisa quando foi o peso que trocou o arranjo', () => {
    expect(fonte(CAMADAS)).toContain('cargoLayers.arrangement.weightWon')
  })

  /**
   * ⚠️ **Quem diz que foi o peso é a API, e a tela não deduz.** Concluir isso de `depth` mais carga
   * pesada afirmava o mesmo na viagem de uma parada só, na carroceria aberta e quando as faixas não
   * caberiam de todo jeito — nos três o operador conclui que aliviar a carga devolveria as faixas, e
   * não devolve. Achado na revisão da spec 100.
   */
  it('o aviso sai do motivo publicado, nunca de uma dedução sobre o peso', () => {
    const source = fonte(CAMADAS)

    expect(source).toContain("layout.stopArrangementReason === 'weight'")
    expect(source).not.toContain('BALANCE_PAYLOAD_RATIO')
    expect(source).not.toContain('payloadRatio')
  })

  it('tem texto para os dois arranjos e para a troca por peso', () => {
    const locale = JSON.parse(fonte(LOCALE)) as {
      cargoLayers: {
        arrangement: Record<string, string>
        print: { caption: Record<string, string> }
      }
    }

    expect(locale.cargoLayers.arrangement.lanes).toBeTruthy()
    expect(locale.cargoLayers.arrangement.depth).toBeTruthy()
    expect(locale.cargoLayers.arrangement.weightWon).toBeTruthy()
    expect(locale.cargoLayers.print.caption.lanes).toBeTruthy()
    expect(locale.cargoLayers.print.caption.depth).toBeTruthy()
  })
})

/**
 * **A planta explica as próprias decisões** (spec 100 D9).
 *
 * ⚠️ Ela é uma **instrução**, e instrução sem motivo não se confere. Quem carrega precisa saber se a
 * pilha parou por estabilidade ou por falta de caixa, e se a carga foi para o fundo por escolha ou
 * por não caber — senão a única leitura possível é "o sistema decidiu", e aí ou se obedece sem
 * entender, ou se ignora.
 */
describe('por que o desenho ficou assim', () => {
  it('imprime as decisões que a API publicou, e não uma lista fixa', () => {
    const source = fonte(CAMADAS)

    expect(source).toContain('layout.layoutNotes')
    expect(source).toContain('cargoLayers.notes.')
  })

  /** ⚠️ Nota que valeria para toda viagem é ruído, e ruído fixo deixa de ser lido na terceira vez. */
  it('não desenha o bloco quando não há decisão a explicar', () => {
    expect(fonte(CAMADAS)).toContain('(layout.layoutNotes ?? []).length === 0 ? null')
  })

  it('tem texto para cada decisão que a API sabe publicar', () => {
    const locale = JSON.parse(fonte(LOCALE)) as {
      cargoLayers: { notes: Record<string, string> }
    }

    for (const chave of [
      'doorIsNotAWall',
      'heightBeforeDepth',
      'stackConfined',
      'stackSecured',
      'stackStability',
    ]) {
      expect(locale.cargoLayers.notes[chave]).toBeTruthy()
    }
    expect(locale.cargoLayers.notes.title).toBeTruthy()
  })
})

/**
 * ⚠️ **O motorista muda o desenho, então ele entra na chave da consulta.** Sem isso a planta ficaria
 * a do motorista anterior — e a diferença é a altura da pilha, que é o que decide se a carga tomba.
 */
describe('quem amarra a carga', () => {
  it('a prévia da carga recebe os motoristas escolhidos', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/hooks/useTripCargoPreview.hook.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('driverIds: input.driverIds')
    expect(source).toContain('driverKey')
  })
})
