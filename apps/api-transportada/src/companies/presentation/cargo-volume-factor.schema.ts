/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'

/**
 * Seis casas, como a coluna. Zero não passa: desligar a estimativa é **apagar a linha**, e é isso
 * que o CHECK do banco também afirma (spec 075).
 */
const VOLUME_DECIMAL = /^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{6})$/

/** A espécie vem do `<vol>` do emitente; vazia é a linha padrão, e hoje é a única que existe. */
const SPECIES_MAX_LENGTH = 60

const saveCargoVolumeFactorBodySchema = z
  .object({
    species: z.string().trim().max(SPECIES_MAX_LENGTH).default(''),
    volumePerUnitM3: z
      .string()
      .regex(VOLUME_DECIMAL)
      .refine((value) => Number.parseFloat(value) > 0, { message: 'must be positive' }),
  })
  .strict()

export function parseSaveCargoVolumeFactorBody(request: Request): Promise<{
  readonly species: string
  readonly volumePerUnitM3: string
}> {
  return parseBody(saveCargoVolumeFactorBodySchema, request)
}
