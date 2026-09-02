-- Spec 071: o campo da tela virou "documento da empresa" (CCMEI, contrato social ou cartão CNPJ), e
-- o comprovante de endereço ganhou tipo próprio. `ccmei` continua aceito: linha já gravada não se
-- reescreve, senão o operador perde o rótulo sob o qual aprovou o anexo.
ALTER TABLE "aggregate_application_attachments"
	DROP CONSTRAINT "aggregate_application_attachments_type_check";--> statement-breakpoint
ALTER TABLE "aggregate_application_attachments"
	ADD CONSTRAINT "aggregate_application_attachments_type_check"
	CHECK ("type" in ('address_proof', 'ccmei', 'cnh', 'company_document', 'crlv', 'other'));
