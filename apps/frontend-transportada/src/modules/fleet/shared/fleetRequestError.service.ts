/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './fleetGuards.validation'

export type FleetErrorDetail = Readonly<{
  field: string
  message: string
}>

/**
 * O 400 da API diz qual campo recusou, e até aqui esse detalhe morria no cliente: sobrava o código
 * genérico, e o operador relia a ficha inteira procurando o que estava errado. A `message` continua
 * sendo o código, porque é por ela que todo o módulo escolhe o texto do aviso.
 */
export class FleetRequestError extends Error {
  public readonly details: readonly FleetErrorDetail[]

  public constructor(code: string, details: readonly FleetErrorDetail[] = []) {
    super(code)
    this.name = 'FleetRequestError'
    this.details = details
  }
}

export function readErrorDetails(payload: unknown): readonly FleetErrorDetail[] {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return []
  }
  return payload.error.details.flatMap((detail: unknown) =>
    isRecord(detail) && isString(detail.field) && isString(detail.message)
      ? [{ field: detail.field, message: detail.message }]
      : [],
  )
}

export function toInvalidFields(error: unknown): readonly string[] {
  if (!(error instanceof FleetRequestError)) return []
  const seen = new Set<string>()
  for (const detail of error.details) seen.add(detail.field)
  return [...seen]
}
