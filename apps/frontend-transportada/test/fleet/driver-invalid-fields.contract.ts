/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import {
  FleetRequestError,
  readErrorDetails,
  toInvalidFields,
} from '../../src/modules/fleet/shared/fleetRequestError.service'
import { toDriverInvalidFieldLabels } from '../../src/modules/fleet/shared/driverInvalidFields.service'

describe('fleet request error details', () => {
  test('reads the field of every issue the api returned', () => {
    const payload = {
      error: {
        code: 'INVALID_REQUEST',
        details: [
          { field: 'birthDate', message: 'invalid' },
          { field: 'address.postalCode', message: 'invalid' },
        ],
      },
    }

    expect(readErrorDetails(payload)).toEqual([
      { field: 'birthDate', message: 'invalid' },
      { field: 'address.postalCode', message: 'invalid' },
    ])
  })

  test('ignores malformed issues instead of failing the error path', () => {
    expect(readErrorDetails({ error: { details: [{ field: 'taxId' }, 7, null] } })).toEqual([])
    expect(readErrorDetails({ error: { code: 'X' } })).toEqual([])
    expect(readErrorDetails('boom')).toEqual([])
  })

  test('keeps the code as the message, because the module picks the text by it', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [{ field: 'taxId', message: 'i' }])

    expect(error.message).toBe('INVALID_REQUEST')
    expect(toInvalidFields(error)).toEqual(['taxId'])
  })

  test('reports no field for an error that is not a fleet request error', () => {
    expect(toInvalidFields(new Error('INVALID_REQUEST'))).toEqual([])
  })

  test('does not repeat a field that failed more than one rule', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'taxId', message: 'too short' },
      { field: 'taxId', message: 'not a cpf' },
    ])

    expect(toInvalidFields(error)).toEqual(['taxId'])
  })
})

describe('driver invalid field labels', () => {
  test('names the field with the label printed on the form', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'birthDate', message: 'invalid' },
      { field: 'licenseNumber', message: 'invalid' },
      { field: 'address.postalCode', message: 'invalid' },
    ])

    expect(toDriverInvalidFieldLabels(error)).toEqual([
      'driverBirthDate',
      'driverLicense',
      'driverAddressPostalCode',
    ])
  })

  test('falls back to the api name so an unmapped field still reaches the operator', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'somethingNew', message: 'invalid' },
    ])

    expect(toDriverInvalidFieldLabels(error)).toEqual(['somethingNew'])
  })
})

describe('driver form reveal after reset', () => {
  const source = readFileSync(
    new URL('../../src/modules/fleet/hooks/useDriverForm.hook.ts', import.meta.url),
    'utf8',
  )

  test('returns the operator to the first field when the form goes blank', () => {
    expect(source).toContain('onReset?.()')
    expect(source.indexOf('setState(createDriverDraft())')).toBeLessThan(
      source.indexOf('onReset?.()'),
    )
  })

  test('wires the reveal of the panel into the form of the fleet tab', () => {
    const form = readFileSync(
      new URL('../../src/modules/fleet/components/DriverForm.component.tsx', import.meta.url),
      'utf8',
    )

    expect(form).toContain('const { panelRef, reveal } = useRevealedPanel<HTMLFormElement>()')
    expect(form).toContain('onReset: reveal,')
  })
})

describe('invalid field hint', () => {
  const source = readFileSync(
    new URL('../../src/modules/fleet/components/InvalidFieldsHint.component.tsx', import.meta.url),
    'utf8',
  )

  test('turns every named field into a shortcut that takes the operator to it', () => {
    expect(source).toContain('focusFieldByLabel({ label: t(label), panel: panelRef.current })')
    expect(source).toContain('type="button"')
  })

  test('jumps instantly, because focusing the field interrupts a smooth scroll in flight', () => {
    expect(
      readFileSync(
        new URL('../../src/modules/shared/focusFieldByLabel.service.ts', import.meta.url),
        'utf8',
      ),
    ).toContain("scrollIntoView({ behavior: 'auto', block: 'center' })")
  })

  test('says nothing when the failure points at no field', () => {
    expect(source).toContain('if (labels.length === 0) return null')
  })

  test('is wired into the two fichas that create a driver', () => {
    for (const path of [
      '../../src/modules/fleet/components/DriverForm.component.tsx',
      '../../src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]) {
      expect(readFileSync(new URL(path, import.meta.url), 'utf8')).toContain(
        'labels={form.invalidFieldLabels}',
      )
    }
  })
})

describe('cobertura do mapa de rótulos', () => {
  const labelKeys: readonly string[] = [
    ...readFileSync(
      new URL('../../src/modules/fleet/shared/driverInvalidFields.service.ts', import.meta.url),
      'utf8',
    ).matchAll(/^ {2}'?[\w.]+'?: '(\w+)',$/gm),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))

  /**
   * `pixKeyType` é campo da ficha e tem rótulo nos dois idiomas, mas ficou fora do mapa: o aviso de
   * recusa saía com o nome interno, que é exatamente o aviso genérico que este caminho conserta.
   */
  test('o par da chave Pix está completo', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'pixKey', message: 'i' },
      { field: 'pixKeyType', message: 'i' },
    ])

    expect(toDriverInvalidFieldLabels(error)).toEqual(['driverPixKey', 'driverPixKeyType'])
  })

  /** Chave de rótulo que não existe no locale imprime a própria chave na tela do operador. */
  test('todo rótulo do mapa existe nos dois idiomas', () => {
    const locales = ['fleet.locale.json', 'fleet.en.locale.json'].map((file) => {
      const parsed: unknown = JSON.parse(
        readFileSync(new URL(`../../src/modules/fleet/locales/${file}`, import.meta.url), 'utf8'),
      )
      return parsed as Record<string, unknown>
    })

    expect(labelKeys.length).toBeGreaterThan(20)
    for (const labelKey of labelKeys) {
      for (const locale of locales) expect(typeof locale[labelKey]).toBe('string')
    }
  })
})

describe('linked company lookup', () => {
  const source = readFileSync(
    new URL('../../src/modules/fleet/hooks/useCompanyLookup.hook.ts', import.meta.url),
    'utf8',
  )

  test('drops the legal name the lookup filled when the tax id is cleared', () => {
    expect(source).toContain("{ linkedLegalName: '', linkedTaxId: taxId }")
  })
})
