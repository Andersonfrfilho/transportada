/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type MunicipalityCentroid = Readonly<{
  cityCode: string
  latitude: string
  longitude: string
  state: string
}>

export type MunicipalityCentroidRepository = Readonly<{
  /** `null` quando o município não está na base — a bancada local não semeou, ou o código não existe. */
  findByCityCode: (cityCode: string) => Promise<MunicipalityCentroid | null>
  /** Idempotente por `city_code`: reexecutar o seed não duplica linha nem multiplica município. */
  saveMany: (centroids: readonly MunicipalityCentroid[]) => Promise<number>
}>
