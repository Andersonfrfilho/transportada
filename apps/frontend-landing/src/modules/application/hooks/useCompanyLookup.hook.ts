import { useRef, useState } from 'react'

import { CNPJ_LENGTH, normalizeTaxId } from '@/modules/shared/taxId.service'
import type { CompanyInfo, CompanyInfoClient } from '../shared/cnpjInfo.service'

export type CompanyLookupState = 'idle' | 'looking' | 'found' | 'unknown'

export type CompanyLookup = Readonly<{
  company: CompanyInfo | undefined
  /** Some quando o interessado corrige o campo: o dado deixou de ser o que a Receita respondeu. */
  forget: () => void
  lookup: (taxId: string) => Promise<CompanyInfo | undefined>
  state: CompanyLookupState
}>

/** Só CNPJ completo consulta — CPF não tem cadastro público, e documento pela metade é digitação. */
export function isLookupableCnpj(taxId: string): boolean {
  return normalizeTaxId(taxId).length === CNPJ_LENGTH
}

export function useCompanyLookup(client: CompanyInfoClient): CompanyLookup {
  const [company, setCompany] = useState<CompanyInfo | undefined>(undefined)
  const [state, setState] = useState<CompanyLookupState>('idle')
  // Uma consulta por documento: digitar de novo cancela a anterior, senão a resposta velha chega
  // depois da nova e preenche a ficha com a empresa errada.
  const pending = useRef<AbortController | undefined>(undefined)

  function forget(): void {
    pending.current?.abort()
    pending.current = undefined
    setCompany(undefined)
    setState('idle')
  }

  async function lookup(taxId: string): Promise<CompanyInfo | undefined> {
    if (!isLookupableCnpj(taxId)) {
      forget()
      return undefined
    }

    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setState('looking')

    const found = await client.lookup({ cnpj: taxId, signal: controller.signal })
    if (controller.signal.aborted) return undefined

    pending.current = undefined
    setCompany(found)
    setState(found === undefined ? 'unknown' : 'found')
    return found
  }

  return { company, forget, lookup, state }
}
