/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: ler a chegada é `fleet.read` e escrever é `trip.manage` — o separador tem as duas.
 * `trip.read` ficou de fora de propósito: é a leitura recortada do motorista, e daria a `driver`,
 * `helper` e `aggregate` as chegadas da empresa inteira.
 */
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  CARGO_ARRIVAL_READ_PERMISSION,
  CARGO_ARRIVAL_WRITE_PERMISSION,
} from '../../shared/cargo-arrival.constant.js'

export const CARGO_ARRIVAL_READ_POLICY = {
  permission: CARGO_ARRIVAL_READ_PERMISSION,
  scope: 'company',
} as const
export const CARGO_ARRIVAL_MANAGE_POLICY = {
  permission: CARGO_ARRIVAL_WRITE_PERMISSION,
  scope: 'company',
} as const

export function jsonResponse(params: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(params.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: params.status,
  })
}
