/* Copyright (c) 2026 Ada Technology. MIT License. */
type ClassDictionary = Readonly<Record<string, boolean | null | string | undefined>>
type ClassArray = readonly ClassValue[]
type ClassPrimitive = number | string
export type ClassValue = ClassArray | ClassDictionary | ClassPrimitive | false | null | undefined

export function cn(...inputs: readonly ClassValue[]): string {
  return inputs.flatMap(flattenClassValue).join(' ')
}

function flattenClassValue(input: ClassValue): readonly string[] {
  if (typeof input === 'string' || typeof input === 'number') {
    return input === '' ? [] : [String(input)]
  }
  if (Array.isArray(input)) {
    return input.flatMap(flattenClassValue)
  }
  if (input && typeof input === 'object') {
    return Object.entries(input)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name)
  }
  return []
}
