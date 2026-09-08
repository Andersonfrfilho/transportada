-- A viagem congela o pedágio no momento em que o roteiro é planejado (spec 090 T11) — recalcular na
-- leitura da valoração pareia a rota de hoje com a distância congelada de ontem, a mesma divergência
-- da D4 dentro do mesmo painel. Meia gravação é proibida: os dois campos nascem e morrem juntos.
ALTER TABLE "trips" ADD COLUMN "planned_toll" jsonb;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "planned_toll_frozen_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_planned_toll_check" CHECK (("planned_toll" is null) = ("planned_toll_frozen_at" is null));
