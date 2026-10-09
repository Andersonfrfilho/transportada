/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259: os códigos de aviso da lista de viagens quando ocupação ou resultado de uma linha (ou de
 * toda a página) não pôde ser calculado. Só ids e código vão ao log — nunca valor nem nome.
 */
export const TRIP_LIST_ENRICHMENT_LOG = {
  financialsBlockFailed: 'trip.list.financials_block_failed',
  financialsTripFailed: 'trip.list.financials_trip_failed',
  occupancyBlockFailed: 'trip.list.occupancy_block_failed',
  occupancyTripFailed: 'trip.list.occupancy_trip_failed',
} as const
