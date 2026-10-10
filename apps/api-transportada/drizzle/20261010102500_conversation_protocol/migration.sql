-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 263 D8 (ADR-0101 decisão 5): toda conversa tem um protocolo legível `AAMMDD-XXXX`, gerado pelo
-- BANCO — o portal da contratante, o e-mail, o WhatsApp e o motorista inserem sem mudar uma linha de código.
-- Aditiva. Ordem: coluna → funções → backfill → CHECK → único → triggers por último.
-- 1. `protocol` nasce `''` (sentinela): o CHECK de formato recusa `''` e o trigger sempre o substitui; o
--    padrão só existe para o INSERT antigo, que não cita a coluna, continuar válido.
-- 2. O prefixo é a data de `created_at` em America/Sao_Paulo; o sufixo, 4 símbolos de um alfabeto sem
--    I, L, O, 0 e 1. O trigger sorteia até 6 vezes (o sorteio inicial e 5 repetições) enquanto a empresa já
--    tem o valor; se o último também colidir, o único recusa (23505). A corrida entre transações é residual.
-- 3. O backfill dá a cada conversa existente o prefixo da sua `created_at`. Um índice comum e temporário
--    mantém a checagem de existência barata e sai antes das constraints definitivas.
-- 4. O protocolo é imutável por trigger de UPDATE; o `ON CONFLICT DO UPDATE` do retarget só mexe em
--    `driver_user_id` e não o dispara.
ALTER TABLE "occurrence_conversations" ADD COLUMN "protocol" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE FUNCTION "conversation_protocol_suffix"()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	protocol_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
	suffix text := '';
BEGIN
	FOR symbol_index IN 1..4 LOOP
		suffix := suffix || substr(protocol_alphabet, 1 + floor(random() * 31)::int, 1);
	END LOOP;
	RETURN suffix;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "assign_occurrence_conversation_protocol"()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
	protocol_prefix text;
	attempt integer;
BEGIN
	IF NEW.protocol <> '' THEN
		RETURN NEW;
	END IF;
	protocol_prefix := to_char(NEW.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD');
	FOR attempt IN 1..6 LOOP
		NEW.protocol := protocol_prefix || '-' || conversation_protocol_suffix();
		EXIT WHEN attempt = 6 OR NOT EXISTS (
			SELECT 1 FROM "occurrence_conversations"
			WHERE "company_id" = NEW.company_id AND "protocol" = NEW.protocol
		);
	END LOOP;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "reject_occurrence_conversation_protocol_change"()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
	IF NEW.protocol IS DISTINCT FROM OLD.protocol THEN
		RAISE EXCEPTION 'occurrence_conversations.protocol is immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE INDEX "occurrence_conversations_protocol_backfill_idx" ON "occurrence_conversations" ("company_id","protocol");--> statement-breakpoint
DO $$
DECLARE
	conversation record;
	candidate text;
	attempt integer;
BEGIN
	FOR conversation IN
		SELECT "id", "company_id", "created_at" FROM "occurrence_conversations" ORDER BY "created_at", "id"
	LOOP
		FOR attempt IN 1..50 LOOP
			candidate := to_char(conversation.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYMMDD')
				|| '-' || conversation_protocol_suffix();
			EXIT WHEN NOT EXISTS (
				SELECT 1 FROM "occurrence_conversations"
				WHERE "company_id" = conversation.company_id AND "protocol" = candidate
			);
		END LOOP;
		UPDATE "occurrence_conversations" SET "protocol" = candidate WHERE "id" = conversation.id;
	END LOOP;
END
$$;--> statement-breakpoint
DROP INDEX "occurrence_conversations_protocol_backfill_idx";--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_protocol_check" CHECK ("protocol" ~ '^[0-9]{6}-[2-9A-HJKMNP-Z]{4}$');--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_company_protocol_unique" UNIQUE("company_id","protocol");--> statement-breakpoint
CREATE TRIGGER "occurrence_conversations_assign_protocol_trigger"
BEFORE INSERT ON "occurrence_conversations"
FOR EACH ROW
EXECUTE FUNCTION "assign_occurrence_conversation_protocol"();--> statement-breakpoint
CREATE TRIGGER "occurrence_conversations_protocol_immutable_trigger"
BEFORE UPDATE OF "protocol" ON "occurrence_conversations"
FOR EACH ROW
EXECUTE FUNCTION "reject_occurrence_conversation_protocol_change"();
