/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  catalogFromApi,
  ContractorMailTemplatesResponseError,
  previewFromApi,
  templateFromApi,
  templateListFromApi,
} from '../../src/modules/delivery-clients/shared/contractorMailTemplatesResponse.validation'

const CATALOG_ENTRY = {
  itemVariables: [{ description: 'Motivo', name: 'motivo' }],
  label: 'Correção de endereço de entrega',
  mailType: 'address_correction',
  mailVariables: [{ description: 'Contratante', name: 'contratante' }],
  suggestedTemplate: {
    closing: '{operador}',
    intro: 'Olá, {contratante}',
    itemText: 'Motivo: {motivo}.',
    name: 'Padrão',
    subject: 'Correção de endereço — {clientes}',
  },
} as const

const TEMPLATE = {
  closing: '{operador}',
  id: 'template-1',
  intro: 'Olá, {contratante}',
  isDefault: true,
  itemText: 'Motivo: {motivo}.',
  mailType: 'address_correction',
  name: 'Padrão',
  status: 'active',
  subject: 'Correção de endereço',
  updatedAt: '2026-09-15T00:00:00.000Z',
  version: '1',
} as const

describe('contractor mail templates response validation', () => {
  test('accepts the real shape of GET /contractor-mail-templates/catalog', () => {
    expect(catalogFromApi({ data: [CATALOG_ENTRY] })).toEqual([CATALOG_ENTRY])
  })

  test('rejects a catalog entry with an extra field', () => {
    expect(() => catalogFromApi({ data: [{ ...CATALOG_ENTRY, extra: true }] })).toThrow(
      ContractorMailTemplatesResponseError,
    )
  })

  test('rejects a catalog entry with an unknown mail type', () => {
    expect(() => catalogFromApi({ data: [{ ...CATALOG_ENTRY, mailType: 'unknown' }] })).toThrow(
      ContractorMailTemplatesResponseError,
    )
  })

  test('accepts a single template', () => {
    expect(templateFromApi({ data: TEMPLATE })).toEqual(TEMPLATE)
  })

  test('rejects a template missing a required field', () => {
    const withoutVersion: Record<string, unknown> = { ...TEMPLATE }
    delete withoutVersion.version
    expect(() => templateFromApi({ data: withoutVersion })).toThrow(
      ContractorMailTemplatesResponseError,
    )
  })

  test('rejects an unknown template status', () => {
    expect(() => templateFromApi({ data: { ...TEMPLATE, status: 'deleted' } })).toThrow(
      ContractorMailTemplatesResponseError,
    )
  })

  test('accepts a template list, in any order', () => {
    const archived = {
      ...TEMPLATE,
      id: 'template-2',
      isDefault: false,
      status: 'archived',
    } as const
    expect(templateListFromApi({ data: [archived, TEMPLATE] })).toEqual([archived, TEMPLATE])
  })

  test('accepts the preview result', () => {
    const payload = { data: { html: '<p>x</p>', subject: 'Assunto', text: 'x' } }
    expect(previewFromApi(payload)).toEqual(payload.data)
  })

  test('rejects a preview result with a field besides html/subject/text', () => {
    expect(() =>
      previewFromApi({ data: { html: '<p>x</p>', subject: 'Assunto', text: 'x', extra: 1 } }),
    ).toThrow(ContractorMailTemplatesResponseError)
  })
})
