/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export function extractPreviewTokenCandidates(input: {
  readonly ccAddresses?: readonly string[]
  readonly replyDomain: string
  readonly toAddresses: readonly string[]
}): readonly string[] {
  void input
  return []
}

export function hashPreviewInboundToken(token: string): string {
  return token
}
