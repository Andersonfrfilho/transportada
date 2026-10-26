/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ClientBoletoEmailDelivery } from '@/modules/client-email/shared/clientBoletoEmail.types'
import { getClientBoletoEmailRuntime } from '@/modules/client-email/shared/clientBoletoEmailInstance.service'

/** Spec 279 T6c (RF13): o e-mail do cliente guardado, sempre na forma mascarada (RF2). */
export type DriverClientEmail = Readonly<{ addressMasked: string; emailId: string; label: string }>

/** Spec 279 T6b (RF12): o estado do envio por endereço; só leitura, o "Tentar de novo" é do escritório. */
export type DriverClientEmailDelivery = ClientBoletoEmailDelivery

export type DriverClientEmailsView = Readonly<{
  deliveries: readonly DriverClientEmailDelivery[]
  emails: readonly DriverClientEmail[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Descarta o item malformado: a seção é leitura, e um item ruim não derruba a folha. */
export function parseDriverClientEmails(payload: unknown): readonly DriverClientEmail[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.clientEmails)) {
    return []
  }
  const emails: DriverClientEmail[] = []
  for (const item of payload.data.clientEmails as unknown[]) {
    if (
      isRecord(item) &&
      typeof item.addressMasked === 'string' &&
      typeof item.emailId === 'string' &&
      typeof item.label === 'string'
    ) {
      emails.push({ addressMasked: item.addressMasked, emailId: item.emailId, label: item.label })
    }
  }
  return emails
}

/** `GET /me/trips/current/occurrences/:id/client-boleto-emails` (T4) pelo cliente único da T6; a recusa (`409`) vira erro. */
export async function readDriverClientEmails(
  occurrenceId: string,
): Promise<DriverClientEmailsView> {
  const options = await getClientBoletoEmailRuntime().api.list(occurrenceId)
  return { deliveries: options.deliveries, emails: options.clientEmails }
}
