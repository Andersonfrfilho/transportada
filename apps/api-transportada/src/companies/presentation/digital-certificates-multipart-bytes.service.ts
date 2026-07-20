/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export function findBytes(input: {
  readonly needle: Uint8Array
  readonly offset?: number
  readonly source: Uint8Array
}): number {
  for (
    let index = input.offset ?? 0;
    index <= input.source.byteLength - input.needle.byteLength;
    index += 1
  ) {
    if (matchesAt({ needle: input.needle, offset: index, source: input.source })) return index
  }
  return -1
}

export function matchesAt(input: {
  readonly needle: Uint8Array
  readonly offset: number
  readonly source: Uint8Array
}): boolean {
  return input.needle.every(
    (value, needleIndex) => input.source[input.offset + needleIndex] === value,
  )
}
