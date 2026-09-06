/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sumVolumes, type CargoLayoutStop } from './cargo-layout.policy.js'

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
  readonly documents: readonly CargoPreviewDocument[]
  readonly order: readonly string[]
}): readonly CargoLayoutStop[] {
  const grouped = new Map<string, { readonly label: string; missing: number; volumes: string[] }>()

  for (const document of input.documents) {
    /**
     * Endereço que não normaliza não tem chave, e agrupar todos eles juntos fundiria paradas que
     * não têm nada a ver. Cada um vira parada própria — o mesmo destino do balde "Sem parada".
     */
    const key = document.addressKey ?? `documento:${document.nfeDocumentId}`
    const current = grouped.get(key) ?? { label: document.label, missing: 0, volumes: [] }
    if (document.volumeM3 === null) current.missing += 1
    else current.volumes.push(document.volumeM3)
    grouped.set(key, current)
  }

  /** Parada que a ordem não menciona não some: ela vai para o fim, e continua desenhada. */
  const rank = new Map(input.order.map((key, index) => [key, index]))
  return [...grouped.entries()]
    .sort(
      ([first], [second]) =>
        (rank.get(first) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(second) ?? Number.MAX_SAFE_INTEGER),
    )
    .map(([, stop], index) => ({
      documentsWithoutVolume: stop.missing,
      label: stop.label,
      sequence: index + 1,
      /** Zero diria que a parada não ocupa espaço; ausência diz que não se sabe. */
      volumeM3: stop.volumes.length === 0 ? null : sumVolumes(stop.volumes),
    }))
}
