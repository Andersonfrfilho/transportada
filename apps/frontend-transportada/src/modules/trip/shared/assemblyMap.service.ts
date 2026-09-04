/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { MeshFeature } from '@/modules/shared/ibgeMesh.service'

import { buildStopAddressKey } from './stopAddressKey.service'

/**
 * O mapa de quem está **montando** a viagem, e não o do roteiro pronto.
 *
 * ⚠️ Ele é por **cidade**, não por endereço, e isso é medido: as notas trazem o código do município
 * em 345 de 345 casos, e endereço geocodificado em menos de um décimo delas. Um mapa de pinos de rua
 * ficaria vazio para quase toda carga — o de cidades responde hoje a pergunta que o operador faz,
 * que é "esta carga está junta ou espalhada?".
 *
 * O ponto sai do **centroide do polígono** da malha do IBGE. Ele não é o endereço de entrega e não
 * pretende ser: é onde a cidade fica.
 */
/**
 * A precisão com que sabemos onde a nota para. `postal_code` e `rooftop` são endereço; `city` é
 * centroide de município — palpite de quilômetros que a ADR-0044 §5 manda **marcar**, nunca deixar
 * passar por endereço.
 */
export type NoteLocationPrecision = 'city' | 'postal_code' | 'rooftop'

export type AssemblyMapNote = Readonly<{
  address: null | string
  /** O número e o CEP entram na chave da parada, exatamente como o vínculo os usa. */
  addressNumber: null | string
  latitude: null | string
  longitude: null | string
  locationPrecision: null | string
  city: null | string
  cityCode: null | string
  id: string
  /** O número da nota, para a lista dizer **qual** carga para naquele endereço. */
  number: null | string
  postalCode: null | string
  recipient: null | string
  state: null | string
}>

export type AssemblyMapPoint = Readonly<{
  /** A chave da parada — `(município, CEP, número)`, a mesma que o vínculo cria. */
  stopKey: string
  cityCode: string
  label: string
  /**
   * O centroide em grau. É o que a camada de telhas projeta — a telha tem projeção própria
   * (Web Mercator), e reaproveitar o `x`/`y` da caixa poria o pino fora do lugar no mapa real.
   */
  latitude: number
  longitude: number
  /** Todas as notas que param aqui, na ordem em que entraram na fila. */
  notes: readonly AssemblyMapNote[]
  /**
   * ⚠️ `true` quando o ponto é o centroide do município, e não o endereço. É o que a tela imprime
   * ao lado da parada: sem isso o palpite de quilômetros aparece com a mesma cara do endereço
   * exato, que é o modo de falha da ADR-0044 §1.
   */
  isApproximate: boolean
  /** A ordem que o operador montou. `null` na cidade que ficou de fora da seleção. */
  sequence: number | null
  x: number
  y: number
}>

export type AssemblyMap = Readonly<{
  /**
   * A mesma projeção que colocou os pinos, exposta para o contorno do município cair na **mesma**
   * caixa. Sem isto o fundo seria enquadrado por conta própria e não coincidiria com os pontos.
   */
  project: (point: Readonly<{ latitude: number; longitude: number }>) => Readonly<{
    x: number
    y: number
  }>
  /** Cidades da seleção, na ordem — é a linha que liga uma à outra. */
  points: readonly AssemblyMapPoint[]
  /** Cidades que o filtro alcança e a seleção deixou de fora, para o operador ver o que faltou. */
  nearby: readonly AssemblyMapPoint[]
  /** Cidade sem polígono na malha, **nomeada**: mapa visto pela metade é pior que mapa com aviso. */
  unmapped: readonly string[]
}>

export const ASSEMBLY_MAP_VIEWBOX = 100
const PADDING = 10

type Centroid = Readonly<{ latitude: number; longitude: number }>

/**
 * O centroide é a média dos vértices do maior anel. Não é o centro de massa exato, e não precisa
 * ser: a diferença entre os dois é menor que o próprio pino na escala de um mapa de cidades.
 */
function centroidOf(feature: MeshFeature): Centroid | null {
  const ring = [...feature.rings].sort((left, right) => right.length - left.length)[0]
  if (ring === undefined || ring.length === 0) return null

  let longitude = 0
  let latitude = 0
  for (const [pointLongitude, pointLatitude] of ring) {
    longitude += pointLongitude
    latitude += pointLatitude
  }
  return { latitude: latitude / ring.length, longitude: longitude / ring.length }
}

function labelOf(note: AssemblyMapNote): string {
  const city = note.city ?? ''
  const state = note.state ?? ''
  return state === '' ? city : `${city}/${state}`
}

/**
 * ⚠️ A janela enquadra **as duas** listas — a escolhida e a que ficou de fora. Enquadrar só a
 * escolhida jogaria a cidade vizinha para fora do desenho, que é exatamente a que o operador
 * precisa ver para perceber que ela faltou.
 */
export function buildAssemblyMap(input: {
  readonly features: readonly MeshFeature[]
  readonly nearby: readonly AssemblyMapNote[]
  readonly selected: readonly AssemblyMapNote[]
}): AssemblyMap {
  const centroidByCode = new Map<string, Centroid>()
  for (const feature of input.features) {
    const centroid = centroidOf(feature)
    if (centroid !== null) centroidByCode.set(feature.code, centroid)
  }

  const selectedStops = groupByStop(input.selected, centroidByCode)
  const chosen = new Set(selectedStops.map((stop) => stop.stopKey))
  const nearbyStops = groupByStop(input.nearby, centroidByCode).filter(
    (stop) => !chosen.has(stop.stopKey),
  )

  const placed = [...selectedStops, ...nearbyStops].flatMap((stop) =>
    stop.centroid === null ? [] : [stop.centroid],
  )
  if (placed.length === 0) {
    return {
      nearby: [],
      points: [],
      project: () => ({ x: 0, y: 0 }),
      unmapped: selectedStops.filter((stop) => stop.centroid === null).map((stop) => stop.label),
    }
  }

  const project = buildProjection(placed)
  const toPoint = (stop: StopGroup, sequence: number | null): readonly AssemblyMapPoint[] => {
    if (stop.centroid === null) return []
    return [
      {
        cityCode: stop.cityCode,
        isApproximate: stop.isApproximate,
        label: stop.label,
        latitude: stop.centroid.latitude,
        longitude: stop.centroid.longitude,
        notes: stop.notes,
        sequence,
        stopKey: stop.stopKey,
        ...project(stop.centroid),
      },
    ]
  }

  return {
    nearby: nearbyStops.flatMap((stop) => toPoint(stop, null)),
    points: selectedStops.flatMap((stop, index) => toPoint(stop, index + 1)),
    project,
    unmapped: selectedStops.filter((stop) => stop.centroid === null).map((stop) => stop.label),
  }
}

type StopGroup = Readonly<{
  centroid: Centroid | null
  cityCode: string
  isApproximate: boolean
  label: string
  notes: readonly AssemblyMapNote[]
  stopKey: string
}>

/**
 * ⚠️ A parada é o **endereço**, não a cidade: `(município, CEP, número)`, a mesma chave que o
 * vínculo usa para criar `trip_stops`. Agrupar por cidade fundia dois clientes do mesmo município
 * numa parada só — e o roteiro desenhado deixava de ser o roteiro que a viagem teria.
 *
 * Nota sem CEP utilizável cai para a cidade: ela ainda precisa aparecer em algum lugar, e o mapa a
 * marca como aproximada em vez de escondê-la.
 */
function groupByStop(
  notes: readonly AssemblyMapNote[],
  centroidByCode: ReadonlyMap<string, Centroid>,
): readonly StopGroup[] {
  const groups = new Map<string, AssemblyMapNote[]>()
  for (const note of notes) {
    const key =
      buildStopAddressKey({
        cityCode: note.cityCode,
        number: note.addressNumber,
        postalCode: note.postalCode,
      }) ?? `cidade:${note.cityCode ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), note])
  }

  return [...groups.entries()].flatMap(([stopKey, grouped]) => {
    const first = grouped[0]
    if (first === undefined) return []
    const located = grouped.find((note) => toCoordinate(note) !== null)
    const coordinate = located === undefined ? null : toCoordinate(located)
    const cityCode = first.cityCode ?? ''
    return [
      {
        centroid: coordinate ?? centroidByCode.get(cityCode) ?? null,
        cityCode,
        /** Sem coordenada de endereço o ponto é o centroide do município — palpite de quilômetros. */
        isApproximate: coordinate === null,
        label: labelOf(first),
        notes: grouped,
        stopKey,
      },
    ]
  })
}

/**
 * ⚠️ A coordenada só vale como endereço quando a precisão diz que ela é de endereço. `city` é o
 * centroide que a própria cascata devolveu; aceitá-la aqui apagaria a marca de aproximação e
 * poria um palpite de quilômetros com a mesma cara do portão certo (ADR-0044 §5).
 */
function toCoordinate(note: AssemblyMapNote): Centroid | null {
  if (note.locationPrecision !== 'postal_code' && note.locationPrecision !== 'rooftop') return null
  const latitude = Number(note.latitude)
  const longitude = Number(note.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

/**
 * A latitude é corrigida pelo cosseno: sem isso o desenho estica no sentido leste-oeste, e a mesma
 * distância parece maior na horizontal — o operador leria a carga como mais espalhada do que é.
 */
function buildProjection(
  points: readonly Centroid[],
): (point: Centroid) => Readonly<{ x: number; y: number }> {
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const minimumLatitude = Math.min(...latitudes)
  const maximumLatitude = Math.max(...latitudes)
  const minimumLongitude = Math.min(...longitudes)
  const maximumLongitude = Math.max(...longitudes)
  const centerLatitude = (minimumLatitude + maximumLatitude) / 2
  const cosine = Math.max(Math.cos((centerLatitude * Math.PI) / 180), 0.1)

  const width = Math.max((maximumLongitude - minimumLongitude) * cosine, 0.0001)
  const height = Math.max(maximumLatitude - minimumLatitude, 0.0001)
  const usable = ASSEMBLY_MAP_VIEWBOX - PADDING * 2
  const scale = Math.min(usable / width, usable / height)

  return (point) => ({
    x:
      ASSEMBLY_MAP_VIEWBOX / 2 +
      (point.longitude - (minimumLongitude + maximumLongitude) / 2) * cosine * scale,
    /** O eixo do SVG cresce para baixo e a latitude para cima: sem a inversão o mapa sai de cabeça. */
    y: ASSEMBLY_MAP_VIEWBOX / 2 - (point.latitude - centerLatitude) * scale,
  })
}
