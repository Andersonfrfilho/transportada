/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

const MODULE_ROOT = new URL('../../src/modules/trip/', import.meta.url).pathname

/**
 * Spec 079 T015 / CA5. ⚠️ **A ADR-0039 já decidiu criptografar** `birth_date`, `license_number`, o
 * endereço e o telefone do motorista — e o que torna essa mudança barata é justamente **não haver
 * leitor**. Quem escrever um passa a ter de abrir envelope.
 *
 * Este contrato existe para que a tela da viagem não vire esse leitor por descuido: ela mostra
 * nome, e é só disso que ela precisa. Varre o módulo inteiro por glob, então arquivo novo entra na
 * varredura sozinho — que é o que impede a regra de envelhecer.
 */
const FORBIDDEN = ['birthDate', 'licenseNumber', 'licenseExpiresAt', 'identityDocument']

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('a tela da viagem não lê dado pessoal do motorista (spec 079 T015)', () => {
  const files = listSourceFiles(MODULE_ROOT)

  it('varre o módulo inteiro, e ele não está vazio', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const field of FORBIDDEN) {
    it(`não referencia ${field}`, () => {
      const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(field))

      expect(offenders).toEqual([])
    })
  }

  /**
   * ⚠️ `phone` fica **fora** da lista, e isso é decisão, não esquecimento: a P2 vai trazer o
   * contato do destinatário para esta tela, e o telefone dele não é o do motorista. Proibir a
   * palavra faria o contrato reprovar a feature errada quando a ADR do contato sair.
   *
   * O que se protege é o telefone **do motorista**, e ele chega junto do resto da ficha — que os
   * campos acima já barram.
   */
  it('o motorista aparece pelo nome, que é o que a tela precisa', () => {
    const detail = readFileSync(join(MODULE_ROOT, 'components/TripDetail.component.tsx'), 'utf8')

    expect(detail).toInclude('driver.driverName')
  })
})
