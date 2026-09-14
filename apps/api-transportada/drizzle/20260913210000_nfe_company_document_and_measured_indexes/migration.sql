CREATE INDEX "nfe_volumes_company_document_idx" ON "nfe_volumes" ("company_id","document_id");--> statement-breakpoint
CREATE INDEX "nfe_products_company_document_idx" ON "nfe_products" ("company_id","document_id");--> statement-breakpoint
CREATE INDEX "nfe_package_boxes_company_measured_idx" ON "nfe_package_boxes" ("company_id") WHERE "measured_at" is not null;
