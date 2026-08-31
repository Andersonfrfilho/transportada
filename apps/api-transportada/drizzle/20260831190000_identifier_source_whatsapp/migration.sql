-- Copyright (c) 2026 Ada Technology. MIT License.
-- Identificador acrescentado à mão, e a marca de WhatsApp no telefone.
--
-- `source` existe porque a tabela é projeção da ficha: ela é reconstruída a cada gravação do perfil,
-- e sem distinguir o que veio de lá do que alguém digitou, o segundo e-mail de uma pessoa sumiria na
-- próxima edição do cadastro. A reconstrução passa a apagar só o que ela mesma escreveu.
--
-- `is_whatsapp` marca o telefone que recebe mensagem por lá. Hoje é registro; o envio por WhatsApp,
-- SMS ou e-mail escolhe o canal a partir daqui quando existir.
ALTER TABLE "login_identifiers" ADD COLUMN "source" text NOT NULL DEFAULT 'profile';
ALTER TABLE "login_identifiers" ADD COLUMN "is_whatsapp" boolean NOT NULL DEFAULT false;

ALTER TABLE "login_identifiers"
  ADD CONSTRAINT "login_identifiers_source_check" CHECK ("source" in ('profile', 'manual'));

-- Só telefone recebe WhatsApp: a marca num e-mail ou num documento não quer dizer nada.
ALTER TABLE "login_identifiers"
  ADD CONSTRAINT "login_identifiers_whatsapp_kind_check"
  CHECK ("is_whatsapp" = false OR "kind" = 'phone');
