-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 315 T2/T2b (D1, D10): a localização, o horário de chegada e a espera mínima viram dado do tipo.
-- Tudo aditivo, sem UPDATE: os modos entram `off` e a espera mínima nula, então nenhum tipo existente muda de
-- comportamento. As CHECKs só depois das colunas; a espera mínima exclui o horário de chegada digitado
-- (`arrival_time_mode = 'off'`), porque a espera conta do toque em "Cheguei".
ALTER TABLE "company_occurrence_types" ADD COLUMN "location_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "arrival_time_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD COLUMN "min_wait_after_arrival_minutes" smallint;--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_location_mode_check" CHECK ("location_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_arrival_time_mode_check" CHECK ("arrival_time_mode" in ('required', 'optional', 'off'));--> statement-breakpoint
ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_min_wait_check" CHECK ("min_wait_after_arrival_minutes" is null or ("min_wait_after_arrival_minutes" between 1 and 1440 and "arrival_time_mode" = 'off'));
