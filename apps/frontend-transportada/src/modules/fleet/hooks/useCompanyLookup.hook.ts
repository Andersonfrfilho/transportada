/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { normalizeTaxId } from '@/modules/shared/taxId.service'
import { useGuardedRequest } from '@/modules/shared/useGuardedRequest.hook'

import { isQueryableCompanyTaxId, lookupCompanyLegalName } from '../shared/companyLookup.service'
import type { FleetDriverFormState } from '../shared/fleet.types'

type UseCompanyLookupInput = Readonly<{
  fetch?: typeof globalThis.fetch
  patch: (values: Partial<FleetDriverFormState>) => void
}>

export type CompanyLookupController = Readonly<{
  changeTaxId: (value: string) => void
  statusKey: null | string
}>

export function useCompanyLookup(input: UseCompanyLookupInput): CompanyLookupController {
  const { patch } = input
  const injectedFetch = input.fetch
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )
  const [statusKey, setStatusKey] = useState<null | string>(null)
  const run = useGuardedRequest()

  function changeTaxId(value: string): void {
    const taxId = normalizeTaxId(value)
    // A razão social é preenchida pela consulta do CNPJ: apagar o CNPJ e deixá-la para trás monta a
    // combinação que a API recusa (`linkedLegalName requires linkedTaxId`), e a recusa só apareceria
    // no envio, longe do campo que a causou.
    patch(taxId === '' ? { linkedLegalName: '', linkedTaxId: taxId } : { linkedTaxId: taxId })
    setStatusKey(null)
    if (!isQueryableCompanyTaxId(taxId)) return
    setStatusKey('companyLookupPending')
    run(
      (signal) => lookupCompanyLegalName({ fetch: fetchImplementation, signal, taxId }),
      (legalName) => {
        if (legalName === null) {
          setStatusKey('companyLookupMissing')
          return
        }
        patch({ linkedLegalName: legalName })
        setStatusKey('companyLookupFound')
      },
    )
  }

  return { changeTaxId, statusKey }
}
