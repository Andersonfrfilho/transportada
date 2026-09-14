-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Staging nunca alcança produção nem terceiros reais. A cópia de produção traz o ambiente fiscal, as
-- credenciais por empresa e os envios pendentes; aqui tudo isso é neutralizado, numa transação só.
-- Idempotente: roda no fim de todo refresh e pode ser aplicado sozinho num staging já copiado.
begin;

-- Ambiente fiscal: é ele que `/auth/me` devolve e que decide a SEFAZ do CT-e, do MDF-e e da
-- distribuição de NF-e. Os perfis de emissão não têm ambiente nem série próprios (a série mora em
-- `fiscal_sequences`, truncada no `strip_emission_data`).
update company_fiscal_profiles
  set environment = 'homologation', updated_at = now()
  where environment <> 'homologation';

-- Certificado A1: o CHECK `digital_certificates_envelope_status_check` só aceita envelope nulo em
-- `retired`. A linha fica porque o perfil fiscal a referencia.
update digital_certificates set status = 'retired', secret_envelope = null where secret_envelope is not null;

-- Credenciais com `secret_envelope not null` e sem FK apontando para elas: a linha sai.
-- Nota RP (e o hash do token de callback), token da Meta por empresa, chave do Resend + segredo do
-- webhook do e-mail com contratantes.
delete from nfse_provider_credentials;
delete from whatsapp_channels;
delete from contractor_mail_settings;

-- Tokens de push dos aparelhos reais. `deliveries.device_id` referencia o aparelho sem cascade.
update notification.deliveries set device_id = null where device_id is not null;
delete from notification.devices;

-- Notificação que ainda sairia, e entrega na fila. `deliveries` cai em cascade com a notificação.
delete from notification.notifications where status in ('pending', 'scheduled');
delete from notification.deliveries where status = 'queued';

-- Outbox pendente é envio pronto para o relay de staging publicar. Marcar publicado não esbarra em
-- FK nem no CHECK de claim, e mantém a trilha. As de CT-e, MDF-e e NFS-e já foram truncadas.
update processing_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;
update invitation_delivery_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;
update password_reset_delivery_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;
update contractor_mail_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;
update contractor_inbound_email_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;
update aggregate_attachment_outbox
  set published_at = now(), claim_owner = null, claim_expires_at = null
  where published_at is null;

-- Pedido de WhatsApp em aberto: o `whatsapp.command.settle` o liquidaria emitindo e faturando.
-- `expired` não exige `confirmed_at` nem `settled_at` nos CHECKs.
update whatsapp_command_requests
  set status = 'expired', updated_at = now()
  where status in ('previewed', 'confirming', 'dispatched');

commit;
