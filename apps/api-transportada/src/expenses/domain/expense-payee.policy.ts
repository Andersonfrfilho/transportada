/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 RF1e (T1.4c): o rótulo do favorecido do pagamento, lido do cadastro na hora. O ajudante é um perfil de
 * `fleet_drivers` (spec 235, ADR-0093): a ficha que não dirige (`can_drive = false`) é o ajudante; a que dirige é o
 * agregado (`payment_model = 'route_table'`, ADR-0049) ou o motorista da casa (`fixed`). Sem I/O.
 */
import type { ExpensePayeeProfile } from '../application/expense.port.js'

export function resolveExpensePayeeProfile(input: {
  readonly canDrive: boolean
  readonly paymentModel: string
}): ExpensePayeeProfile {
  if (!input.canDrive) return 'helper'
  return input.paymentModel === 'route_table' ? 'aggregate' : 'driver'
}
