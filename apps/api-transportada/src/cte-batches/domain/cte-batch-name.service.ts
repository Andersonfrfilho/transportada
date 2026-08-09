/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'

const NAME_PREFIX = 'CT-e'
const SEQUENCE_SEPARATOR = '#'
const FIRST_SEQUENCE = 1
const PLAIN_SEQUENCE = /^[1-9][0-9]*$/

export function buildBatchNamePrefix(input: Readonly<{ now: Date }>): string {
  return `${NAME_PREFIX} ${formatFiscalDay(input.now)} ${SEQUENCE_SEPARATOR}`
}

export function suggestBatchName(
  input: Readonly<{ names: readonly string[]; prefix: string }>,
): string {
  const sequences = input.names.map((name) => readSequence({ name, prefix: input.prefix }))
  return `${input.prefix}${Math.max(FIRST_SEQUENCE - 1, ...sequences) + 1}`
}

function readSequence(input: Readonly<{ name: string; prefix: string }>): number {
  if (!input.name.startsWith(input.prefix)) return 0
  const suffix = input.name.slice(input.prefix.length)
  return PLAIN_SEQUENCE.test(suffix) ? Number(suffix) : 0
}
