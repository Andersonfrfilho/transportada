ALTER TABLE "trip_documents"
	ADD COLUMN "destination_origin" text;

ALTER TABLE "trip_documents"
	ADD CONSTRAINT "trip_documents_destination_origin_check"
	CHECK ("destination_origin" IS NULL OR "destination_origin" IN ('delivery', 'recipient'));

COMMENT ON COLUMN "trip_documents"."destination_origin" IS
	'De onde saiu o endereco fisico desta nota: `delivery` do <entrega>, `recipient` do <enderDest> (spec 073 RF4/CA10). Fica no vinculo, nunca na parada: uma parada agrupa varias notas, e a mesma chave pode ser alcancada pela entrega de uma e pelo cadastro de outra. Nulo e nota vinculada antes desta migration, ou nota que nao resolve a destino algum.';
