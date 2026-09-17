/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { EXTERNAL_CONNECT_ORIGIN } from '../../src/modules/shared/contentSecurityPolicy.service'
import type { FreightRegion } from '../../src/modules/fleet/shared/freightRegion.types'
import {
  buildStateMeshUrl,
  loadStateMeshFeatures,
  readStateMeshFeatures,
} from '../../src/modules/shared/ibgeMesh.service'
import {
  FREIGHT_REGION_ZONE_FILL,
  buildFreightRegionMap,
  resolveDefaultMapState,
  resolveFreightRegionBounds,
  resolveZoneFill,
  toFreightRegionFeatureCollection,
  toggleRegionMapCity,
} from '../../src/modules/fleet/shared/freightRegionMap.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Quadrado de um grau, para a projeção ser conferível sem depender do desenho real de um município. */
function square(input: Readonly<{ latitude: number; longitude: number }>): number[][][] {
  const { latitude, longitude } = input
  return [
    [
      [longitude, latitude],
      [longitude + 1, latitude],
      [longitude + 1, latitude + 1],
      [longitude, latitude + 1],
      [longitude, latitude],
    ],
  ]
}

function meshPayload(): unknown {
  return {
    features: [
      {
        geometry: { coordinates: square({ latitude: -22.5, longitude: -47 }), type: 'Polygon' },
        properties: { codarea: '3530607' },
        type: 'Feature',
      },
      {
        geometry: { coordinates: square({ latitude: -22.5, longitude: -46 }), type: 'Polygon' },
        properties: { codarea: 3531100 },
        type: 'Feature',
      },
    ],
    type: 'FeatureCollection',
  }
}

function region(overrides: Partial<FreightRegion>): FreightRegion {
  return {
    cities: [],
    code: '1.001',
    createdAt: '2026-08-01T00:00:00.000Z',
    id: 'region-1',
    name: 'Alta Mogiana',
    rates: [],
    status: 'active',
    updatedAt: '2026-08-01T00:00:00.000Z',
    version: '1',
    zone: 1,
    ...overrides,
  }
}

const MOGI_MIRIM = { code: '3530607', name: 'Mogi Mirim' } as const
const MOGI_GUACU = { code: '3531100', name: 'Mogi Guaçu' } as const

describe('ibge mesh contract', () => {
  /** Uma UF por vez: a malha do país inteiro é megabytes para desenhar uma tabela de um estado. */
  test('a malha é pedida por UF, na qualidade mínima e recortada por município', () => {
    const url = buildStateMeshUrl(' sp ')

    expect(url.startsWith('https://servicodados.ibge.gov.br/api/v3/malhas/estados/SP')).toBe(true)
    expect(url).toContain('qualidade=minima')
    expect(url).toContain('intrarregiao=municipio')
    expect(url).toContain('geo%2Bjson')
  })

  test('cada feição vira código e anéis crus, sem projeção', () => {
    const features = readStateMeshFeatures(meshPayload())

    expect(features).toHaveLength(2)
    const [first] = features
    expect(first?.code).toBe('3530607')
    expect(first?.rings.length).toBeGreaterThan(0)
  })

  /** `codarea` chega como número em parte da malha; município não pode sumir por causa do tipo. */
  test('o código numérico da malha vira o mesmo texto do código do IBGE', () => {
    const features = readStateMeshFeatures(meshPayload())

    expect(features.map((feature) => feature.code)).toEqual(['3530607', '3531100'])
  })

  /** Ilha e continente do mesmo município continuam sendo um só, com um anel por pedaço. */
  test('o município com mais de um anel continua sendo um só', () => {
    const features = readStateMeshFeatures({
      features: [
        {
          geometry: {
            coordinates: [
              square({ latitude: -24, longitude: -47 }),
              square({ latitude: -24, longitude: -45 }),
            ],
            type: 'MultiPolygon',
          },
          properties: { codarea: '3548500' },
          type: 'Feature',
        },
      ],
      type: 'FeatureCollection',
    })

    expect(features).toHaveLength(1)
    expect(features[0]?.rings).toHaveLength(2)
  })

  /** Um município ilegível não apaga o estado: o que não dá para desenhar sai do desenho, só ele. */
  test('feição sem código ou sem geometria é descartada sozinha', () => {
    const features = readStateMeshFeatures({
      features: [
        { geometry: null, properties: { codarea: '3500105' }, type: 'Feature' },
        { geometry: { coordinates: [], type: 'Polygon' }, properties: {}, type: 'Feature' },
        {
          geometry: { coordinates: square({ latitude: -22, longitude: -47 }), type: 'Polygon' },
          properties: { codarea: '3530607' },
          type: 'Feature',
        },
      ],
      type: 'FeatureCollection',
    })

    expect(features.map((feature) => feature.code)).toEqual(['3530607'])
  })

  /** Corpo que não é malha é falha visível, não mapa em branco: caixa vazia sem aviso é pior. */
  test('corpo que não é malha vira falha', () => {
    expect(() => readStateMeshFeatures({ hello: 'world' })).toThrow('FLEET_IBGE_MESH_MALFORMED')
  })

  test('provedor fora do ar propaga a falha', () => {
    const failing = (() =>
      Promise.resolve(
        new Response('nope', { status: 502, statusText: 'Bad Gateway' }),
      )) as unknown as typeof globalThis.fetch

    expect(
      loadStateMeshFeatures({ fetch: failing, signal: new AbortController().signal, state: 'SP' }),
    ).rejects.toThrow('FLEET_IBGE_MESH_REQUEST_FAILED')
  })

  /** UF fora da lista não vira requisição: o provedor responderia 404 e a tela ficaria carregando. */
  test('UF desconhecida não sai para a rede', async () => {
    let calls = 0
    const counting = (() => {
      calls += 1
      return Promise.resolve(new Response('{}'))
    }) as unknown as typeof globalThis.fetch

    const features = await loadStateMeshFeatures({
      fetch: counting,
      signal: new AbortController().signal,
      state: 'ZZ',
    })

    expect(features).toEqual([])
    expect(calls).toBe(0)
  })
})

describe('freight region map contract', () => {
  test('o polígono casa com a cidade da zona pelo codarea', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM, MOGI_GUACU],
      regions: [region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }] })],
      state: 'SP',
    })

    const drawn = model.shapes.find((shape) => shape.code === MOGI_MIRIM.code)
    expect(drawn?.city).toBe('Mogi Mirim')
    expect(drawn?.zone).toBe(1)
    expect(drawn?.rings.length).toBeGreaterThan(0)
    expect(drawn?.claims.map((claim) => claim.id)).toEqual(['region-1'])
    expect(model.outside).toEqual([])
  })

  /** O município sem zona continua desenhado: o mapa serve para ver o que **não** está coberto. */
  test('município sem zona é desenhado em branco, não escondido', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM, MOGI_GUACU],
      regions: [region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }] })],
      state: 'SP',
    })

    const uncovered = model.shapes.find((shape) => shape.code === MOGI_GUACU.code)
    expect(model.shapes).toHaveLength(2)
    expect(uncovered?.claims).toEqual([])
    expect(uncovered?.zone).toBe(null)
  })

  /** A dobra é a mesma da entrada de cidade: `MOGI-MIRIM` da planilha é a linha do IBGE. */
  test('a cidade casa pela dobra, não pela grafia', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM, MOGI_GUACU],
      regions: [region({ cities: [{ city: 'MOGI-MIRIM', state: 'SP' }] })],
      state: 'SP',
    })

    expect(model.shapes.find((shape) => shape.code === MOGI_MIRIM.code)?.zone).toBe(1)
  })

  /**
   * Cidade sem polígono volta **nomeada**: sumir do desenho sem dizer qual é faz a pessoa procurar
   * no mapa uma cidade que a malha não tem, e é assim que erro de grafia passa em branco.
   */
  test('cidade sem polígono aparece nomeada fora do mapa', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM],
      regions: [
        region({
          cities: [
            { city: 'Mogi Mirim', state: 'SP' },
            { city: 'Cidade Que Nao Existe', state: 'SP' },
          ],
        }),
      ],
      state: 'SP',
    })

    expect(model.outside).toEqual([
      { city: 'Cidade Que Nao Existe', regionName: 'Alta Mogiana', state: 'SP' },
    ])
  })

  /**
   * `BARRINHA/SP` está em duas rotas na planilha real do cliente, e a unicidade do banco permite:
   * o desenho pinta a primeira por código e **nomeia as duas** — mapa localiza, não arbitra.
   */
  test('cidade em duas rotas é desenhada uma vez, com as duas rotas nomeadas', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM],
      regions: [
        region({
          cities: [{ city: 'Mogi Mirim', state: 'SP' }],
          code: '2.002',
          id: 'region-2',
          name: 'Baixa Mogiana',
          zone: 2,
        }),
        region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }] }),
      ],
      state: 'SP',
    })

    const drawn = model.shapes.find((shape) => shape.code === MOGI_MIRIM.code)
    expect(drawn?.claims.map((claim) => claim.code)).toEqual(['1.001', '2.002'])
    expect(drawn?.zone).toBe(1)
  })

  /** Rota inativada pela importação não pinta: o desenho mostra o que a transportadora paga hoje. */
  test('rota inativa não pinta e não vira aviso', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM],
      regions: [
        region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }], status: 'inactive' }),
        region({
          cities: [{ city: 'Cidade Sem Malha', state: 'SP' }],
          id: 'r2',
          status: 'inactive',
        }),
      ],
      state: 'SP',
    })

    expect(model.shapes.find((shape) => shape.code === MOGI_MIRIM.code)?.claims).toEqual([])
    expect(model.outside).toEqual([])
  })

  /** A malha é de uma UF: cidade de outro estado não é cidade que faltou no desenho. */
  test('cidade de outra UF fica fora da conta do estado desenhado', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM],
      regions: [region({ cities: [{ city: 'Uberaba', state: 'MG' }] })],
      state: 'SP',
    })

    expect(model.outside).toEqual([])
    expect(model.shapes.every((shape) => shape.claims.length === 0)).toBe(true)
  })

  test('a malha ainda carregando não inventa mapa', () => {
    const model = buildFreightRegionMap({
      features: [],
      municipalities: [],
      regions: [region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }] })],
      state: 'SP',
    })

    expect(model.shapes).toEqual([])
    expect(model.outside).toEqual([])
  })

  /** Clicar no mapa é a entrada de cidade pelo desenho: o mesmo clique acrescenta e devolve. */
  test('clicar num município com zona em edição acrescenta e remove', () => {
    const city = { city: 'Mogi Mirim', state: 'SP' } as const
    const added = toggleRegionMapCity({ cities: [], city })

    expect(added).toEqual([city])
    expect(toggleRegionMapCity({ cities: added, city })).toEqual([])
  })

  test('a grafia gravada manda: clicar de novo remove mesmo com a dobra diferente', () => {
    const stored = [{ city: 'Mogi Mirim', state: 'SP' }] as const
    const removed = toggleRegionMapCity({
      cities: stored,
      city: { city: 'MOGI-MIRIM', state: 'sp' },
    })

    expect(removed).toEqual([])
  })

  test('a cor da zona vem dos tokens do tema, nunca de literal', async () => {
    const globalStyles = await readApplicationFile('src/styles/index.css')

    // Cinco: a matriz é a zona 0 e a família publica quatro (`00[0-3]` vira 1 a 4). Paleta curta
    // pintaria a zona de cima como município sem rota.
    expect(FREIGHT_REGION_ZONE_FILL).toHaveLength(5)
    for (const fill of FREIGHT_REGION_ZONE_FILL) {
      expect(fill.startsWith('var(--color-zone-')).toBe(true)
      expect(globalStyles).toContain(`${fill.slice(4, -1)}:`)
    }
    expect(resolveZoneFill(0)).toBe(FREIGHT_REGION_ZONE_FILL[0])
    expect(resolveZoneFill(3)).toBe(FREIGHT_REGION_ZONE_FILL[3])
    expect(resolveZoneFill(4)).toBe(FREIGHT_REGION_ZONE_FILL[4])
    expect(resolveZoneFill(null)).toContain('var(--color-')
    expect(resolveZoneFill(null)).not.toBe(FREIGHT_REGION_ZONE_FILL[0])
  })
})

describe('freight region geojson contract', () => {
  /** Ilha e enclave viram subpolígono do mesmo `MultiPolygon` — o mesmo município, nunca dois. */
  test('cada município vira uma feição GeoJSON, com a zona como propriedade numérica', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM, MOGI_GUACU],
      regions: [region({ cities: [{ city: 'Mogi Mirim', state: 'SP' }] })],
      state: 'SP',
    })

    const collection = toFreightRegionFeatureCollection(model.shapes)

    expect(collection.type).toBe('FeatureCollection')
    expect(collection.features).toHaveLength(2)
    const drawn = collection.features.find((feature) => feature.properties.code === MOGI_MIRIM.code)
    expect(drawn?.geometry.type).toBe('MultiPolygon')
    expect(drawn?.properties.zone).toBe(1)
    expect(drawn?.id).toBe(MOGI_MIRIM.code)
    /** Sem zona não é `null` na feição: expressão de estilo do MapLibre não lê `null`. */
    const uncovered = collection.features.find(
      (feature) => feature.properties.code === MOGI_GUACU.code,
    )
    expect(uncovered?.properties.zone).toBe(-1)
  })

  test('município sem anel não vira feição sem geometria', () => {
    const collection = toFreightRegionFeatureCollection([
      { city: 'Sem malha', claims: [], code: '0000000', rings: [], zone: null },
    ])

    expect(collection.features).toEqual([])
  })

  test('o quadro enquadra a extensão real das coordenadas, não um viewBox fixo', () => {
    const model = buildFreightRegionMap({
      features: readStateMeshFeatures(meshPayload()),
      municipalities: [MOGI_MIRIM, MOGI_GUACU],
      regions: [],
      state: 'SP',
    })

    const bounds = resolveFreightRegionBounds(model.shapes)

    expect(bounds).not.toBeNull()
    const [minLng, minLat, maxLng, maxLat] = bounds ?? [0, 0, 0, 0]
    expect(minLng).toBeLessThan(maxLng)
    expect(minLat).toBeLessThan(maxLat)
  })

  test('sem forma nenhuma o quadro é nulo, não um retângulo inventado', () => {
    expect(resolveFreightRegionBounds([])).toBeNull()
  })
})

const MAP_KEYS = [
  'empty',
  'failed',
  'hint',
  'legendTitle',
  'outsideHint',
  'outsideTitle',
  'state',
  'title',
  'unassigned',
  'withoutBasemap',
  'zone',
] as const

describe('freight region default state contract', () => {
  /** A aba abria em branco e o operador escolhia o mesmo estado toda vez: a UF sai da própria carga. */
  test('o mapa abre na UF com mais cidade ativa', () => {
    const state = resolveDefaultMapState([
      region({ cities: [{ city: 'Uberaba', state: 'MG' }], code: '9.000', id: 'region-mg' }),
      region({
        cities: [
          { city: 'Barretos', state: 'SP' },
          { city: 'Pontal', state: 'SP' },
        ],
        code: '1.000',
        id: 'region-sp',
      }),
    ])

    expect(state).toBe('SP')
  })

  /**
   * Rota inativa não pinta (`buildFreightRegionMap`), então também não escolhe a UF: abrir onde nada
   * é desenhado é o mesmo mapa vazio de antes, com outro nome.
   */
  test('rota inativa não decide a UF de abertura', () => {
    const state = resolveDefaultMapState([
      region({
        cities: [
          { city: 'Uberaba', state: 'MG' },
          { city: 'Uberlândia', state: 'MG' },
        ],
        code: '9.000',
        id: 'region-mg',
        status: 'inactive',
      }),
      region({ cities: [{ city: 'Barretos', state: 'SP' }], code: '1.000', id: 'region-sp' }),
    ])

    expect(state).toBe('SP')
  })

  /** Empate sem desempate abriria em telas diferentes para a mesma carga. */
  test('o empate desempata pela sigla', () => {
    const state = resolveDefaultMapState([
      region({ cities: [{ city: 'Uberaba', state: 'MG' }], code: '9.000', id: 'region-mg' }),
      region({ cities: [{ city: 'Barretos', state: 'SP' }], code: '1.000', id: 'region-sp' }),
    ])

    expect(state).toBe('MG')
  })

  test('a sigla gravada com espaço ou caixa baixa conta para a mesma UF', () => {
    const state = resolveDefaultMapState([
      region({
        cities: [
          { city: 'Barretos', state: ' sp ' },
          { city: 'Pontal', state: 'SP' },
        ],
        code: '1.000',
        id: 'region-sp',
      }),
    ])

    expect(state).toBe('SP')
  })

  /** Sem carga não há o que abrir: a tela segue pedindo a UF em vez de chutar uma. */
  test('sem rota ativa com cidade a UF fica vazia', () => {
    expect(resolveDefaultMapState([])).toBe('')
    expect(resolveDefaultMapState([region({ cities: [] })])).toBe('')
  })

  /** A escolha do operador vence a derivação, senão trocar de UF no select não faria nada. */
  test('a UF escolhida vence a derivada, e a derivação mora no serviço', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useFreightRegionMap.hook.ts')

    expect(hook).toContain('resolveDefaultMapState')
    expect(hook).not.toContain("useState(() => cities?.[0]?.state ?? '')")
  })
})

describe('freight region map component contract', () => {
  /**
   * Spec 153 D11 — um mapa só: a aba Regiões passa a desenhar no MapLibre, o mesmo motor do mapa da
   * viagem, e não mais o primitivo SVG `VectorMap` (que continua existindo para quem mais o usa —
   * só esta tela para de depender dele).
   */
  test('o mapa não depende mais de VectorMap nem desenha iframe, imagem remota ou html cru', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionMap.component.tsx',
    )

    expect(component).not.toContain('iframe')
    expect(component).not.toContain('<img')
    expect(component).not.toContain('dangerouslySetInnerHTML')
    expect(component).not.toContain("from '@/components/ui/vector-map'")
    expect(component).toContain('FreightRegionVectorMap')
  })

  /**
   * ⚠️ O mapa entra por `lazy`, mesmo motivo do mapa da viagem: MapLibre no pacote principal estoura
   * o teto de 2 MiB do precache do PWA. Sem isto o build passa, mas o chunk some — só o `bun run
   * build` mede o tamanho de verdade (ver `evidence.md`).
   */
  test('o mapa vetorial entra por import dinâmico, não estático', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionMap.component.tsx',
    )

    expect(component).toContain('lazy(async () => (')
    expect(component).toContain("await import('./FreightRegionVectorMap.component')")
    expect(component).not.toContain(
      "import { FreightRegionVectorMap } from './FreightRegionVectorMap.component'",
    )
  })

  test('a lógica mora no hook e o componente só renderiza', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionMap.component.tsx',
    )
    const hook = await readApplicationFile('src/modules/fleet/hooks/useFreightRegionMap.hook.ts')

    expect(component).toContain('useFreightRegionMap')
    expect(component).not.toContain('useQuery')
    expect(component).not.toContain('loadStateMesh')
    expect(hook).toContain('loadStateMeshFeatures')
    expect(hook).toContain('IBGE_MESH_QUERY_KEY')
    expect(hook).toContain('buildFreightRegionMap')
  })

  /** Carregando é esqueleto com a forma do mapa; falha é aviso lido, não caixa vazia. */
  test('o mapa tem esqueleto de carregamento e falha visível', async () => {
    const component = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionMap.component.tsx',
    )

    expect(component).toContain("from '@/components/ui/skeleton'")
    expect(component).toContain('regionMap.failed')
    expect(component).toContain('regionMap.outsideTitle')
    /** ADR-0044 §6: sem o arquivo de mapa a tela cai para a legenda/lista e diz isso — nunca some. */
    expect(component).toContain('onBasemapMissing')
    expect(component).toContain('regionMap.withoutBasemap')
  })

  /**
   * O engine do desenho: fonte GeoJSON própria (nunca telha de terceiro para a geometria da zona),
   * clique delegado à camada de preenchimento (não a cada `<path>`, como o SVG fazia), e nada de
   * `iframe`/imagem remota — mesma exigência de CSP do `VectorMap` que ele substitui.
   */
  test('o mapa vetorial desenha por fonte GeoJSON e delega o clique à camada de zona', async () => {
    const engine = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionVectorMap.component.tsx',
    )

    expect(engine).toContain("from 'maplibre-gl'")
    expect(engine).toContain("type: 'geojson'")
    expect(engine).toContain('toFreightRegionFeatureCollection')
    expect(engine).toContain("map.on('click', ZONE_FILL_LAYER")
    expect(engine).not.toContain('iframe')
    expect(engine).not.toContain('<img')
    expect(engine).not.toContain('dangerouslySetInnerHTML')
  })

  /** A malha é `fetch` do navegador do operador: destino fora do `connect-src` é pedido bloqueado. */
  test('o destino da malha está no connect-src publicado', () => {
    expect(EXTERNAL_CONNECT_ORIGIN).toContain('https://servicodados.ibge.gov.br')
  })

  test('os verbetes existem nos dois idiomas', async () => {
    type MapLocale = { regionMap: Record<string, unknown> }
    const ptBr = (await Bun.file(
      new URL('src/modules/fleet/locales/fleet.locale.json', APPLICATION_ROOT),
    ).json()) as MapLocale
    const english = (await Bun.file(
      new URL('src/modules/fleet/locales/fleet.en.locale.json', APPLICATION_ROOT),
    ).json()) as MapLocale

    for (const key of MAP_KEYS) {
      expect(typeof ptBr.regionMap[key]).toBe('string')
      expect(typeof english.regionMap[key]).toBe('string')
    }
  })
})
