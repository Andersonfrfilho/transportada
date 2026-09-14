-- "Procurou" é diferente de "achou" (spec 097 D6).
--
-- ⚠️ Sem esta coluna, o "depois não faz mais" só valeria para quem o provedor encontrou: o motorista
-- cujo endereço o Photon não acha ficaria com a coordenada nula para sempre, e cada carregamento da
-- montagem dispararia uma busca nova — uma chamada externa por página, para sempre, sem ninguém ver.
--
-- A coordenada diz que ACHOU. Esta marca diz que PROCUROU. Endereço editado à mão zera as duas
-- juntas, e aí a busca acontece de novo — de propósito: é outro endereço.
ALTER TABLE "fleet_drivers" ADD COLUMN "home_geocoded_at" timestamp with time zone;
--> statement-breakpoint
-- Coordenada sem marca seria dado sem procedência; marca sem coordenada é o "procurei e não achei".
ALTER TABLE "fleet_drivers" ADD CONSTRAINT "fleet_drivers_home_geocoded_at_check" CHECK (
  "home_latitude" is null or "home_geocoded_at" is not null
);
