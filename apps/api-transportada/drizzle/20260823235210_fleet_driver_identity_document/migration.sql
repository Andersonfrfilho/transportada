ALTER TABLE "fleet_drivers" ADD COLUMN "identity_document" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "identity_document_issuer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "identity_document_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_identity_document_issuer_check" CHECK (length("identity_document_issuer") = 0 or "identity_document_issuer" in ('SSP', 'PC', 'DETRAN', 'SDS', 'IFP', 'IML', 'DIC', 'SJS', 'SES', 'PF', 'MEX', 'MAER', 'MMA', 'OAB', 'CTPS', 'RNE', 'OUTROS'));--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_identity_document_state_check" CHECK (length("identity_document_state") = 0 or "identity_document_state" ~ '^[A-Z]{2}$');--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_identity_document_check" CHECK (length("identity_document") <= 20);