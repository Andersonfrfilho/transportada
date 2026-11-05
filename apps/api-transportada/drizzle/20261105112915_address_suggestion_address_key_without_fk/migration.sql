-- Spec 294 T3.1 (ADR-0113): a sugestão de endereço vale também para endereço sem linha em geocoded_addresses. Aditiva: só remove uma FK.
ALTER TABLE "address_correction_suggestions" DROP CONSTRAINT "address_correction_suggestions_address_key_fk";
