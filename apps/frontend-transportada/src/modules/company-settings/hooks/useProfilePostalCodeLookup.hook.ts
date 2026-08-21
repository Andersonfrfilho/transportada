/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PostalCodeLookupStatus } from '@/modules/shared/usePostalCodeLookup.hook'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'

type Profile = CompanySettingsUpdate['profile']
type ProfileTextField = Exclude<keyof Profile, 'taxRegime'>

/** Os quatro campos que o CEP sabe preencher têm aqui o nome do cadastro da empresa. */
const POSTAL_CODE_FIELDS = {
  city: 'city',
  district: 'district',
  state: 'state',
  street: 'street',
} as const

/** O status do CEP é o mesmo dos três formulários; o rótulo continua sendo desta tela. */
const POSTAL_CODE_STATUS_KEY: Readonly<Record<PostalCodeLookupStatus, null | string>> = {
  found: 'postalCodeLookupFound',
  idle: null,
  missing: 'postalCodeLookupMissing',
  pending: 'postalCodeLookupPending',
}

type UseProfilePostalCodeLookupInput = Readonly<{
  onChange: (input: Readonly<{ field: ProfileTextField; value: string }>) => void
}>

export type ProfilePostalCodeLookupController = Readonly<{
  changePostalCode: (value: string) => void
  statusKey: null | string
}>

export function useProfilePostalCodeLookup(
  input: UseProfilePostalCodeLookupInput,
): ProfilePostalCodeLookupController {
  const { onChange } = input
  const postalCode = usePostalCodeLookup<Profile>({
    fields: POSTAL_CODE_FIELDS,
    patch: (values) => {
      for (const field of Object.values(POSTAL_CODE_FIELDS)) {
        const value = values[field]
        if (value !== undefined) onChange({ field, value })
      }
    },
  })

  function changePostalCode(value: string): void {
    onChange({ field: 'postalCode', value })
    postalCode.lookup(value)
  }

  return { changePostalCode, statusKey: POSTAL_CODE_STATUS_KEY[postalCode.status] }
}
