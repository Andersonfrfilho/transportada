ALTER TABLE "company_fiscal_profiles" ADD COLUMN "automatic_mdfe_on_completion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "fiscal_readiness_state" text DEFAULT 'incomplete' NOT NULL;--> statement-breakpoint
CREATE INDEX "cte_batch_items_company_nfe_document_idx" ON "cte_batch_items" ("company_id","nfe_document_id");--> statement-breakpoint
DO $$
DECLARE
  duplicated_trips text;
BEGIN
  -- A trava de manifesto vivo por viagem nasce sobre dado que já existe. Se alguma viagem já tem
  -- dois, o `CREATE UNIQUE INDEX` falharia com a mensagem do Postgres, que não diz qual viagem —
  -- e qual manifesto vale é decisão fiscal humana, nunca do script.
  SELECT string_agg(DISTINCT "trip_id"::text, ', ')
    INTO duplicated_trips
    FROM (
      SELECT "company_id", "trip_id"
        FROM "mdfe_manifests"
       WHERE "trip_id" is not null
         AND "status" not in ('cancelled', 'rejected', 'discarded')
       GROUP BY "company_id", "trip_id"
      HAVING count(*) > 1
    ) AS duplicated;

  IF duplicated_trips IS NOT NULL THEN
    RAISE EXCEPTION 'Trips with more than one live MDF-e manifest: %. Cancel or discard the extra manifest before migrating.', duplicated_trips;
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "mdfe_manifests_company_trip_live_unique" ON "mdfe_manifests" ("company_id","trip_id") WHERE "trip_id" is not null and "status" not in ('cancelled', 'rejected', 'discarded');--> statement-breakpoint
CREATE INDEX "trips_company_fiscal_readiness_idx" ON "trips" ("company_id","fiscal_readiness_state");--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_fiscal_readiness_check" CHECK ("fiscal_readiness_state" in ('incomplete', 'ready', 'manifested', 'divergent'));