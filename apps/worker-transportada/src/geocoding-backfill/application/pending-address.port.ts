/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O endereço de entrega que ainda não tem coordenada. Só as duas partes que a cascata do worker usa
 * — CEP e município —, porque é só o que os degraus 1 e 2 leem.
 */
export type PendingGeocodingAddress = Readonly<{
  addressKey: string
  cityCode: string
  postalCode: string
}>

export type PendingGeocodingAddressSource = Readonly<{
  /**
   * Página **ordenada e distinta** por chave. O `after` existe porque endereço que não resolve não é
   * gravado (ver a rotina): sem cursor, o lote seguinte devolveria os mesmos e o ciclo giraria em
   * falso sobre a mesma página até o teto.
   */
  list: (input: {
    readonly after: string | undefined
    readonly limit: number
  }) => Promise<readonly PendingGeocodingAddress[]>
}>
