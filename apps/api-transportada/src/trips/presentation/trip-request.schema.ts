/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

/**
 * spec.md linha 66 exige "mínimo 1" condutor na criação — T006 não impôs a regra no domínio/
 * aplicação (aceitava `driverIds: []`). Fechado aqui, na fronteira HTTP, espelhando o mesmo teto
 * de `MAX_DRIVERS_PER_MANIFEST` em `mdfe-manifest-request.schema.ts` e `MAX_DRIVERS_PER_TRIP` do
 * schema de banco (`database/trip.schema.ts`).
 */
const MAX_TRIP_DRIVERS = 10

export const createTripSchema = z
  .object({
    driverIds: z.array(z.uuid()).min(1).max(MAX_TRIP_DRIVERS),
    vehicleId: z.uuid(),
  })
  .strict()

export type CreateTripBody = z.infer<typeof createTripSchema>

export const linkTripDocumentSchema = z
  .object({
    freightCalculationId: z.uuid().nullable().default(null),
    nfeDocumentId: z.uuid().nullable().default(null),
  })
  .strict()

export type LinkTripDocumentBody = z.infer<typeof linkTripDocumentSchema>
