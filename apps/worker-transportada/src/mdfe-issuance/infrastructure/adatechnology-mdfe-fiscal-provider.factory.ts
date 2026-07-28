/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SefazMdfeProvider } from '@adatechnology/fiscal-provider'

import type { MdfeFiscalProvider } from './mdfe-fiscal-gateway.js'

// `createFiscalProvider` devolve `FiscalProvider`, que não declara `close` — o evento 110112 só
// aparece no tipo da classe, por isso o MDF-e é instanciado direto em vez de sair da factory.
export function createAdatechnologyMdfeFiscalProvider(): MdfeFiscalProvider {
  return new SefazMdfeProvider() as MdfeFiscalProvider
}
