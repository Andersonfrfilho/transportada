-- Spec 196 D2 / ADR-0081 §2 / `plan.md` §Dados: as três tabelas de evento que não tinham coluna de
-- posição nenhuma passam a carregar onde o evento aconteceu.
--
-- Recorte: `trip_status_events`, `trip_stop_occurrences` e `trip_document_occurrences`. As duas que
-- já tinham as quatro colunas de ponto (`trip_stop_events` e `trip_delivery_proofs`) foram tratadas
-- em `20261001123700_event_location_stamp` e não são tocadas aqui.
--
-- Aditiva e reversível: cinco colunas anuláveis, oito CHECKs e um índice parcial por tabela. Sem
-- DEFAULT, sem NOT NULL retroativo, sem destrutivo.
--
-- **Sem backfill, de propósito.** Estas três tabelas nascem sem nenhuma linha com coordenada, então
-- não há `captured` a reconstituir: toda linha existente fica com as cinco colunas NULL, que é o
-- "não se aplica" da D2. O `UPDATE ... SET location_state = 'captured'` que a T1.2 pedia é o de
-- `trip_stop_events`, e ele já saiu na migration irmã — repeti-lo aqui não teria alvo.
--
-- Custo de lock a enxergar em produção:
--   * `ADD COLUMN` anulável e sem default não reescreve a tabela — é só catálogo.
--   * Todo CHECK entra `NOT VALID` e é validado em statement à parte: `ADD CONSTRAINT` validando
--     toma ACCESS EXCLUSIVE com varredura completa, enquanto `VALIDATE CONSTRAINT` toma só SHARE
--     UPDATE EXCLUSIVE e não barra leitura nem escrita. São 24 validações, todas trivialmente
--     verdadeiras (as colunas novas chegam NULL), mas 24 varreduras ainda são 24 varreduras.
--   * O `CREATE INDEX` **não** pode ser `CONCURRENTLY`: ele não roda dentro de bloco de transação, e
--     o migrador aplica cada pasta em uma transação só. O índice nasce vazio (`WHERE latitude is not
--     null` não casa nada), mas a construção ainda varre a tabela tomando SHARE — escrita espera.
--
-- Os dois CHECKs de canal entram **só** nestas três justamente por isso: numa tabela que já tem
-- linha com coordenada eles exigiriam contagem em produção antes (o caso de `trip_stop_events`, em
-- `evidence.md`).
--
-- O CHECK de consistência usa `is not distinct from` porque CHECK que avalia `NULL` **passa** em
-- Postgres: tanto `location_state is null or (...)` quanto `(location_state = 'captured') = (...)`
-- aceitam a linha com coordenada e estado nulo, que é exatamente a que ele existe para barrar.
ALTER TABLE "trip_status_events" ADD COLUMN "latitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD COLUMN "longitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD COLUMN "accuracy_meters" numeric(10,2);--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD COLUMN "location_state" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "latitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "longitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "accuracy_meters" numeric(10,2);--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD COLUMN "location_state" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "latitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "longitude" numeric(10,7);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "accuracy_meters" numeric(10,2);--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD COLUMN "location_state" varchar(16);--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_coordinates_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_latitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_longitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_accuracy_check" CHECK ("accuracy_meters" is null or "latitude" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_accuracy_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_location_state_check" CHECK ("location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_location_state_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_location_state_consistency_check" CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_location_state_consistency_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app') NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_coordinates_channel_check";--> statement-breakpoint
ALTER TABLE "trip_status_events" ADD CONSTRAINT "trip_status_events_location_state_channel_check" CHECK ("location_state" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_location_state_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_coordinates_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_latitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_longitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_accuracy_check" CHECK ("accuracy_meters" is null or "latitude" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_accuracy_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_location_state_check" CHECK ("location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_location_state_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_location_state_consistency_check" CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_location_state_consistency_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app') NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_coordinates_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" ADD CONSTRAINT "trip_stop_occurrences_location_state_channel_check" CHECK ("location_state" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_location_state_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_coordinates_check" CHECK (("latitude" is null) = ("longitude" is null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_coordinates_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_latitude_range_check" CHECK ("latitude" is null or "latitude" between -90 and 90) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_latitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_longitude_range_check" CHECK ("longitude" is null or "longitude" between -180 and 180) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_longitude_range_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_accuracy_check" CHECK ("accuracy_meters" is null or "latitude" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_accuracy_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_location_state_check" CHECK ("location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_location_state_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_location_state_consistency_check" CHECK (("location_state" is not distinct from 'captured') = ("latitude" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_location_state_consistency_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app') NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_coordinates_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" ADD CONSTRAINT "trip_document_occurrences_location_state_channel_check" CHECK ("location_state" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_location_state_channel_check";--> statement-breakpoint
CREATE INDEX "trip_status_events_located_recorded_at_idx" ON "trip_status_events" ("recorded_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_stop_occurrences_located_created_at_idx" ON "trip_stop_occurrences" ("created_at") WHERE "latitude" is not null;--> statement-breakpoint
CREATE INDEX "trip_document_occurrences_located_created_at_idx" ON "trip_document_occurrences" ("created_at") WHERE "latitude" is not null;
