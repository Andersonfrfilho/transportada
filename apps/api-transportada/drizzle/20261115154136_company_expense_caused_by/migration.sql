-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 328: "quem causou a conta" — pessoa opcional da frota (motorista, agregado ou ajudante) ligada à conta.
-- Só aditivo: uma coluna nula, o índice parcial e a FK composta com a ficha da frota da mesma empresa.
ALTER TABLE "company_expenses" ADD COLUMN "caused_by_driver_id" uuid;--> statement-breakpoint
CREATE INDEX "company_expenses_caused_by_driver_idx" ON "company_expenses" ("company_id","caused_by_driver_id") WHERE "caused_by_driver_id" is not null;--> statement-breakpoint
ALTER TABLE "company_expenses" ADD CONSTRAINT "company_expenses_caused_by_driver_fk" FOREIGN KEY ("company_id","caused_by_driver_id") REFERENCES "fleet_drivers"("company_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;