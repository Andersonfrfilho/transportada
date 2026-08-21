/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PostalCodeLookupStatus } from '@/modules/shared/usePostalCodeLookup.hook'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import type { MdfeManifestFormDraft } from '../shared/mdfeManifestForm.service'

/** O status do CEP é o mesmo dos três formulários; o rótulo continua sendo desta tela. */
const POSTAL_CODE_STATUS_KEY: Readonly<Record<PostalCodeLookupStatus, null | string>> = {
  found: 'creation.postalCodeLookupFound',
  idle: null,
  missing: 'creation.postalCodeLookupMissing',
  pending: 'creation.postalCodeLookupPending',
}

type UseLotacaoPostalCodeLookupInput = Readonly<{
  patch: (values: Partial<MdfeManifestFormDraft>) => void
}>

type LotacaoPostalCodeField = Readonly<{
  change: (value: string) => void
  statusKey: null | string
}>

export type LotacaoPostalCodeLookupController = Readonly<{
  discharge: LotacaoPostalCodeField
  loading: LotacaoPostalCodeField
}>

/**
 * A lotação não tem endereço: a SEFAZ pede os dois CEPs, e o único campo que o CEP alcança nesta tela
 * é a UF de destino. O de carregamento consulta só para dizer se o CEP existe — a UF de origem é do
 * emitente, e não está no rascunho.
 */
export function useLotacaoPostalCodeLookup(
  input: UseLotacaoPostalCodeLookupInput,
): LotacaoPostalCodeLookupController {
  const { patch } = input
  const discharge = usePostalCodeLookup<MdfeManifestFormDraft>({
    fields: { state: 'destinationState' },
    patch,
  })
  const loading = usePostalCodeLookup<MdfeManifestFormDraft>({
    fields: {},
    patch,
  })

  return {
    discharge: {
      change: (value: string) => {
        patch({ dischargePostalCode: value })
        discharge.lookup(value)
      },
      statusKey: POSTAL_CODE_STATUS_KEY[discharge.status],
    },
    loading: {
      change: (value: string) => {
        patch({ loadingPostalCode: value })
        loading.lookup(value)
      },
      statusKey: POSTAL_CODE_STATUS_KEY[loading.status],
    },
  }
}
