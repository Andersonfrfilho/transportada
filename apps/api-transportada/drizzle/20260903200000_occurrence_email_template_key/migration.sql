-- Spec 079 (revisão): o tipo de ocorrência passa a SELECIONAR um template do módulo de
-- notificações pela chave, em vez de carregar o próprio assunto/corpo. Migration aditiva:
-- email_subject/email_body ficam — a linha legada continua funcionando como antes.
ALTER TABLE "company_occurrence_types" ADD COLUMN "email_template_key" varchar(120);
