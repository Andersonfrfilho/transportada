-- ⚠️ Volta o CHECK ao conjunto de quatro tipos. Se já houver linha `address_proof` ou
-- `company_document` gravada, o ALTER falha — de propósito: apagar anexo de candidatura para caber
-- num CHECK antigo seria destruir o documento que o operador ainda precisa conferir. Reclassifique
-- as linhas à mão antes de reverter.
ALTER TABLE "aggregate_application_attachments"
	DROP CONSTRAINT "aggregate_application_attachments_type_check";--> statement-breakpoint
ALTER TABLE "aggregate_application_attachments"
	ADD CONSTRAINT "aggregate_application_attachments_type_check"
	CHECK ("type" in ('ccmei', 'cnh', 'crlv', 'other'));
