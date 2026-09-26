ALTER TABLE "occurrence_conversation_messages" ADD COLUMN "automatic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_author_check";--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" ADD CONSTRAINT "occurrence_conversation_messages_author_check" CHECK (("direction" = 'outbound' and ("author_user_id" is not null) <> "automatic" and "driver_user_id" is null and "sender_address" is null and "contractor_contact_id" is null)
        or ("direction" = 'inbound' and not "automatic" and num_nonnulls("author_user_id", "driver_user_id", "sender_address") = 1
          and ("author_user_id" is null or "channel" = 'portal')
          and ("sender_address" is null or "channel" in ('email', 'whatsapp')))) NOT VALID;--> statement-breakpoint
ALTER TABLE "occurrence_conversation_messages" VALIDATE CONSTRAINT "occurrence_conversation_messages_author_check";
