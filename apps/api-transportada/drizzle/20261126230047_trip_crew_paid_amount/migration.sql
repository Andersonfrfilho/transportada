-- Valor pago por pessoa na viagem (spec 327). Aditiva: coluna anulável, sem backfill — nula é "não informado".
ALTER TABLE "trip_drivers" ADD COLUMN "paid_amount" numeric(19,4);--> statement-breakpoint
ALTER TABLE "trip_drivers" ADD CONSTRAINT "trip_drivers_paid_amount_check" CHECK ("paid_amount" is null or "paid_amount" >= 0);