/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T7: a fronteira das cinco rotas internas da tratativa. `note` é opcional na maioria e
 * obrigatória em `warehouse-return`/`cancel` — o caso de uso (T5) barra a ausência antes do banco,
 * este schema só barra corpo mal-formado (chave desconhecida, tipo errado).
 *
 * Achado 1 da revisão: `INTERNAL_DECISION_BODY_SCHEMA` é a fronteira de
 * `POST /trip-occurrences/:id/case/decision` — `note` é obrigatória aqui (diferente do portal, que
 * só exige em `other`), porque decidir em nome de quem não respondeu sempre precisa de motivo por
 * escrito. `kind` reusa a mesma lista fechada do contratante — é a mesma decisão, ator diferente.
 */
import { z } from 'zod'

import { TRIP_OCCURRENCE_CASE_DECISION_KINDS } from '../../database/trip.schema.js'

const EMPTY_BODY_SCHEMA = z.object({}).strict()
const OPTIONAL_NOTE_BODY_SCHEMA = z.object({ note: z.string().optional() }).strict()
const REQUIRED_NOTE_BODY_SCHEMA = z.object({ note: z.string() }).strict()
const INTERNAL_DECISION_BODY_SCHEMA = z
  .object({ kind: z.enum(TRIP_OCCURRENCE_CASE_DECISION_KINDS), note: z.string() })
  .strict()

export {
  EMPTY_BODY_SCHEMA,
  INTERNAL_DECISION_BODY_SCHEMA,
  OPTIONAL_NOTE_BODY_SCHEMA,
  REQUIRED_NOTE_BODY_SCHEMA,
}
