-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 321 T1 (D2, D4c): duas marcas do tipo de ocorrência, aditivas e sem UPDATE. `blocks_contractor_notice` entra
-- `false` (nenhum tipo deixa de avisar a contratante) e `counts_cargo_on_pickup_trip` entra `true` (o comportamento
-- natural de qualquer vínculo); o tipo "Canhoto retido pelo cliente" é cadastrado depois com `true`/`false`.
ALTER TABLE "company_occurrence_types" ADD COLUMN "blocks_contractor_notice" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "counts_cargo_on_pickup_trip" boolean DEFAULT true NOT NULL;
