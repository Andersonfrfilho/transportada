/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { PERSON_NAME_CONNECTIVES, toDisplayPersonName } from '@/modules/shared/personName.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Mesma tabela de `api-transportada/test/fleet-domain/person-name.contract.ts`: aqui a regra é
 * reescrita porque o bundle não carrega código da API, e é este contrato que impede as duas de
 * divergirem. Mudou um caso de um lado? mude do outro.
 */
const DISPLAY_CASES: readonly (readonly [string, string])[] = [
  ['', ''],
  ['josé', 'José'],
  ['JOSÉ DA SILVA', 'José da Silva'],
  ['maria dos santos e souza', 'Maria dos Santos e Souza'],
  ['ANA PAULA', 'Ana Paula'],
  // Ligação no começo do campo de sobrenome continua minúscula: `Da Silva` não é grafia de nome
  ['da silva', 'da Silva'],
  ["d'ávila", "D'Ávila"],
  ['silva-souza', 'Silva-Souza'],
  // O espaço sobrevive porque a função corre a cada tecla, no meio da digitação
  ['ana ', 'Ana '],
  ['ana  paula', 'Ana  Paula'],
]

describe('person name contract', () => {
  test('spells the name the same way the API does', () => {
    for (const [input, expected] of DISPLAY_CASES) {
      expect(toDisplayPersonName(input)).toBe(expected)
    }
  })

  /** Grafia é idempotente: a cada tecla ela recai sobre o que já foi grafado. */
  test('leaves an already spelled name untouched', () => {
    for (const [, expected] of DISPLAY_CASES) {
      expect(toDisplayPersonName(expected)).toBe(expected)
    }
  })

  test('keeps the same connectives the API keeps', () => {
    expect([...PERSON_NAME_CONNECTIVES]).toEqual(['da', 'das', 'de', 'do', 'dos', 'e'])
    for (const connective of PERSON_NAME_CONNECTIVES) {
      expect(toDisplayPersonName(`joão ${connective} souza`)).toBe(`João ${connective} Souza`)
    }
  })

  /**
   * O nome nasce grafado no campo, não na hora de salvar: sem isso o operador vê `josé` enquanto
   * digita e a maiúscula aparece só depois de gravar, quando a API devolve a grafia.
   */
  test('spells the name and the surname while they are typed', async () => {
    const [form, dialog] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/DriverForm.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'),
    ])

    for (const file of [form, dialog]) {
      expect(file).toContain('toDisplayPersonName')
      expect(file).toContain('name: toDisplayPersonName(name)')
      expect(file).toContain('surname: toDisplayPersonName(surname)')
    }
  })
})
