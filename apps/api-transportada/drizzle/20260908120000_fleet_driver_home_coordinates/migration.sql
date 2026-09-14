-- A casa do motorista precisa de coordenada para o retorno da viagem entrar na conta (spec 097 D6).
--
-- ⚠️ A coordenada NÃO vem de uma consulta nossa a provedor pago — a ADR-0044 recusa a escalada em
-- runtime. Ela é a que o Photon já devolve na busca textual do próprio formulário do motorista, e que
-- era descartada em `fromPhotonFeature` desde que a ADR-0037 tirou o mapa do cadastro. O que muda é
-- guardar o que já chegava.
--
-- ⚠️ Meia gravação é proibida: latitude e longitude nascem e morrem juntas. Um par pela metade
-- apontaria para o meridiano de Greenwich ou para o equador, e o mapa desenharia a casa no oceano.
--
-- ⚠️ Estas duas colunas são PII mais precisa que a rua em texto, e entram no envelope da ADR-0039
-- junto do endereço residencial quando ela for executada.
ALTER TABLE "fleet_drivers" ADD COLUMN "home_latitude" numeric(10, 7);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD COLUMN "home_longitude" numeric(10, 7);
--> statement-breakpoint
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_home_coordinates_check" CHECK (
  ("home_latitude" is null) = ("home_longitude" is null)
  and ("home_latitude" is null or "home_latitude" between -34 and 6)
  and ("home_longitude" is null or "home_longitude" between -74 and -34)
);
