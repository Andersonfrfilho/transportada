-- Spec 283 T2 (D1-D3, RF1, RF2, RF5): o cliente da entrega vira o terceiro participante da conversa da ocorrencia.
-- Aditiva: colunas nulas, CHECKs que so aceitam mais e um gatilho novo; nenhuma linha existente muda.
ALTER TABLE "occurrence_conversation_messages" ADD COLUMN "client_delivery_id" uuid;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD COLUMN "recipient_address" text;--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD COLUMN "client_tax_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_conversation_messages_client_delivery_unique" ON "occurrence_conversation_messages" ("company_id","client_delivery_id") WHERE "client_delivery_id" is not null;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_client_delivery_check" CHECK (("client_delivery_id" is null or ("direction" = 'outbound' and "recipient_address" is not null and "channel" in ('email', 'whatsapp')))
        and ("recipient_address" is null or "direction" = 'outbound'));--> statement-breakpoint
ALTER TABLE "occurrence_conversations" ADD CONSTRAINT "occurrence_conversations_client_tax_id_check" CHECK ("client_tax_id" is null or "client_tax_id" ~ '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_check", ADD CONSTRAINT "occurrence_conversations_participant_check" CHECK ("participant" in ('contractor', 'driver', 'client'));--> statement-breakpoint
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_participant_shape_check", ADD CONSTRAINT "occurrence_conversations_participant_shape_check" CHECK (("participant" = 'contractor' and "contractor_id" is not null and "public_ref" is not null and "driver_user_id" is null and "client_tax_id" is null)
        or ("participant" = 'driver' and "driver_user_id" is not null and "contractor_id" is null and "public_ref" is null and "client_tax_id" is null)
        or ("participant" = 'client' and "client_tax_id" is not null and "occurrence_kind" = 'document' and "contractor_id" is null and "driver_user_id" is null and "public_ref" is null));--> statement-breakpoint
-- A conversa do cliente nasce no primeiro envio (D3) e ganha uma mensagem por entrega (RF2), em qualquer caminho que
-- grava a entrega (painel, app do motorista, automatico da API ou do worker, reserva por e-mail). O estado acompanha a
-- entrega so para a frente: queued -> sent | failed. delivered/read vem do provedor (applyProviderMessageStatus).
-- Falha aqui nunca derruba o envio: o bloco com EXCEPTION e um savepoint, e o aviso leva so o SQLSTATE.
CREATE FUNCTION "sync_occurrence_client_conversation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_channel text;
  v_occurrence_id uuid;
  v_tax_id text;
  v_conversation_id uuid;
  v_now text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NEW."target" NOT IN ('client_boleto_emails', 'client_boleto_whatsapp') OR NEW."address" IS NULL THEN
    RETURN NULL;
  END IF;
  v_status := CASE NEW."status" WHEN 'queued' THEN 'queued' WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'failed' END;
  IF v_status IS NULL THEN
    RETURN NULL;
  END IF;
  v_channel := CASE NEW."target" WHEN 'client_boleto_whatsapp' THEN 'whatsapp' ELSE 'email' END;

  BEGIN
    IF TG_OP = 'UPDATE' THEN
      UPDATE "occurrence_conversation_messages" m
         SET "status" = v_status,
             "status_times" = m."status_times" || jsonb_build_object(v_status, v_now)
       WHERE m."company_id" = NEW."company_id"
         AND m."client_delivery_id" = NEW."id"
         AND ((v_status = 'sent' AND m."status" = 'queued')
           OR (v_status = 'failed' AND m."status" IN ('queued', 'sent')));
      IF EXISTS (
        SELECT 1 FROM "occurrence_conversation_messages" m
         WHERE m."company_id" = NEW."company_id" AND m."client_delivery_id" = NEW."id"
      ) THEN
        RETURN NULL;
      END IF;
    END IF;

    SELECT r."occurrence_id" INTO v_occurrence_id
      FROM "occurrence_contractor_replies" r
     WHERE r."company_id" = NEW."company_id" AND r."id" = NEW."reply_id";

    SELECT dc."tax_id" INTO v_tax_id
      FROM "trip_document_occurrences" o
      JOIN "trip_documents" td ON td."company_id" = o."company_id" AND td."id" = o."trip_document_id"
      JOIN "nfe_participants" p
        ON p."company_id" = td."company_id" AND p."document_id" = td."nfe_document_id" AND p."role" = 'recipient'
      JOIN "delivery_clients" dc ON dc."company_id" = p."company_id" AND dc."tax_id" = p."tax_id"
     WHERE o."company_id" = NEW."company_id" AND o."id" = v_occurrence_id
     LIMIT 1;
    -- Sem cliente cadastrado nao ha contato: o envio segue, a conversa nao nasce.
    IF v_occurrence_id IS NULL OR v_tax_id IS NULL THEN
      RETURN NULL;
    END IF;

    INSERT INTO "occurrence_conversations"
      ("company_id", "subject_type", "occurrence_kind", "occurrence_id", "participant", "client_tax_id")
    VALUES (NEW."company_id", 'occurrence', 'document', v_occurrence_id, 'client', v_tax_id)
    ON CONFLICT ("company_id", "occurrence_kind", "occurrence_id", "participant") DO NOTHING;

    SELECT c."id" INTO v_conversation_id
      FROM "occurrence_conversations" c
     WHERE c."company_id" = NEW."company_id" AND c."occurrence_kind" = 'document'
       AND c."occurrence_id" = v_occurrence_id AND c."participant" = 'client';

    INSERT INTO "occurrence_conversation_messages"
      ("company_id", "conversation_id", "channel", "direction", "automatic", "author_user_id", "body_text",
       "status", "status_times", "client_delivery_id", "recipient_address")
    VALUES (
      NEW."company_id", v_conversation_id, v_channel, 'outbound', NEW."actor_user_id" IS NULL, NEW."actor_user_id",
      coalesce((
        SELECT left(mm."body_text", 8000) FROM "contractor_mail_messages" mm
         WHERE mm."company_id" = NEW."company_id" AND mm."id" = NEW."mail_message_id"
      ), ''),
      v_status, jsonb_build_object(v_status, v_now), NEW."id", NEW."address")
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'occurrence_client_conversation_sync_failed sqlstate=%', SQLSTATE;
  END;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "occurrence_client_conversation_sync_trigger"
AFTER INSERT OR UPDATE OF "status" ON "occurrence_contractor_reply_deliveries"
FOR EACH ROW
EXECUTE FUNCTION "sync_occurrence_client_conversation"();
