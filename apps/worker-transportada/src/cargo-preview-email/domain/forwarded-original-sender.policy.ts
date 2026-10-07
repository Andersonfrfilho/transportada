/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type OriginalSenderResult =
  | { readonly address: string; readonly kind: 'found' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'missing' }

export type MimeHeader = { readonly key: string; readonly value: string }

export function readOriginalSenderFromHeaders(
  headers: readonly MimeHeader[],
): OriginalSenderResult {
  void headers
  return { kind: 'missing' }
}

export function readOriginalSenderFromForwardedText(
  text: string | undefined,
): OriginalSenderResult {
  void text
  return { kind: 'missing' }
}
