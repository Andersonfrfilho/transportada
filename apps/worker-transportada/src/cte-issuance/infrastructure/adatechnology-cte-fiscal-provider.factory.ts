/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createFiscalProvider,
  type CteConfig,
  type FiscalProvider,
} from '@adatechnology/fiscal-provider'

import type { CteFiscalProvider, CteProviderConfig } from './cte-fiscal-gateway.js'

export function createAdatechnologyCteFiscalProvider(input: {
  readonly config: CteProviderConfig
}): CteFiscalProvider {
  return createFiscalProvider(input.config as CteConfig) as FiscalProvider as CteFiscalProvider
}
