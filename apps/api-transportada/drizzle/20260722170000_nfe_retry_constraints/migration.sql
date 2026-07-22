-- Copyright (c) 2026 Ada Technology. MIT License.
ALTER TABLE "nfe_import_items"
  DROP CONSTRAINT "nfe_import_items_company_id_import_id_ordinal_unique";
ALTER TABLE "nfe_import_items"
  DROP CONSTRAINT "nfe_import_items_company_id_import_id_source_replay_unique";
ALTER TABLE "nfe_import_items"
  ADD CONSTRAINT "nfe_import_items_company_id_import_id_ordinal_attempt_unique"
  UNIQUE("company_id", "import_id", "ordinal", "attempt");
ALTER TABLE "nfe_import_items"
  ADD CONSTRAINT "nfe_import_items_company_id_import_id_source_attempt_unique"
  UNIQUE("company_id", "import_id", "source_sha256", "source_entry", "attempt");
