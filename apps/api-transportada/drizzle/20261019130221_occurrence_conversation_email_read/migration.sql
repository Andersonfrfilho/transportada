-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 274 (D8, D12): o e-mail passa a ter "lida" (pixel de abertura do Resend). Só derruba a CHECK que proibia
-- `email` em `read`; aditiva para os dados (nenhuma linha muda) e sem coluna nova.
ALTER TABLE "occurrence_conversation_messages" DROP CONSTRAINT "occurrence_conversation_messages_email_never_read_check";
