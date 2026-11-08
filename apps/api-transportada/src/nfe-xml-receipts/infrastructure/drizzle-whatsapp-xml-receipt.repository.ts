/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'

import {
  contractorContacts,
  membershipRoles,
  nfeXmlReceipts,
  userCompanyMemberships,
  userWhatsAppPhones,
} from '../../database/database.schema.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../identity/domain/system-distribution-actor.constant.js'
import { WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS } from '../../whatsapp-commands/domain/whatsapp-phone-verification.constant.js'
import { toWhatsAppPhone } from '../../whatsapp-commands/domain/whatsapp-phone.policy.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import type { WhatsAppXmlReceiptRepositoryPort } from '../application/receive-whatsapp-xml-document.service.js'
import { NFE_XML_IMPORT_ROLES } from '../domain/nfe-xml-receipt.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleWhatsAppXmlReceiptRepository(
  database: Database,
): WhatsAppXmlReceiptRepositoryPort {
  return {
    async findImportSender({ companyId, now, phone }) {
      const canonical = toWhatsAppPhone(phone)
      if (canonical === undefined) return undefined
      const [row] = await database
        .select({ userId: userWhatsAppPhones.userId })
        .from(userWhatsAppPhones)
        .innerJoin(
          userCompanyMemberships,
          and(
            eq(userCompanyMemberships.userId, userWhatsAppPhones.userId),
            eq(userCompanyMemberships.companyId, companyId),
            eq(userCompanyMemberships.status, 'active'),
          ),
        )
        .innerJoin(
          membershipRoles,
          and(
            eq(membershipRoles.membershipId, userCompanyMemberships.id),
            inArray(membershipRoles.role, [...NFE_XML_IMPORT_ROLES]),
          ),
        )
        .where(
          and(
            eq(userWhatsAppPhones.phoneKey, toWhatsAppPhoneKey(canonical)),
            isNotNull(userWhatsAppPhones.verifiedAt),
            gt(
              userWhatsAppPhones.verifiedAt,
              new Date(now.getTime() - WHATSAPP_PHONE_VERIFICATION_VALIDITY_MS),
            ),
          ),
        )
        .limit(1)
      if (row !== undefined) return { userId: row.userId }

      // Spec 302: o contato do contratante autorizado a enviar XML (tipo `nfe_xml`, ativo, com o aceite do WhatsApp).
      // Não é usuário da empresa: a importação é gravada com o ator de sistema, e o remetente fica no registro.
      const [contact] = await database
        .select({ id: contractorContacts.id })
        .from(contractorContacts)
        .where(
          and(
            eq(contractorContacts.companyId, companyId),
            eq(contractorContacts.status, 'active'),
            isNotNull(contractorContacts.whatsappOptInAt),
            sql`'nfe_xml' = any(${contractorContacts.types})`,
            sql`left(${contractorContacts.phone}, 4) || right(${contractorContacts.phone}, 8) = ${toWhatsAppPhoneKey(canonical)}`,
          ),
        )
        .limit(1)
      return contact === undefined ? undefined : { userId: SYSTEM_DISTRIBUTION_ACTOR_USER_ID }
    },

    async recordReceipt(input) {
      const rows = await database
        .insert(nfeXmlReceipts)
        .values({
          channel: 'whatsapp',
          companyId: input.companyId,
          media: input.media,
          providerMessageId: input.providerMessageId,
          rejectReason: input.rejectReason,
          replyTo: input.replyTo,
          requestedByUserId: input.requestedByUserId,
          sender: input.sender,
          status: input.status,
        })
        .onConflictDoNothing()
        .returning({ id: nfeXmlReceipts.id })
      return { created: rows.length > 0 }
    },
  }
}
