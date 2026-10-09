/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMunicipalityNames } from '../queries/useBusinessCalendar.query'
import {
  cityStateCodesOf,
  labelHolidayPlace,
  type HolidayPlace,
} from '../shared/holidayImportFormat.service'

/** Quem tem lugar para mostrar pede o nome: uma consulta por UF presente, e o código no lugar do nome que não veio. */
export function useHolidayPlaceLabels(
  places: readonly HolidayPlace[],
): (place: HolidayPlace) => string {
  const cityNames = useMunicipalityNames(cityStateCodesOf(places))
  return (place) => labelHolidayPlace({ cityNames, place })
}
