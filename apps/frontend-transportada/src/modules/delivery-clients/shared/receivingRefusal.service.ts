/* Copyright (c) 2026 Ada Technology. MIT License. */

export type RefusedField = Readonly<{ field: string; labelKey: string | undefined }>

export function describeRefusedFields(error: unknown): readonly RefusedField[] {
  void error
  return []
}
