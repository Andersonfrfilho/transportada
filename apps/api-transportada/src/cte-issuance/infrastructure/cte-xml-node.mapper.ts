/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DacteXmlInvalidError } from '../domain/dacte.error.js'

export type XmlNode = Record<string, unknown>

export function asNode(value: unknown): XmlNode | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as XmlNode
}

export function child(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  return node === undefined ? undefined : asNode(node[tag])
}

export function requireChild(node: XmlNode, tag: string): XmlNode {
  const found = child(node, tag)
  if (found === undefined) throw new DacteXmlInvalidError(`missing element ${tag}`)
  return found
}

export function text(node: XmlNode | undefined, tag: string): string | undefined {
  if (node === undefined) return undefined
  const value = node[tag]
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value
}

export function requiredText(node: XmlNode, tag: string): string {
  const value = text(node, tag)
  if (value === undefined) throw new DacteXmlInvalidError(`missing element ${tag}`)
  return value
}

export function firstText(node: XmlNode, tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    const value = text(node, tag)
    if (value !== undefined) return value
  }
  return undefined
}

export function list(node: XmlNode | undefined, tag: string): readonly XmlNode[] {
  const value = node === undefined ? undefined : node[tag]
  if (!Array.isArray(value)) return []
  return value.map(asNode).filter((item): item is XmlNode => item !== undefined)
}

/** `exactOptionalPropertyTypes` proíbe atribuir `undefined`: a chave some do objeto em vez disso. */
export function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined,
): { [Property in TKey]?: TValue } {
  const empty = {} as { [Property in TKey]?: TValue }
  if (value === undefined) return empty
  return { [key]: value } as { [Property in TKey]?: TValue }
}
