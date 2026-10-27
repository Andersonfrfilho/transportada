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

## T6 — Webhook do Evolution: mensagem no fio e estado dos envios (27/10/2026)

**O que mudou**

- SDK (`adatechnology-packages` PR #150, changeset `minor`): o leitor do webhook diz de que chat veio a mensagem (pessoa,
  grupo, status, `@lid` sem número, com o número real do `@lid` quando o Evolution manda), o id da mensagem citada e a
  legenda de mídia; `evolutionWebhookInstance` e `setWebhook` (com cabeçalhos repetidos em toda entrega).
- Migration aditiva `whatsapp_evolution_webhook`: `webhook_id` (uuid opaco, único, alvo da URL), `webhook_secret_envelope`
  (segredo do cabeçalho, AAD próprio), `webhook_registered_at` e `last_webhook_at` em `whatsapp_evolution_settings`.
- `POST /public/whatsapp-evolution/:webhookId`: o Evolution não assina o corpo, então a prova é o segredo por empresa no
  cabeçalho `x-transportada-webhook-token`, comparado em tempo constante. Id desconhecido, envelope que não abre e segredo
  errado dão o mesmo 401; só depois o corpo vira dado, e o `instance` do evento precisa ser o configurado.
- Anti-replay pelo efeito: a mensagem grava uma vez só pelo `unique` do id do provedor no canal `whatsapp`, o status só
  avança (`applyProviderMessageStatus` da 183) e a conexão é o último estado. Reentregar não cria nada novo.
- Mensagem recebida (só chat de pessoa, nunca a própria): a resposta que cita o aviso "Boleto enviado por WhatsApp" entra
  na conversa quando vem do mesmo número que recebeu o boleto (`system_notice.deliveryId` → `address` da entrega da T5);
  motorista e contato com aceite como na Meta; o resto vai para "não atribuídas" (D6: nada é descartado), com teto por
  número.
- O webhook é apontado pela API no primeiro QR da instância ativa e de novo depois que endereço, instância ou chave mudam;
  `POST /company-settings/whatsapp-evolution/webhook` (`settings.manage`) aponta de novo trocando o segredo.

**Provas**

- `test/whatsapp/evolution-webhook-use-case.contract.ts`: recusas baratas sem banco, as três recusas iguais, outra
  instância, empresa desligada, mensagem e citação, própria/grupo/status ignorados, os quatro estados, conexão, corpo
  inválido, registro com troca de segredo (o antigo deixa de abrir), erros tipados, o QR apontando uma vez, e **nenhum
  log com segredo, número, texto, chave ou id do webhook**.
- `test/occurrence-conversation/evolution-inbound.contract.ts`: a política (resposta de quem recebeu, outro número,
  motorista, contato com uma e duas conversas, nada recusado), número inválido, teto por número, falha sem subir.
- `test/whatsapp/evolution-webhook-routes.contract.ts`: rota anônima e opaca, 401 sem corpo, 200 para ignorado, a rota do
  dono com `settings.manage` e `no-store`.
- `test/integration/whatsapp-evolution-webhook.integration.ts` (Postgres): a resposta do cliente entra uma vez só pelas
  duas grafias do nono dígito, outro número vai para não atribuídas, o aviso vai de `sent` a `read` sem voltar, outra
  empresa não acha, e o ciclo do webhook (achar pelo id, guardar segredo, auditoria, conexão, troca de instância
  desmarcando o registro).

## T7 — Telas do painel: provedor padrão e "Enviar por WhatsApp" (27/10/2026)

Fatia mínima: só boleto, painel, staging. A tela de configuração (QR, estado, aviso de risco RF7) já veio com a T4; faltava
o provedor padrão (P3) e o botão de envio, que usam as rotas da T5.

**O que mudou**

- Configuração (aba WhatsApp): seletor "Provedor padrão dos envios novos" (Meta ou Evolution). O Evolution só pode ser o
  padrão com o canal ligado, e o aviso de risco lido; desligar o canal ou o aviso volta o padrão para a Meta. Antes, a
  tela só repassava o valor gravado.
- `ClientBoletoWhatsAppAction`: botão "Enviar por WhatsApp" ao lado de "Enviar ao cliente" (página da ocorrência e
  linha da lista). Só aparece com o tipo em `whatsapp` ou `both`; com o Evolution não configurado, desligado ou
  desconectado, e com o teto da ocorrência atingido, fica à vista, desligado e com o motivo (RF5). Diálogo com os números
  guardados (mascarados), "Outro número" com "Guardar no cadastro do cliente" (`save`) e resultado por número; número sem
  WhatsApp, arquivo grande e instância caída apontam para o e-mail.
- `ClientWhatsAppSendState`: estado por número (Enviado, Na fila, Falhou com o motivo), "Tentar de novo" só onde a
  segunda tentativa pode dar certo e "Reenviar" no que já saiu; cada toque leva chave de idempotência nova. Aparece na
  página da ocorrência e em "Ver detalhes".
- Cliente HTTP: `readContractorReplyWhatsAppOptions`, `forwardContractorReplyToClientWhatsApp` e
  `resendContractorReplyWhatsAppDelivery`, com leitura tolerante (resposta malformada vira `null`, nunca botão) e
  textos pt-BR e en.

**Provas**

- `test/occurrence-conversation/contractor-reply-whatsapp.contract.ts`: vocabulário e todo código de erro da API com
  texto, leitura tolerante das opções e do resultado, regra do número, botão por canal e por estado do Evolution, estado
  por número e o cliente HTTP (chave no cabeçalho, número só no corpo, "Tentar de novo" sem corpo).
- `test/company-settings/whatsapp-evolution-panel.contract.ts`: o provedor padrão sai do rascunho, e o Evolution sem o
  canal ligado não forma configuração.
- Prints: `previews/whatsapp-painel-t7/`.

**Pendente**

- Teste em staging com um número do dono (critério de aceite), depois de T3 e do pacote no npm (bloqueio do `NPM_TOKEN`).
- Contatos do cliente na ocorrência no app do motorista (T8) e linha do tempo (T9).

## T9 — Linha do tempo, docs e runbook de staging (27/10/2026)

Fatia mínima: só a linha do tempo, a documentação e o runbook; sem tela nova (T7/T8).

**O que mudou**

- Linha do tempo da ocorrência (API): `contractor.client.whatsapp`, uma entrada por tentativa do alvo
  `client_boleto_whatsapp`, na ordem do retorno. Status e motivo só: sem número, texto nem anexo. `sent` é marco; não
  muda etapa. Consulta em `trip-occurrence-timeline.query.ts` (`listClientWhatsappSources`).
- Painel: tipo lido e validado, títulos "Boleto enviado por WhatsApp", "Falhou o envio do boleto por WhatsApp" e
  "Envio do boleto por WhatsApp aguardando" (pt-BR e en), motivos do cliente (`whatsapp_number_not_found`,
  `whatsapp_disconnected`, `attachment_too_large_for_whatsapp`) com frase na linha de detalhe.
- Docs: `apps/api-transportada/CLAUDE.md` (bullet da linha do tempo), `apps/frontend-transportada/CLAUDE.md` (seção nova).
- Runbook de staging: `docs/runbooks/evolution-staging.md`. Descreve o estado atual: o serviço de staging ainda é a T3.

**Provas**

- `test/trip-occurrence/timeline-automatic.contract.ts` (API): ordem e ids, só `sent` é marco, a etapa não muda, e a
  forma do evento tem só `actor, id, isKey, kind, occurredAt, reason, sincePreviousSeconds, status`. Sem número, texto nem
  anexo por construção.
- `test/trip/occurrence-timeline-automatic.contract.ts` (painel): títulos, detalhe só na falha com motivo conhecido, e as
  chaves nos dois locales.
- `bun test` das duas suítes (818 e 10 testes) passando; `tsc --noEmit` da API e do painel sem erro; prettier nos arquivos
  alterados.

**Pendente**

- Teste de aceite em staging (boleto a um número do dono, resposta no fio, queda caindo no e-mail): depende da T3.
- A linha do tempo mostra o envio ao cliente quando houver tentativa gravada; a tela de envio (T7/T8) ainda não existe.
