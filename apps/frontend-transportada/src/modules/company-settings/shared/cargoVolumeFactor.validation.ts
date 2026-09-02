/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 075/077: o fator de cubagem por espécie da NF-e.
 *
 * ⚠️ A **ausência da linha** é a estimativa desligada — não existe fator zero. O CHECK do banco o
 * recusa, e a tela desliga por `DELETE`, nunca gravando zero: zero diria que a carga não ocupa
 * espaço nenhum e somaria como se fosse medida.
 */
export type CargoVolumeFactor = Readonly<{
  /** Vazio é a linha padrão — e hoje é a única, porque nenhum emitente preenche `esp`. */
  species: string
  volumePerUnitM3: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isCargoVolumeFactor(value: unknown): value is CargoVolumeFactor {
  if (!isRecord(value)) return false
  return typeof value.species === 'string' && typeof value.volumePerUnitM3 === 'string'
}

export function isCargoVolumeFactorsResponse(
  value: unknown,
): value is Readonly<{ data: readonly CargoVolumeFactor[] }> {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isCargoVolumeFactor)
}
