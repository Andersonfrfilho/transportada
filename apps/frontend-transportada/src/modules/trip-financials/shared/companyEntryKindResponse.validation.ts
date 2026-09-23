/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPANY_ENTRY_KIND_SIDES,
  type CompanyEntryKind,
  type CompanyEntryKindSide,
} from './tripFinancials.types'

export class CompanyEntryKindResponseError extends Error {
  public constructor() {
    super('COMPANY_ENTRY_KIND_RESPONSE_INVALID')
    this.name = 'CompanyEntryKindResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new CompanyEntryKindResponseError()
  return value
}

function readSide(value: unknown): CompanyEntryKindSide {
  const side = readString(value)
  if (!(COMPANY_ENTRY_KIND_SIDES as readonly string[]).includes(side)) {
    throw new CompanyEntryKindResponseError()
  }
  return side as CompanyEntryKindSide
}

function toEntryKind(value: unknown): CompanyEntryKind {
  if (!isRecord(value)) throw new CompanyEntryKindResponseError()
  if (typeof value.active !== 'boolean') throw new CompanyEntryKindResponseError()
  if (typeof value.displayOrder !== 'number') throw new CompanyEntryKindResponseError()

  return {
    active: value.active,
    displayOrder: value.displayOrder,
    id: readString(value.id),
    name: readString(value.name),
    side: readSide(value.side),
  }
}

export function toCompanyEntryKinds(payload: unknown): readonly CompanyEntryKind[] {
  if (!isRecord(payload)) throw new CompanyEntryKindResponseError()
  if (!Array.isArray(payload.data)) throw new CompanyEntryKindResponseError()

  return payload.data.map(toEntryKind)
}

export function toCompanyEntryKind(payload: unknown): CompanyEntryKind {
  if (!isRecord(payload)) throw new CompanyEntryKindResponseError()

  return toEntryKind(payload.data)
}
