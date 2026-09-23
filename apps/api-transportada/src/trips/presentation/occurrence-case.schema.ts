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
 *
 * Revisão de segurança da spec 164: as três notas usavam `z.string()` sem teto — o corpo global da
 * aplicação virava o limite efetivo. Mesmo teto do portal (`contractor-occurrence.routes.ts`).
 */
import { z } from 'zod'

import { TRIP_OCCURRENCE_CASE_DECISION_KINDS } from '../../database/trip.schema.js'

const MAX_NOTE_LENGTH = 2000

const EMPTY_BODY_SCHEMA = z.object({}).strict()
const OPTIONAL_NOTE_BODY_SCHEMA = z
  .object({ note: z.string().max(MAX_NOTE_LENGTH).optional() })
  .strict()
const REQUIRED_NOTE_BODY_SCHEMA = z.object({ note: z.string().max(MAX_NOTE_LENGTH) }).strict()
const INTERNAL_DECISION_BODY_SCHEMA = z
  .object({
    kind: z.enum(TRIP_OCCURRENCE_CASE_DECISION_KINDS),
    note: z.string().max(MAX_NOTE_LENGTH),
  })
  .strict()

export {
  EMPTY_BODY_SCHEMA,
  INTERNAL_DECISION_BODY_SCHEMA,
  OPTIONAL_NOTE_BODY_SCHEMA,
  REQUIRED_NOTE_BODY_SCHEMA,
}
