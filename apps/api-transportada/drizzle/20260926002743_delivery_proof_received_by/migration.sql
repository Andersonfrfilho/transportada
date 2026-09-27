-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 193 (ADR-0079 Parte A): quem recebeu, em relação ao destinatário, vira coluna do comprovante
-- (`received_by`, lista fechada por CHECK, e `received_by_detail`, texto curto), e o quinto campo da
-- configuração (`received_by`, `optional` de fábrica) entra na geral e nas exceções por CNPJ.
-- Aditiva: colunas novas anuláveis ou com default, sem backfill (D11).
--
-- D4 troca o `receiver_check`: de "assinatura, ou canal office, ou sem nome" para "qualquer tipo
-- menos cargo, ou sem nome". Ele é mais largo para a foto do motorista (que passa a levar o nome) e
-- mais estreito num caso só: `cargo` com nome, que o CHECK antigo aceitava no canal `office`. A
-- verificação abaixo aborta a migration se esse caso existir, em vez de deixá-la falhar no meio do
-- ADD CONSTRAINT sem dizer por quê — nenhuma linha é alterada para caber.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "trip_delivery_proofs"
    WHERE "kind" = 'cargo' AND length("receiver_name") > 0
  ) THEN
    RAISE EXCEPTION 'trip_delivery_proofs has cargo rows with receiver_name, refusing spec 193 receiver_check';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD COLUMN "received_by" text DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD COLUMN "received_by" text DEFAULT 'optional' NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "received_by" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD COLUMN "received_by_detail" varchar(120);--> statement-breakpoint
ALTER TABLE "company_delivery_proof_settings" ADD CONSTRAINT "company_delivery_proof_settings_received_by_check" CHECK ("received_by" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "delivery_proof_setting_overrides" ADD CONSTRAINT "delivery_proof_setting_overrides_received_by_check" CHECK ("received_by" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_received_by_check" CHECK ("received_by" is null or "received_by" in ('recipient', 'spouse', 'child', 'parent', 'sibling', 'other_relative', 'neighbor', 'doorman', 'employee', 'other'));--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_received_by_detail_check" CHECK ("received_by_detail" is null or "received_by" is not null);--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_received_by_kind_check" CHECK ("kind" <> 'cargo' or ("received_by" is null and "received_by_detail" is null));--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_receiver_check", ADD CONSTRAINT "trip_delivery_proofs_receiver_check" CHECK ("kind" <> 'cargo' or length("receiver_name") = 0);