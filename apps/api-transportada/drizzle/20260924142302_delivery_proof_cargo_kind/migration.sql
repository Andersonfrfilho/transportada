-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 182: `cargo` é a foto da mercadoria, e ela soma — a unicidade por entrega e tipo passa a
-- índice parcial, sem `cargo`. Relaxamento puro: nenhuma linha muda. O índice novo é criado sobre
-- dados que já satisfaziam a unicidade total, então não há como falhar por duplicata.
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_company_event_kind_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "trip_delivery_proofs_company_event_kind_unique" ON "trip_delivery_proofs" ("company_id","stop_event_id","kind") WHERE "kind" <> 'cargo';--> statement-breakpoint
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_kind_check", ADD CONSTRAINT "trip_delivery_proofs_kind_check" CHECK ("kind" in ('photo', 'signature', 'cargo'));