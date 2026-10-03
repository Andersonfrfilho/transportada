/* Copyright (c) 2026 Ada Technology. MIT License. */

/** A única permissão da conta que só acompanha viagens: o painel não tem área para ela (spec 235). */
const TRIP_TRACKING_PERMISSION = 'trip.read'

export type NoWorkspaceAccessVariant =
  | Readonly<{ driverAppUrl?: string; kind: 'tracking' }>
  | Readonly<{ kind: 'default' }>

/**
 * Spec 239 D5: quem chega à tela de "sem acesso" com `trip.read` tem uma permissão, e a frase de
 * "nenhuma permissão foi atribuída" seria falsa. O destino é o app do motorista, quando existe.
 */
export function resolveNoWorkspaceAccessVariant(
  input: Readonly<{ driverAppUrl: string | undefined; permissions: readonly string[] }>,
): NoWorkspaceAccessVariant {
  if (!input.permissions.includes(TRIP_TRACKING_PERMISSION)) return { kind: 'default' }
  if (input.driverAppUrl === undefined) return { kind: 'tracking' }

  return { driverAppUrl: input.driverAppUrl, kind: 'tracking' }
}
