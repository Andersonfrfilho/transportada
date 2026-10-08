/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255: verifica que o catálogo de ícones de tipo de ocorrência está
 * completo no motorista.
 */

import { readFileSync } from 'fs'
import { describe, it, expect } from 'bun:test'

describe('Spec 255 — Catálogo de ícones de tipo de ocorrência', () => {
  it('motorista tem todos os ícones do catálogo', () => {
    // Catálogo do spec 255
    const catalogNames = [
      'alert',
      'camera',
      'clipboard-list',
      'clock',
      'document',
      'invoice',
      'message',
      'money',
      'package',
      'truck',
    ]

    // Lê o arquivo de definição de ícones do motorista
    const componentFile = readFileSync('./src/components/ui/icon.tsx', 'utf-8')

    const missing: string[] = []
    for (const name of catalogNames) {
      // Procura por definição: alert: [...] ou 'alert': [...]
      const regex = new RegExp(`^\\s*'?${name.replace(/-/g, '\\-')}'?\\s*:\\s*\\[`, 'm')
      if (!regex.test(componentFile)) {
        missing.push(name)
      }
    }

    expect(missing.length).toEqual(0)
  })
})
