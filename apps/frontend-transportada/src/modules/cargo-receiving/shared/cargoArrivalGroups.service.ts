/* Copyright (c) 2026 Ada Technology. MIT License. */
import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

import type { CargoArrivalDocument, CargoArrivalGroup } from './cargoArrival.types'

export type GroupToggles = Readonly<Record<string, boolean>>

/** O grupo é rota × cidade; o JSON impede que `null` e o texto "null" colidam como chave. */
export function resolveGroupKey(group: CargoArrivalGroup): string {
  return JSON.stringify([group.routeName, group.cityIbgeCode])
}

/**
 * O nome da cidade é o que a API devolve junto das notas (endereço do destinatário); o painel não tem
 * tabela de municípios. Sem nome, o código IBGE; sem nada, `null` — a tela diz "Sem cidade".
 */
export function resolveGroupCityLabel(group: CargoArrivalGroup): string | null {
  const named = group.documents.find((document) => document.cityName !== null)
  return named?.cityName ?? group.cityIbgeCode
}

function hasPendingDocuments(group: CargoArrivalGroup): boolean {
  return group.counts.separated < group.counts.total
}

/** Abre sozinho o primeiro grupo com pendência; o toque do separador vence o padrão, nos dois sentidos. */
export function resolveOpenGroupKeys(
  input: Readonly<{ groups: readonly CargoArrivalGroup[]; toggled: GroupToggles }>,
): ReadonlySet<string> {
  const defaultGroup = input.groups.find(hasPendingDocuments)
  const open = new Set(defaultGroup === undefined ? [] : [resolveGroupKey(defaultGroup)])
  for (const [key, isOpen] of Object.entries(input.toggled)) {
    if (isOpen) open.add(key)
    else open.delete(key)
  }
  return open
}

/** A busca esconde as notas que não casam; as contagens do grupo continuam as do grupo inteiro. */
export function filterGroupsByNumber(
  input: Readonly<{ groups: readonly CargoArrivalGroup[]; query: string }>,
): readonly CargoArrivalGroup[] {
  const needle = input.query.trim()
  if (needle === '') return input.groups
  return input.groups.flatMap((group) => {
    const documents = group.documents.filter((document) => document.number.includes(needle))
    return documents.length === 0 ? [] : [{ ...group, documents }]
  })
}

/** A chave lida pela câmera, ou o link do QR Code que a carrega, achada entre as notas desta chegada. */
export function findDocumentByScannedText(
  input: Readonly<{ groups: readonly CargoArrivalGroup[]; scanned: string }>,
): CargoArrivalDocument | undefined {
  const accessKey = extractNfeAccessKey(input.scanned)
  if (accessKey === undefined) return undefined
  return input.groups
    .flatMap((group) => group.documents)
    .find((document) => document.accessKey.toUpperCase() === accessKey)
}
