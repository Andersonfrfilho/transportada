-- Spec 196 D3 revista / ADR-0081 §3 / T1.4: o canal `whatsapp` passa a poder gravar o ponto — o
-- motorista manda a mensagem de localização e a coordenada entra no mesmo evento. Corretiva e
-- aditiva sobre `20261002153258_occurrence_location_stamp`, que já está em staging e não se edita.
--
-- Só afrouxa o CHECK `<tabela>_coordinates_channel_check` das três tabelas que o têm
-- (`trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences`): de
-- `"channel" = 'driver_app'` para `"channel" in ('driver_app', 'whatsapp')`. As colunas, os outros
-- sete CHECKs e o índice não mudam; o CHECK de estado já aceitava `whatsapp`. `trip_stop_events` e
-- `trip_delivery_proofs` nunca tiveram CHECK de canal de coordenada e não são tocadas.
--
-- Custo de lock: o par DROP + ADD vai num ALTER só, então não há janela sem CHECK. O novo entra
-- `NOT VALID` e é validado à parte (SHARE UPDATE EXCLUSIVE, não barra leitura nem escrita); é
-- trivialmente verdadeiro, pois todo valor aceito antes continua aceito.
ALTER TABLE "trip_status_events" DROP CONSTRAINT "trip_status_events_coordinates_channel_check", ADD CONSTRAINT "trip_status_events_coordinates_channel_check" CHECK ("latitude" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_status_events" VALIDATE CONSTRAINT "trip_status_events_coordinates_channel_check";--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" DROP CONSTRAINT "trip_stop_occurrences_coordinates_channel_check", ADD CONSTRAINT "trip_stop_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_stop_occurrences" VALIDATE CONSTRAINT "trip_stop_occurrences_coordinates_channel_check";--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_coordinates_channel_check", ADD CONSTRAINT "trip_document_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" in ('driver_app', 'whatsapp')) NOT VALID;--> statement-breakpoint
ALTER TABLE "trip_document_occurrences" VALIDATE CONSTRAINT "trip_document_occurrences_coordinates_channel_check";
