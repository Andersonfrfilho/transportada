-- Spec 281 T3b (D12): os contatos do cliente numa tabela so. A `delivery_client_emails` da 279 ja esta em producao, entao a troca e em dois passos: renomeia a tabela, acrescenta o canal e a ocorrencia de origem, e deixa uma visao `delivery_client_emails` (so as linhas `email`) para a API e o worker antigos enquanto o deploy troca as imagens. A visao sai numa migration futura, quando nada mais a ler.
ALTER TABLE "delivery_client_emails" RENAME TO "delivery_client_contacts";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_pkey" TO "delivery_client_contacts_pkey";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_client_fk" TO "delivery_client_contacts_client_fk";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_purpose_check" TO "delivery_client_contacts_purpose_check";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_label_check" TO "delivery_client_contacts_label_check";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_created_by_kind_check" TO "delivery_client_contacts_created_by_kind_check";--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" RENAME CONSTRAINT "delivery_client_emails_address_check" TO "delivery_client_contacts_address_check";--> statement-breakpoint
ALTER INDEX "delivery_client_emails_client_purpose_address_unique" RENAME TO "delivery_client_contacts_client_purpose_address_unique";--> statement-breakpoint
ALTER INDEX "delivery_client_emails_client_purpose_idx" RENAME TO "delivery_client_contacts_client_purpose_idx";--> statement-breakpoint
-- Padrao constante `email`, sem UPDATE: toda linha da 279 e e-mail.
ALTER TABLE "delivery_client_contacts" ADD COLUMN "channel" varchar(16) DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" ADD COLUMN "source_occurrence_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_client_contacts" ADD CONSTRAINT "delivery_client_contacts_channel_check" CHECK ("channel" in ('email', 'whatsapp'));--> statement-breakpoint
-- A forma do endereco passa a depender do canal: e-mail como na 279, WhatsApp em E.164. Toda linha existente e `email` e ja cumpria a regra antiga.
ALTER TABLE "delivery_client_contacts" DROP CONSTRAINT "delivery_client_contacts_address_check", ADD CONSTRAINT "delivery_client_contacts_address_check" CHECK (("channel" = 'email' and length("address") <= 254 and "address" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') or ("channel" = 'whatsapp' and "address" ~ '^\+[1-9][0-9]{7,14}$'));--> statement-breakpoint
-- Compatibilidade do deploy: visao simples e atualizavel, com as colunas da 279. O INSERT por ela cai no padrao `email` da tabela.
CREATE VIEW "delivery_client_emails" AS
  SELECT "id", "company_id", "tax_id", "purpose", "address", "label", "created_by_kind", "created_by_user_id", "created_at", "updated_at"
    FROM "delivery_client_contacts"
   WHERE "channel" = 'email';--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "client_channel" varchar(16) DEFAULT 'email' NOT NULL;--> statement-breakpoint
-- Spec 281 D11 (RF8): padrao constante `email`, sem UPDATE: o que a 279 faz nao muda, o `client_email_type` segue ligando o e-mail.
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_client_channel_check" CHECK ("client_channel" in ('off', 'email', 'whatsapp', 'both'));
