/* Copyright (c) 2026 Ada Technology. MIT License. */

const MIN_SLICE_LENGTH = 40

/**
 * O corpo da função, do `function nome(` até o `\n  }\n` que a fecha no nível do hook. Falha alto se
 * não achar o começo ou o fim: uma fatia vazia faria toda asserção `not.toInclude` passar sem provar nada.
 */
export function sliceFunction(source: string, name: string): string {
  const start = source.search(new RegExp(`function ${name}\\(`, 'u'))
  if (start === -1) throw new Error(`function ${name}( não encontrada na fonte`)
  const end = source.indexOf('\n  }\n', start)
  if (end === -1) throw new Error(`fim de ${name} não encontrado na fonte`)
  const slice = source.slice(start, end)
  if (slice.length < MIN_SLICE_LENGTH) throw new Error(`fatia de ${name} curta demais`)

  return slice
}
