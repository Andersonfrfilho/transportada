-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 153 T802 (N3): revisão própria do conjunto de paradas. O compare-and-set do congelamento da
-- rota (`writePlannedRoute`) comparava `trips.updated_at`, e qualquer escrita alheia em `trips` na
-- janela — relato de campo do motorista, override de MDF-e — tocava essa coluna e fazia o UPDATE do
-- congelamento afetar zero linhas, em silêncio. O trigger é o único escritor desta coluna: nenhum
-- caso de uso a incrementa à mão, então a lista de quem mexe em parada (reconciliação, reordenação,
-- relato de campo) não precisa ser mantida em sincronia em código — ela só muda quando uma linha de
-- `trip_stops` muda de verdade.
ALTER TABLE "trips" ADD COLUMN "planned_route_stops_revision" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE FUNCTION "bump_trip_planned_route_stops_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		UPDATE "trips"
			SET "planned_route_stops_revision" = "planned_route_stops_revision" + 1
			WHERE "company_id" = OLD."company_id" AND "id" = OLD."trip_id";
		RETURN OLD;
	ELSE
		UPDATE "trips"
			SET "planned_route_stops_revision" = "planned_route_stops_revision" + 1
			WHERE "company_id" = NEW."company_id" AND "id" = NEW."trip_id";
		RETURN NEW;
	END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "trip_stops_bump_planned_route_revision_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "trip_stops"
FOR EACH ROW
EXECUTE FUNCTION "bump_trip_planned_route_stops_revision"();
