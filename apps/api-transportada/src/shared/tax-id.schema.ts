/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { normalizeTaxId } from './tax-id.service.js'

/**
 * A normalização vem **antes** da validação, de propósito: `regex().transform()` recusaria a
 * minúscula que o formulário manda antes de ter chance de subir a caixa, e o banco só aceita a
 * forma canônica maiúscula.
 */
export const buildTaxIdSchema = (pattern: RegExp) =>
  z
    .string()
    .transform(normalizeTaxId)
    .refine((value) => pattern.test(value))

/** Mesma normalização, para o campo que o cadastro deixa em branco. */
export const buildOptionalTaxIdSchema = (pattern: RegExp) =>
  z
    .string()
    .transform(normalizeTaxId)
    .refine((value) => value.length === 0 || pattern.test(value))
