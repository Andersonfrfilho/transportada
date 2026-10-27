# Evidência 281 — O WhatsApp gratuito responde pelo Evolution API

## T3b — Canal no tipo de ocorrência e contatos do cliente (27/10/2026)

Fatia mínima aprovada pelo dono: só boleto, staging, e-mail de reserva. Esta etapa é só o dado; o envio por WhatsApp é a T5.

**O que mudou**

- Migration `20261027180000_delivery_client_contacts` (à mão, com snapshot):
  - `delivery_client_emails` (279 T1) foi **renomeada** para `delivery_client_contacts`, com `channel` (`email` padrão,
    `whatsapp`) e `source_occurrence_id` (referência, sem FK, como `created_by_user_id`). A CHECK do endereço passou a
    depender do canal: e-mail como na 279, WhatsApp em E.164 (`^\+[1-9][0-9]{7,14}$`). Índices e CHECKs renomeados.
  - `company_occurrence_types.client_channel` (`off`, `email`, `whatsapp`, `both`), padrão constante `email`, sem UPDATE.
- A spec (D12) supunha que a 279 ainda não tinha ido à `main`; ela já está em produção. Por isso a troca é em dois passos:
  a migration deixa uma **visão** `delivery_client_emails` (só as linhas `email`, simples e atualizável) para a API e o
  worker antigos lerem e gravarem durante o deploy. O código novo lê a tabela e filtra `channel = 'email'`. A visão sai
  numa migration futura, depois que a 281 chegar à `main`.
- O código da 279 passou à tabela nova sem mudar comportamento: painel de e-mails, envio pelo botão, envio automático
  (SQL idêntico na API e no worker), e o "enviar e guardar" do motorista, que agora grava a ocorrência de origem.
- `clientChannel` no PUT/GET do catálogo de tipos (ausente não mexe; fora da lista é 400) e o seletor "Canal com o
  cliente" na aba Tipos do painel, que aceita a resposta com e sem a chave. `whatsapp` e `both` só passam a ter efeito
  com a T5; até lá o e-mail segue ligado pelo `client_email_type`.

**Provas**

- `test/database-migration/delivery-client-contacts.assertion.ts`: rollback e reapply com linha antiga (vira `email`, tipo
  vira `email`), E.164 aceito e recusado, número no canal `email` recusado, visão grava e-mail sem saber do canal e não
  mostra WhatsApp, `client_channel` fora da lista recusado, rollback recusado com WhatsApp guardado e, sem ele, devolve a
  tabela da 279 com o e-mail intacto. A asserção da 279 T1 tira esta migration antes de provar a sua.
- `test/trip-occurrence/client-contacts-parity.contract.ts`: CHECKs e padrões da migration iguais às constantes da API,
  `CLIENT_CHANNELS` do painel igual ao da API, E.164 com exemplos, e o SQL do envio ao cliente idêntico na API e no
  worker, lendo só `channel = 'email'` da tabela nova.
- `client-email-type-write.contract.ts` (API) e `occurrence-type-client-email-type.contract.ts` (painel): o campo no
  catálogo.
- O teste de integração do worker (`occurrence-contractor-reply-received.integration.ts`) continua gravando pela visão
  `delivery_client_emails`: prova de que o worker antigo atravessa o deploy.
