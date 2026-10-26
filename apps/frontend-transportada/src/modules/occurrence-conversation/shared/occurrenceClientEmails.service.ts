/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

/** Spec 279 T6c: o que o detalhe da ocorrência mostra do cadastro do cliente; o endereço chega só mascarado (RF1). */
export type OccurrenceClientEmail = Readonly<{
  addressMasked: string
  id: string
  label: string
  purpose: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Descarta o item malformado em vez de derrubar o painel: esta seção é leitura e vem depois do resto. */
export function parseOccurrenceClientEmails(payload: unknown): readonly OccurrenceClientEmail[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  const emails: OccurrenceClientEmail[] = []
  for (const item of payload.data as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.addressMasked === 'string' &&
      typeof item.label === 'string' &&
      typeof item.purpose === 'string'
    ) {
      emails.push({
        addressMasked: item.addressMasked,
        id: item.id,
        label: item.label,
        purpose: item.purpose,
      })
    }
  }
  return emails
}

/** `GET /delivery-clients/:taxId/emails` (`fleet.read`); o CNPJ/CPF vai só com dígitos, como a rota do cliente espera. */
export async function readOccurrenceClientEmails(
  taxId: string,
): Promise<readonly OccurrenceClientEmail[]> {
  const digits = taxId.replaceAll(/\D/gu, '')
  const accessToken = await getKeycloakAuthProvider().getAccessToken()
  const response = await fetch(
    new Request(`${getIdentityEnvironment().apiBaseUrl}/delivery-clients/${digits}/emails`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
    }),
  )
  if (!response.ok) throw new Error('OCCURRENCE_CLIENT_EMAILS_REQUEST_FAILED')
  return parseOccurrenceClientEmails((await response.json()) as unknown)
}
