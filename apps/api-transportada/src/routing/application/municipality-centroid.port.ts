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
  /** Idempotente por `city_code`: reexecutar o seed não duplica linha nem multiplica município. */
  saveMany: (centroids: readonly MunicipalityCentroid[]) => Promise<number>
}>
