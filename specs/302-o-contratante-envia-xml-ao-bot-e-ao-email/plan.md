# Plano — 302

- `database/contractor-mail.schema.ts`: `CONTRACTOR_CONTACT_TYPES` ganha `nfe_xml`; migration `20261108161438_contractor_contact_nfe_xml` (CHECK ampliado) e rollback.
- API: `nfe-xml-receipts/infrastructure/drizzle-whatsapp-xml-receipt.repository.ts:findImportSender` cai para `contractor_contacts` (tipo, status, aceite, `phone_key`) e devolve o ator de sistema. As rotas de contato já usam `CONTRACTOR_CONTACT_TYPES`.
- Worker: `drizzle-nfe-xml-receipt.repository.ts:findAuthorizedSenderByEmail` cai para `contractor_contacts` (tipo e status, e-mail sem distinguir caixa).
- Painel: `nfe_xml` na lista de tipos (cópia por valor) e rótulos pt/en.
