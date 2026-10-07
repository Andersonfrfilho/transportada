/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o que a planilha sintética precisa de XML — letra de coluna, escape e as
 * strings compartilhadas.
 */

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
export const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

export function columnLetter(index: number): string {
  let remaining = index + 1
  let letters = ''
  while (remaining > 0) {
    const offset = (remaining - 1) % 26
    letters = String.fromCharCode(65 + offset) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return letters
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export class SharedStrings {
  private readonly indexes = new Map<string, number>()

  public indexOf(text: string): number {
    const existing = this.indexes.get(text)
    if (existing !== undefined) return existing
    this.indexes.set(text, this.indexes.size)
    return this.indexes.size - 1
  }

  public toXml(): string {
    const items = [...this.indexes.keys()].map((text) => `<si><t>${escapeXml(text)}</t></si>`)
    return `${XML_DECLARATION}<sst xmlns="${MAIN_NS}" count="${items.length}" uniqueCount="${items.length}">${items.join('')}</sst>`
  }
}
