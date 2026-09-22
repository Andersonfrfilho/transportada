/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T7: a fronteira das cinco rotas internas da tratativa. `note` é opcional na maioria e
 * obrigatória em `warehouse-return`/`cancel` — o caso de uso (T5) barra a ausência antes do banco,
 * este schema só barra corpo mal-formado (chave desconhecida, tipo errado).
 */
import { z } from 'zod'

const EMPTY_BODY_SCHEMA = z.object({}).strict()
const OPTIONAL_NOTE_BODY_SCHEMA = z.object({ note: z.string().optional() }).strict()
const REQUIRED_NOTE_BODY_SCHEMA = z.object({ note: z.string() }).strict()

export { EMPTY_BODY_SCHEMA, OPTIONAL_NOTE_BODY_SCHEMA, REQUIRED_NOTE_BODY_SCHEMA }
