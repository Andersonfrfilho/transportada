/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { buildCargoPlanView } from '@/modules/trip/shared/cargoPlanBands.service'
import { stopColorOf } from '@/modules/trip/shared/stopColor.service'
import type { TripCargoLayout } from '@/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function slice(overrides: Partial<TripCargoLayout['slices'][number]>) {
  return {
    boxesToMeasure: 0,
    depthM: '1.000',
    distanceFromDoorM: '2.900',
    label: 'Barrinha',
    layers: null,
    loadOrder: 3,
    sequence: 1,
    share: '0.1124',
    volumeM3: '6.000000',
    ...overrides,
  }
}

/** Baú de truck: 8,900 × 2,500. Três paradas, 1 m + 2 m + 3 m de carga, 2,9 m livres na porta. */
const LAYOUT: TripCargoLayout = {
  bedHeightM: '2.300',
  bedLengthM: '8.900',
  bedWidthM: '2.500',
  freeDepthM: '2.900',
  freeRows: 6,
  /** Baú de truck do teste: só a traseira abre. */
  loadingAccess: 'rear' as const,
  occupancyKnown: true,
  orderIsBinding: true,
  /** Spec 094: sem arranjo é o caso da API antiga, e a planta de faixas continua valendo. */
  placement: null,
  overflowDepthM: '0.000',
  overflowM3: '0.000000',
  rows: [],
  slices: [
    slice({}),
    slice({
      depthM: '2.000',
      distanceFromDoorM: '3.900',
      label: 'Descalvado',
      loadOrder: 2,
      sequence: 2,
    }),
    slice({
      depthM: '3.000',
      distanceFromDoorM: '5.900',
      label: 'Campinas',
      loadOrder: 1,
      sequence: 3,
    }),
  ],
  stopsWithoutVolume: [],
}

describe('a planta do baú em escala (spec 088 R2/R3)', () => {
  /**
   * Critério 1: a proporção na tela é a razão comprimento/largura da ficha. É a promessa inteira do
   * desenho — quem olha mede com a fita o que a tela mostra.
   */
  it('leva o baú da ficha para o desenho, na proporção real', () => {
    expect(buildCargoPlanView(LAYOUT)?.bed).toEqual({ lengthM: 8.9, widthM: 2.5 })
  })

  /**
   * Critério 4: do fundo para a porta, na ordem inversa da entrega. Campinas entrega por último e
   * encosta na parede do fundo (offset zero); Barrinha entrega primeiro e fica junto da porta.
   */
  it('encosta a última entrega no fundo e a primeira na porta', () => {
    const bands = buildCargoPlanView(LAYOUT)?.bands ?? []

    expect(bands.map((band) => [band.id, band.offsetM, band.lengthM])).toEqual([
      ['3', 0, 3],
      ['2', 3, 2],
      ['1', 5, 1],
    ])
  })

  /**
   * ⚠️ A cor sai de `stopColorOf(sequence)`, a MESMA função do mapa. As faixas saem na ordem de
   * carregamento (3, 2, 1), então a primeira faixa desenhada é a parada 3 e ela tem de sair com a
   * cor 3 — pintar pelo índice daria a cor 1 aqui e a cor 3 no mapa, para a mesma parada.
   */
  it('pinta cada parada com a mesma cor que o mapa da tela ao lado', () => {
    const bands = buildCargoPlanView(LAYOUT)?.bands ?? []

    expect(bands.map((band) => [band.id, band.color])).toEqual([
      ['3', stopColorOf(3)],
      ['2', stopColorOf(2)],
      ['1', stopColorOf(1)],
    ])
    expect(bands.map((band) => band.color)).toEqual([
      'var(--color-cargo-stop-3)',
      'var(--color-cargo-stop-2)',
      'var(--color-cargo-stop-1)',
    ])
  })

  /** R5: em `rear` a ordem é obrigação, e não há borda lateral alcançável para marcar. */
  it('marca a borda lateral só em veículo que abre pelo lado', () => {
    expect(buildCargoPlanView(LAYOUT)?.bands.every((band) => band.sideMarked === undefined)).toBe(
      true,
    )
    expect(
      buildCargoPlanView({ ...LAYOUT, orderIsBinding: false })?.bands.every(
        (band) => band.sideMarked === true,
      ),
    ).toBe(true)
  })

  /**
   * ⚠️ Critério 6: o excedente é hachurado e sai **fora** do contorno, que continua nos 8,9 m.
   * Encolher tudo para caber esconderia o estouro, que é a informação.
   */
  it('desenha fora da porta o que não coube', () => {
    const view = buildCargoPlanView({
      ...LAYOUT,
      freeDepthM: '0.000',
      overflowDepthM: '1.100',
      slices: [
        slice({ depthM: '2.000', distanceFromDoorM: '-1.100', loadOrder: 2, sequence: 1 }),
        slice({
          depthM: '8.000',
          distanceFromDoorM: '0.900',
          label: 'Campinas',
          loadOrder: 1,
          sequence: 2,
        }),
      ],
    })

    expect(view?.overflowM).toBe(1.1)
    expect(view?.bed.lengthM).toBe(8.9)
    expect(view?.bands.map((band) => [band.offsetM, band.outside])).toEqual([
      [0, undefined],
      [8, true],
    ])
  })

  /**
   * ⚠️ Critério 2 e R6: sem as três medidas **não há planta**. É o estado de toda a frota hoje, e
   * desenhar com a referência de mercado — que erra por 2× dentro do tipo — seria dizer em metro
   * uma coisa que a fita do conferente vai desmentir.
   */
  it('não desenha planta nenhuma sem a medida do baú', () => {
    expect(buildCargoPlanView({ ...LAYOUT, bedLengthM: null, bedWidthM: null })).toBeNull()
    expect(buildCargoPlanView({ ...LAYOUT, bedWidthM: null })).toBeNull()
    expect(buildCargoPlanView(null)).toBeNull()
  })

  /** Parada sem cubagem não vira faixa de tamanho zero: ela é listada ao lado, como na 085. */
  it('deixa de fora a parada sem profundidade em vez de desenhá-la com zero', () => {
    const view = buildCargoPlanView({
      ...LAYOUT,
      slices: [slice({ depthM: null, distanceFromDoorM: null })],
    })

    expect(view?.bands).toEqual([])
  })
})

/**
 * ⚠️ Contrato por texto de fonte: esta app não tem DOM nos testes. Sem a fiação a planta não
 * aparece e nada quebra — o painel continua desenhando as fileiras da 085, e a feature inteira
 * fica invisível.
 */
describe('a planta chega à tela de montagem', () => {
  it('entra no painel de carga, ao lado das fileiras e nunca no lugar delas', async () => {
    const panel = await readApplicationFile(
      'src/modules/trip/components/TripCargoPanel.component.tsx',
    )

    expect(panel).toContain('<TripCargoDrawing')
    expect(panel).toContain('<TripCargoPlan')
  })

  /** R6: o aviso nomeia o campo que falta e diz onde ele fica — atalho para lugar nenhum não serve. */
  it('nomeia o campo que falta quando o baú não tem medida', async () => {
    const plan = await readApplicationFile(
      'src/modules/trip/components/TripCargoPlan.component.tsx',
    )
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const messages = (JSON.parse(locale) as { cargoPlan: Record<string, string> }).cargoPlan

    expect(plan).toContain('cargoPlan.missingBedField')
    expect(messages.missingBedField).toContain('comprimento')
    expect(messages.missingBedField).toContain('largura')
    expect(messages.missingBedField).toContain('altura')
    expect(messages.missingBedField).toContain('Frota')
  })

  /**
   * R4: a tela diz **quantas** caixas faltam medir e **leva** à fila da 085. Frase estática sem
   * número é a mesma mensagem para três caixas e para duzentas, e sem atalho o conferente descobre
   * sozinho onde fica a fila — que é o trabalho que a linha existe para poupar.
   */
  it('conta as caixas que faltam medir e leva até a fila', async () => {
    const plan = await readApplicationFile(
      'src/modules/trip/components/TripCargoPlan.component.tsx',
    )
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const messages = (JSON.parse(locale) as { cargoPlan: Record<string, string> }).cargoPlan

    expect(plan).toContain("const BOX_QUEUE_HREF = '/?tab=boxes'")
    expect(plan).toContain('href={BOX_QUEUE_HREF}')
    /** A contagem sai de `boxesToMeasure`, nunca de quantas faixas ficaram sem camada. */
    expect(plan).toContain('slice.boxesToMeasure')
    expect(plan).not.toContain('layers !== null')
    expect(messages.unmeasuredBoxes).toContain('{{count}}')
    expect(messages.unmeasuredBoxes_other).toContain('{{count}}')
    expect(messages.band).toContain('{{depth}}')
    expect(messages.band).toContain('{{distance}}')
  })

  /**
   * ⚠️ A paleta tem UMA fonte, e o contrato varre por texto de fonte porque a divergência anterior
   * era aritmética equivalente por acidente — `index % 6` e `(sequence - 1) % 6` davam a mesma cor
   * até alguém ordenar a lista por outra coisa, que foi exatamente o que a 088 fez.
   */
  it('não deixa nenhuma cópia da paleta de paradas viva no módulo', async () => {
    const offenders: string[] = []
    for (const filePath of [
      'src/modules/trip/components/TripAssemblyMap.component.tsx',
      'src/modules/trip/components/TripCargoPanel.component.tsx',
      'src/modules/trip/shared/cargoPlanBands.service.ts',
    ]) {
      const source = await readApplicationFile(filePath)
      if (source.includes('--color-cargo-stop-$')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
  })

  /**
   * ⚠️ Toda chave nova da planta existe nos dois idiomas. O `fallbackLng` esconde a falta: a tela
   * fica metade em inglês e metade em português, e nada falha.
   */
  it('publica a planta nos dois idiomas', async () => {
    const pt = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const en = await readApplicationFile('src/modules/trip/locales/trip.en.locale.json')
    const keysOf = (locale: string) =>
      Object.keys((JSON.parse(locale) as { cargoPlan: Record<string, string> }).cargoPlan).sort()

    expect(keysOf(en)).toEqual(keysOf(pt))
  })

  /** A aba da fila abre pela URL: atalho que larga na aba errada não é atalho. */
  it('abre a aba Caixas pela URL que o atalho usa', async () => {
    const workspace = await readApplicationFile(
      'src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx',
    )

    expect(workspace).toContain('readTabFromLocation')
    expect(workspace).toContain("requested === 'boxes'")
  })

  /**
   * ⚠️ A política é explícita que zerar a distância negativa faria o desenho afirmar que a carga
   * coube. A linha da legenda tem frase própria para quem atravessou a porta.
   */
  it('não zera a distância de quem atravessou a porta', async () => {
    const plan = await readApplicationFile(
      'src/modules/trip/components/TripCargoPlan.component.tsx',
    )
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const messages = (JSON.parse(locale) as { cargoPlan: Record<string, string> }).cargoPlan

    expect(plan).toContain('cargoPlan.bandThroughDoor')
    expect(plan).not.toContain('Math.max(0, Number.parseFloat(slice.distanceFromDoorM))')
    expect(messages.bandThroughDoor).toContain('fora da porta')
  })

  /** Mobile-first: a planta rola no PRÓPRIO contêiner, nunca a página (a escala não se comprime). */
  it('rola no próprio contêiner em vez de comprimir a escala', async () => {
    const stylesheet = await readApplicationFile('src/components/ui/scale-plan.module.css')

    expect(stylesheet).toContain('overflow-x: auto')
    expect(stylesheet).not.toContain('max-width: 100%')
  })
})

/**
 * Spec 088 G005: **o que a tela promete.** As três frases abaixo não são enfeite — cada uma
 * conserta uma leitura errada que o desenho convida, e nenhuma delas pode viver só em comentário
 * de código: o conferente lê a tela, não o repositório.
 */
describe('o que a planta promete, e o que ela recusa a prometer', () => {
  async function planMessages(): Promise<Record<string, string>> {
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    return (JSON.parse(locale) as { cargoPlan: Record<string, string> }).cargoPlan
  }

  /**
   * ⚠️ A planta **parece** um plano de estiva, e com 6 de 663 caixas medidas ela não é. Quem a
   * lesse como posição de peça carregaria seguindo um desenho que não sabe onde a caixa vai.
   */
  it('diz na tela que a faixa é espaço reservado por volume, não posição de caixa', async () => {
    const messages = await planMessages()
    const plan = await readApplicationFile(
      'src/modules/trip/components/TripCargoPlan.component.tsx',
    )

    expect(plan).toContain('cargoPlan.reserved')
    expect(messages.reserved).toContain('espaço')
    expect(messages.reserved).toContain('não a posição das caixas')
  })

  /** Nomear o campo não basta: quem lê está montando viagem, e o caminho de volta é o atalho. */
  it('leva até a ficha do veículo, e não só nomeia o campo', async () => {
    const plan = await readApplicationFile(
      'src/modules/trip/components/TripCargoPlan.component.tsx',
    )

    expect(plan).toContain("const FLEET_HREF = '/fleet'")
    expect(plan).toContain('href={FLEET_HREF}')
  })

  /**
   * ⚠️ Critério 7: `three_quarter` e todo `body_type = '00'` não têm linha em
   * `vehicle_volume_references`. Sem ficha e sem m³ digitado a ocupação inteira sumia do painel
   * sem uma palavra — e sumir calado é o avesso de "continua nomeado".
   */
  it('nomeia o veículo sem capacidade nem referência em vez de esconder o caso', async () => {
    const panel = await readApplicationFile(
      'src/modules/trip/components/TripCargoPanel.component.tsx',
    )
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const occupancy = (JSON.parse(locale) as { occupancy: Record<string, string> }).occupancy

    expect(panel).toContain('occupancy.capacityUnknown')
    expect(occupancy.capacityUnknown).toContain('referência')
    expect(occupancy.capacityUnknown).toContain('Frota')
  })
})
