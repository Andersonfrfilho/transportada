/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  addressComparisons,
  clientDeliveryAddresses,
  geocodedAddressCorrections,
  geocodedAddresses,
  municipalityCentroids,
} from '../../src/database/database.schema.js'
import { columnNames, foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'

const ANCORA = (name: string) => ({
  columns: ['company_id'],
  foreignColumns: ['id'],
  foreignTable: 'companies',
  name,
  onDelete: 'restrict' as const,
  onUpdate: 'cascade' as const,
})

describe('routing tenant safety (spec 084)', () => {
  test('ancora as três tabelas novas numa empresa', () => {
    expect(foreignKeys(geocodedAddressCorrections)).toContainEqual(
      ANCORA('geocoded_address_corrections_company_id_companies_id_fk'),
    )
    expect(foreignKeys(clientDeliveryAddresses)).toContainEqual(
      ANCORA('client_delivery_addresses_company_id_companies_id_fk'),
    )
    expect(foreignKeys(addressComparisons)).toContainEqual(
      ANCORA('address_comparisons_company_id_companies_id_fk'),
    )
  })

  /**
   * ⚠️ **A FK simples aceitaria ator de outra empresa.** As duas tabelas que registram quem agiu
   * amarram `(actor_user_id, company_id)` ao membership — não basta o usuário existir, ele precisa
   * ser membro **daquela** empresa. Achado por revisão de segurança.
   */
  test('o ator precisa ser membro da empresa da linha', () => {
    for (const [tabela, nome] of [
      [geocodedAddressCorrections, 'geocoded_address_corrections_actor_membership_fk'],
      [clientDeliveryAddresses, 'client_delivery_addresses_actor_membership_fk'],
    ] as const) {
      expect(foreignKeys(tabela)).toContainEqual({
        columns: ['actor_user_id', 'company_id'],
        foreignColumns: ['user_id', 'company_id'],
        foreignTable: 'user_company_memberships',
        name: nome,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })

  /**
   * ⚠️ **A unicidade da agenda é por empresa.** Sem `company_id` na chave, a loja de um cliente
   * cadastrada por uma transportadora colidiria com a mesma loja cadastrada por outra — e uma
   * sobrescreveria a coordenada da outra.
   */
  test('a agenda é única por empresa, nunca global', () => {
    expect(uniqueColumnsByName(clientDeliveryAddresses)).toEqual({
      client_delivery_addresses_client_place_unique: [
        'company_id',
        'client_tax_id',
        'city_code',
        'address_number',
        'street_key',
      ],
    })
  })

  /**
   * ⚠️ **As duas exceções declaradas, e elas são deliberadas.** `geocoded_addresses` e
   * `municipality_centroids` **não** têm `company_id`: a coordenada de um endereço não é de ninguém —
   * a mesma rua é a mesma rua para quem quer que entregue nela, e duas empresas não geocodificam
   * duas vezes.
   *
   * Se este teste falhar porque uma delas ganhou `company_id`, a mudança é grande e precisa de ADR:
   * a tabela deixa de ser ativo do produto e passa a ser do tenant. E se **outra** tabela de
   * roteirização aparecer aqui sem tenant, o teste acima é que tem de crescer.
   */
  test('lista por extenso as tabelas sem tenant, e o motivo', () => {
    expect(columnNames(geocodedAddresses)).not.toContain('company_id')
    expect(columnNames(municipalityCentroids)).not.toContain('company_id')
  })
})
