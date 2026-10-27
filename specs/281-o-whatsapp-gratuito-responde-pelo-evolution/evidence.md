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

## T5 — Boleto por WhatsApp ao cliente, no trilho da 248/279 (27/10/2026)

Fatia mínima: só boleto, API (painel e app), staging. Sobre a T4 (configuração do Evolution) e a T3b (contatos).

**O que mudou**

- Migration `20261027190000_contractor_reply_whatsapp_delivery` (aditiva, com rollback que recusa se houver entrega por
  WhatsApp): alvo `client_boleto_whatsapp`, motivos `whatsapp_number_not_found`, `whatsapp_disconnected` e
  `attachment_too_large_for_whatsapp`, `address` em E.164 nesse alvo, coluna `provider_message_id` (único parcial por
  empresa, só nesse alvo). Corrige o snapshot da T4 para seguir o da T3b (a cadeia bifurcava depois do merge).
- `forward-contractor-reply-by-whatsapp.use-case.ts`: reserva `queued` com auditoria e o retorno travado; envio pelo
  Evolution fora da transação; fechamento em `sent` (aviso `client_boleto_whatsapp_sent` na conversa do motorista,
  canal `whatsapp`, com o id do provedor, para a T6) ou `failed` com motivo fechado. O texto é o mesmo do e-mail do
  retorno (assunto + corpo da configuração da 248), em texto puro; o modelo `whatsapp` do módulo de notificação fica
  para quando o roteador (T1b) existir.
- Idempotência: a primeira tentativa é por (retorno, anexo, número), sem depender da chave do pedido (clique repetido,
  fila do app e segundo operador caem nela); "Tentar de novo" (`send_failed`, `whatsapp_disconnected`) e "Reenviar"
  (já saiu) abrem tentativa nova com a chave do pedido. Número sem WhatsApp e arquivo grande não reenviam: a tela
  oferece o e-mail (rota da 279, sem mudança).
- Tetos: 5 por ocorrência, 6 tentativas por número, `daily_cap` da empresa no dia de Brasília. O intervalo mínimo entre
  envios (`min_interval_seconds`) e o disjuntor ficam com o roteador (T1b).
- Rotas: painel `POST …/contractor-reply/whatsapp-delivery`, `POST …/whatsapp-deliveries/:deliveryId/resend`,
  `GET …/whatsapp-options`; app `GET|POST /me/trips/current/occurrences/:id/client-boleto-whatsapp[/send]`.

**Provas**

- `test/occurrence-conversation/forward-contractor-reply-by-whatsapp.contract.ts`: normalização e máscara do número,
  envio com texto e PDF, replay sem segunda chamada, contato por id e `save`, erros tipados sem reservar (canal
  desligado, Evolution sem configuração ou desligado, teto diário), instância desconectada, os três motivos do
  provedor, arquivo grande, "Tentar de novo" e "Reenviar" idempotentes, número sem WhatsApp sem reenvio, log sem
  número nem texto.
- `test/whatsapp/evolution-document-sender.contract.ts`: corpo do `sendMedia`, chave só no cabeçalho, classificação
  400/401/404/rede/5xx, Evolution desligado sem chamar o provedor.
- `test/integration/occurrence-contractor-reply-client-whatsapp.integration.ts` (Postgres real): entrega com E.164 e id
  do provedor, aviso no chat do motorista, contato guardado, auditoria mascarada, opções mascaradas, teto diário e os
  CHECKs do banco.

**Pendente**

- Pacote `@adatechnology/evolution-whatsapp-provider` no npm (publicação travada pelo `NPM_TOKEN`); sem ele o
  typecheck da CI não fecha (o mesmo bloqueio da T4).
- Teste em staging com um número do dono (critério de aceite) depois da T3 (serviço Evolution) e da T4.
- Linha do tempo da ocorrência (T9) e telas (T7/T8).
