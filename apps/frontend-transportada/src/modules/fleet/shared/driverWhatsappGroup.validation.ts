/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O grupo vinculado à ficha. `groupName` é só rótulo (o grupo pode ser renomeado no WhatsApp). */
export type DriverWhatsappGroup = Readonly<{
  groupJid: string
  groupName: string
  updatedAt: string
}>

/** Um grupo do número conectado; `assigned*` preenchidos quando já pertence a um motorista. */
export type WhatsappGroupOption = Readonly<{
  assignedDriverId: null | string
  assignedDriverName: null | string
  groupJid: string
  name: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}

function isDriverWhatsappGroup(value: unknown): value is DriverWhatsappGroup {
  return (
    isRecord(value) &&
    typeof value.groupJid === 'string' &&
    typeof value.groupName === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

function isWhatsappGroupOption(value: unknown): value is WhatsappGroupOption {
  return (
    isRecord(value) &&
    typeof value.groupJid === 'string' &&
    typeof value.name === 'string' &&
    isNullableString(value.assignedDriverId) &&
    isNullableString(value.assignedDriverName)
  )
}

/** `{ data: grupo | null }`. */
export function isDriverWhatsappGroupResponse(
  value: unknown,
): value is Readonly<{ data: DriverWhatsappGroup | null }> {
  return isRecord(value) && (value.data === null || isDriverWhatsappGroup(value.data))
}

/** `{ data: grupo[] }`. */
export function isWhatsappGroupListResponse(
  value: unknown,
): value is Readonly<{ data: readonly WhatsappGroupOption[] }> {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isWhatsappGroupOption)
}
