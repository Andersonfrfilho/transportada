/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import type { DriverRegisteredPix } from '../shared/driverTrip.types'

/** A chave PIX do cadastro do motorista/agregado, vinda do snapshot — pré-preenche a cobrança no recebimento. */
export const DriverRegisteredPixContext = createContext<DriverRegisteredPix | null>(null)

export function useDriverRegisteredPix(): DriverRegisteredPix | null {
  return useContext(DriverRegisteredPixContext)
}
