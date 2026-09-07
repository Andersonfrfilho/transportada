/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sumVolumes, type CargoLayoutStop } from './cargo-layout.policy.js'
import type { CargoPlanBox } from './cargo-plan.policy.js'

export type CargoPreviewDocument = {
  /** A chave da parada — `buildStopAddressKey`. `null` quando o endereço não normaliza. */
  readonly addressKey: string | null
  readonly label: string
  readonly nfeDocumentId: string
  readonly volumeM3: string | null
  /** Spec 085 G006: o peso da nota, para o alerta de concentração somar por parada. */
  readonly weightKilograms: string | null
}

/**
 * A ordem final das paradas: a que o operador escolheu manda, e quem não está nela vai para o fim,
 * na ordem em que a chave apareceu. É a mesma regra que numera o mapa da montagem — extraída para
 * que a distância da prévia (spec 090 D3) numere as paradas exatamente como `buildCargoPreviewStops`
 * já numera, em vez de um segundo critério que poderia discordar dele.
 */
export function orderStopKeys(input: {
  readonly keys: readonly string[]
  readonly order: readonly string[]
}): readonly string[] {
  const rank = new Map(input.order.map((key, index) => [key, index]))
  return [...input.keys].sort(
    (first, second) =>
      (rank.get(first) ?? Number.MAX_SAFE_INTEGER) - (rank.get(second) ?? Number.MAX_SAFE_INTEGER),
  )
}

/**
 * A chave de parada de cada nota, agrupada e ordenada — sem o resto do desenho de carga. É o que a
 * distância da prévia (spec 090 D3) precisa: só a lista de paradas, na ordem que o mapa numerou,
 * pela mesma regra de agrupamento que `buildCargoPreviewStops` usa (nota sem chave vira parada
 * própria por `documento:${nfeDocumentId}`).
 */
export function resolvePreviewStopKeys(input: {
  readonly addressKeyByDocument: ReadonlyMap<string, string | null>
  readonly nfeDocumentIds: readonly string[]
  readonly order: readonly string[]
}): readonly string[] {
  const keys = new Set<string>()
  for (const nfeDocumentId of input.nfeDocumentIds) {
    const key = input.addressKeyByDocument.get(nfeDocumentId) ?? null
    keys.add(key ?? `documento:${nfeDocumentId}`)
  }
  return orderStopKeys({ keys: [...keys], order: input.order })
}

/**
 * As paradas da carga **antes de a viagem existir**.
 *
 * ⚠️ A unidade é o **endereço**, nunca a nota nem o CNPJ: a mesma rede em cinco lojas é cinco
 * paradas, e duas notas do mesmo portão são uma só. É a mesma chave que `reconcileStopOnLink` usa
 * ao vincular — se as duas divergirem, a prévia desenha um baú e o aceite cria outro.
 *
 * ⚠️ A ordem vem de fora, do mapa que o operador montou. A prévia **não inventa roteiro**: sem
 * ordem escolhida vale a ordem de chegada da nota, que é o que ele acabou de fazer com as mãos.
 */
export function buildCargoPreviewStops(input: {
  /** Spec 088 G003: as caixas por nota, que aqui viram as caixas **da parada**. */
  readonly boxesByDocument?: ReadonlyMap<string, readonly CargoPlanBox[]>
  readonly documents: readonly CargoPreviewDocument[]
  readonly order: readonly string[]
}): readonly CargoLayoutStop[] {
  const grouped = new Map<
    string,
    { boxes: CargoPlanBox[]; readonly label: string; missing: number; volumes: string[] }
  >()

  for (const document of input.documents) {
    /**
     * Endereço que não normaliza não tem chave, e agrupar todos eles juntos fundiria paradas que
     * não têm nada a ver. Cada um vira parada própria — o mesmo destino do balde "Sem parada".
     */
    const key = document.addressKey ?? `documento:${document.nfeDocumentId}`
    const current = grouped.get(key) ?? {
      boxes: [],
      label: document.label,
      missing: 0,
      volumes: [],
    }
    if (document.volumeM3 === null) current.missing += 1
    else current.volumes.push(document.volumeM3)
    current.boxes.push(...(input.boxesByDocument?.get(document.nfeDocumentId) ?? []))
    grouped.set(key, current)
  }

  /** Parada que a ordem não menciona não some: ela vai para o fim, e continua desenhada. */
  const orderedKeys = orderStopKeys({ keys: [...grouped.keys()], order: input.order })
  return orderedKeys.flatMap((key, index) => {
    const stop = grouped.get(key)
    if (stop === undefined) return []

    return [
      {
        boxes: stop.boxes,
        documentsWithoutVolume: stop.missing,
        label: stop.label,
        sequence: index + 1,
        /** Zero diria que a parada não ocupa espaço; ausência diz que não se sabe. */
        volumeM3: stop.volumes.length === 0 ? null : sumVolumes(stop.volumes),
      },
    ]
  })
}
