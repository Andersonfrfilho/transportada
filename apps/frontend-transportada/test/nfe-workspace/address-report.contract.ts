/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  ADDRESS_FINDING_KINDS,
  mapAddressReport,
} from '../../src/modules/nfe-workspace/shared/addressReport.validation'

const ROOT = new URL('../..', import.meta.url)

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), 'utf8')
}

const PANEL = read('src/modules/nfe-workspace/components/AddressReportPanel.component.tsx')
const PAGE = read('src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx')

function corpo(kind: string) {
  return {
    data: {
      groups: [
        {
          contractorName: 'ZARAGOZA',
          contractorTaxId: '05868574001090',
          findings: [
            {
              addressKey: '3527256|14210000|533',
              city: 'LUIS ANTONIO',
              distanceMetres: 175.5,
              kind,
              noteDistrict: 'Centro',
              noteNumber: '533',
              notePostalCode: '14210-000',
              noteStreet: 'R AMERICA DE ARAUJO PERES',
              providerPostalCode: '',
              providerStreet: '',
              state: 'SP',
            },
          ],
        },
      ],
      totals: { measured: 148, needingAttention: 24 },
    },
  }
}

describe('relatório de endereços a corrigir (spec 084, G10)', () => {
  /**
   * ⚠️ **Cópia por valor da API, e a ordem faz parte do contrato** — ela é a gravidade. O bundle não
   * carrega código do servidor, e é o mesmo caso de `FUEL_TYPES` e `VEHICLE_TYPES`: mudou de um
   * lado, mude do outro (`api-transportada/src/addresses/domain/address-finding.policy.ts`).
   */
  test('os seis tipos de pedido, na ordem da gravidade', () => {
    expect([...ADDRESS_FINDING_KINDS]).toEqual([
      'coordinate_unresolved',
      'street_unknown',
      'city_mismatch',
      'street_different',
      'postal_code_stale',
      'street_incomplete',
    ])
  })

  test('lê o relatório e preserva os dois lados do endereço', () => {
    const report = mapAddressReport(corpo('street_unknown'))

    expect(report.totals).toEqual({ measured: 148, needingAttention: 24 })
    expect(report.groups[0]?.findings[0]?.noteStreet).toBe('R AMERICA DE ARAUJO PERES')
    expect(report.groups[0]?.findings[0]?.providerStreet).toBe('')
  })

  /**
   * ⚠️ **Tipo desconhecido derruba a linha, não a tela.** A API pode ganhar um tipo antes de esta
   * app subir; uma tela em branco esconderia os vinte e três pedidos que a versão antiga entende,
   * enquanto a linha ausente só esconde o que ela não sabe rotular — e que apareceria como chave
   * crua se passasse.
   */
  test('tipo de pedido que esta versão não conhece some sem levar o resto', () => {
    const report = mapAddressReport(corpo('inventado_amanha'))
    expect(report.groups).toEqual([])
    expect(report.totals.measured).toBe(148)
  })

  test('corpo inesperado vira relatório vazio, nunca exceção', () => {
    expect(mapAddressReport(null).groups).toEqual([])
    expect(mapAddressReport({ data: { groups: 'nope' } }).totals.measured).toBe(0)
  })

  /**
   * ⚠️ **O denominador aparece, sempre.** "24 endereços a corrigir" sozinho parece uma base podre;
   * "24 de 148 medidos" diz que o cadastro está majoritariamente bom. O relatório é feito para ser
   * mandado a um cliente, e a diferença entre um pedido e uma acusação está aí.
   */
  test('a tela imprime quantos foram medidos, não só quantos têm pedido', () => {
    expect(PANEL).toContain('measured: report.totals.measured')
    expect(PANEL).toContain('needingAttention: report.totals.needingAttention')
  })

  /** Rua vazia do provedor é "não conhece este logradouro", nunca um campo em branco na tela. */
  test('logradouro desconhecido é dito por extenso', () => {
    expect(PANEL).toContain('addressReport.unknownStreet')
  })

  /** A consulta só sobe com a aba aberta **e** com a permissão que a rota exige. */
  test('a consulta exige settings.manage e a aba aberta', () => {
    expect(PAGE).toContain("enabled: canManageSettings && activeTab === 'addresses'")
    expect(PANEL).toContain('denied')
  })

  /** Estado de carregamento é esqueleto com a forma do conteúdo, nunca texto solto nem `null`. */
  test('carregando renderiza esqueleto', () => {
    expect(PANEL).toContain('SkeletonGroup')
    expect(PANEL).not.toContain('Carregando')
  })
})
