# Feature 143 — A contratante responde por e-mail

> Decisão de arquitetura: **ADR-0063** (revoga uma linha da ADR-0048).

## Problema e resultado

A contratante não entra no portal nem no link do lote: o registro de atividade dela é a **caixa de
e-mail**. Hoje o "e-mail ao embarcador" da spec 079 é texto que o operador copia e envia da própria
caixa. A resposta volta para essa caixa pessoal, e a taxa é aprovada porque "fulano disse".

**Resultado:** o sistema envia o e-mail da ocorrência e o da taxa. A resposta volta para uma conversa
dentro do app, o operador responde de lá, e uma resposta `APROVADO` ou `RECUSADO` de quem pode decidir
decide a taxa. Na mesma hora a decisão avisa o motorista e o despachante e aparece no painel de
status e no histórico.

## Fora do escopo

- Decidir qualquer coisa que não seja `delivery_charges` (ocorrência sem taxa só conversa).
- Push nativo para o motorista: o aviso é pela inbox, porque o PWA não tem service worker de push.
- Interpretar texto livre, inclusive com IA.
- Reescrever o lote anônimo da 0048 ou o portal da 0050. Os dois continuam valendo.
- Ocorrência de parada **sem nota**: sem nota não há contratante, e ela não gera e-mail.

## Histórias priorizadas

### P0 — O administrador configura o e-mail por uma página

**Given** um administrador com `settings.manage`, **When** ele abre "E-mail com contratantes" e
informa o token do servidor do Postmark, o remetente e o subdomínio de resposta, **Then** a página
confere o token e mostra uma lista de verificação:

- o token é válido;
- o MX do subdomínio aponta para `inbound.postmarkapp.com`;
- o webhook está aplicado no Postmark;
- o e-mail de teste foi entregue;
- a resposta ao teste chegou;
- a resposta veio com DKIM alinhado.

Cada item pendente mostra o que fazer, com o valor a copiar.

**And** o botão "Aplicar no Postmark" gera a senha do webhook e grava `InboundDomain` e
`InboundHookUrl` no servidor dele, sem que ninguém veja a senha. **And** o botão "Enviar e-mail de
teste" manda uma mensagem ao próprio administrador, e a resposta dele fecha os dois últimos itens.

### P1 — O operador envia a ocorrência e recebe a resposta na conversa

**Given** uma ocorrência de nota cuja contratante tem contatos cadastrados, **When** o operador
clica em "Enviar à contratante", **Then** o e-mail sai pelo sistema com um `Reply-To` único. **And**
quando a contratante responde, a mensagem (sem o texto citado) aparece na conversa da ocorrência.
**And** a resposta do operador escrita no app chega à contratante na mesma conversa da caixa dela.

### P2 — A resposta decide a taxa

**Given** uma taxa `recorded` com valor, **When** o operador escolhe "Enviar para aprovação por
e-mail", **Then** a taxa vai para `submitted` e o e-mail com valor e motivo sai. **And** quando um
contato com permissão de decidir responde `APROVADO` (ou `RECUSADO: motivo`) na primeira linha, com
o domínio autenticado, a taxa vai para `approved` (ou `rejected`). A decisão fica em
`delivery_charge_events` apontando para a mensagem.

### P3 — A decisão se espalha

**Given** uma taxa decidida por e-mail, **Then** o motorista da viagem e o despachante recebem aviso
na inbox, o feed de ocorrências da viagem mostra a decisão, e a conversa mostra a mensagem marcada
como "decidiu".

### P4 — Envio automático por tipo de ocorrência

**Given** um tipo de ocorrência com "Enviar à contratante automaticamente" ligado, **When** a
ocorrência é registrada, **Then** o e-mail sai sem clique, pela mesma porta do P1.

## Requisitos funcionais

- **RF1** A contratante tem uma lista de contatos (`email`, `receives_occurrences`, `can_decide`,
  `status`). A migration copia o `report_email` que não estiver vazio para a lista, com
  `receives_occurrences = true` e `can_decide = false`.
- **RF2** Toda conversa tem um token opaco de 128 bits, em base32 minúsculo (o local-part do e-mail
  não distingue caixa na prática). O banco guarda só o **hash**, e o token viaja só no `Reply-To`.
- **RF3** A contratante é a do **emitente** da nota, pelo mesmo `findChargeParties` que a taxa já
  usa. Um segundo critério faria a conversa e a taxa apontarem para contratantes diferentes.
- **RF4** O e-mail recebido é gravado bruto no bucket privado, com `sha256`, antes de qualquer
  interpretação. A interpretação roda no worker.
- **RF5** A política de interpretação devolve exatamente um de: `approve`, `reject` (com motivo),
  `message`, `late` (taxa já decidida), `ignored_auto_reply`. Os motivos de rebaixamento são tipados:
  `keyword_absent`, `sender_not_listed`, `sender_cannot_decide`, `authentication_failed`,
  `authentication_unknown`, `charge_not_submitted`.
- **RF6** A decisão por e-mail usa a mesma transição de `delivery-charge-state.policy.ts`.
  `delivery_charge_events` ganha `decided_by_message_id`, e o CHECK passa a exigir exatamente um
  entre ator, token de lote e mensagem.
- **RF7** A resposta do operador sai com `In-Reply-To` e `References` da última mensagem recebida
  e com o mesmo `Reply-To`.
- **RF8** Resposta automática (`Auto-Submitted` diferente de `no`, `X-Autoreply`, `Precedence:
bulk|auto_reply|junk`) vira `ignored_auto_reply`. Ela nunca decide, e o sistema nunca responde a
  ela (isso evita laço entre duas respostas automáticas).
- **RF9** A decisão avisa pela inbox (`notification.v1`) o motorista da viagem (`trip_drivers` →
  membership) e o despachante (último `trip_dispatch_snapshots`), com `dedupeKey` derivada da
  mensagem.
- **RF10** A configuração é por empresa (`contractor_mail_settings`: token selado, remetente, nome
  do remetente, subdomínio de resposta, id opaco do webhook e hash da senha do webhook). O token
  **nunca** volta na resposta, só `serverTokenConfigured`, e toda resposta leva
  `cache-control: no-store`.
- **RF11** "Aplicar no Postmark" gera uma senha nova de 256 bits, guarda **só o hash** e grava pelo
  `PUT /server` do Postmark o `InboundHookUrl` (`https://<id>:<senha>@<api>/public/inbound-emails/<id>`)
  e o `InboundDomain`. Aplicar de novo gira a senha, e a anterior deixa de abrir.
- **RF12** A verificação (`GET …/checks`) consulta o `GET /server` do Postmark e o MX do subdomínio
  (resolução de DNS feita pela API), e lê do banco o último teste enviado e recebido. Cada item volta
  como `ok`, `pending` ou `failed`, com um motivo tipado, e nenhuma falha de rede derruba a página.
- **RF13** O e-mail de teste abre uma conversa `setup_test`, que nunca decide nada. A resposta a ele
  registra se trouxe `DKIM_VALID_AU`, e é esse registro que diz ao administrador se a decisão por
  e-mail vai funcionar com o provedor de e-mail dele.

## Requisitos não funcionais

- O webhook responde em menos de 1 s: só grava o bruto e o outbox, e o worker faz o resto.
- Nenhum log leva endereço de e-mail, assunto ou corpo, só `threadId`, `messageId` e o resultado.
- O envio usa a API HTTP do Postmark via `fetch`, sem dependência nova e sem SMTP.

## Casos extremos e falhas

- **Dois contatos respondem coisas diferentes:** vence o primeiro que o worker processar. O segundo
  vira `late`, e o operador é avisado da divergência.
- **Encaminhamento com "responder a todos" de alguém fora da lista:** a resposta vira
  `sender_not_listed`, registrada e sem efeito.
- **Token desconhecido ou de conversa encerrada:** o webhook responde 200 e descarta sem gravar o
  corpo (não há a quem atribuí-lo). Fica só um contador.
- **Postmark reenvia o mesmo e-mail:** a idempotência é o `Message-ID` recebido, único por empresa.
- **E-mail com anexos grandes:** ver `plan.md`, sobre o limite de corpo da rota.
- **A resposta chega sem `X-Spam-Tests`, ou sem `DKIM_VALID_AU`:** vira
  `authentication_unknown` ou `authentication_failed` e não decide. O P1 continua valendo.
- **A empresa não configurou o e-mail:** os botões de envio não aparecem, e o webhook responde 401
  para o id dela. O restante do produto não muda.
- **O token do Postmark foi revogado:** o envio falha como `provider_unauthorized`, a mensagem fica
  `failed` na conversa, e a verificação da página acusa o token.
- **A taxa volta a `recorded`:** hoje não existe essa transição, então o caso não acontece.

## Critérios de aceite

- A política de interpretação tem teste para cada saída do RF5 e para cada motivo de rebaixamento.
- Um teste de integração leva um payload do Postmark do webhook até a taxa `approved`, a linha em
  `delivery_charge_events` com `decided_by_message_id` e dois avisos na inbox.
- Contrato de tenant: a conversa, as mensagens e os contatos são filtrados por `companyId`, e um
  token de outra empresa não acha nada.
- Contrato por texto de fonte: nenhuma chamada de log em `inbound-email/**` recebe `from`, `subject`
  ou `body`.
- O webhook responde 401 para um id sem configuração, ou para uma senha errada (fail-closed por
  empresa), com teste.
- A página é o único caminho de configuração: nenhuma variável de ambiente nova de Postmark.

## Dúvidas

Nenhuma bloqueante. A T001 foi respondida pela documentação do Postmark em 2026-09-13 (ver
`plan.md`, "O que a documentação do Postmark responde"). Um ponto só se confirma com e-mail real, e
a própria página faz essa confirmação (RF13):

- A marca `DKIM_VALID_AU` aparece nas respostas vindas do Gmail e do Outlook das contratantes. Se
  não aparecer, o P2 não decide nada para aquele provedor, e a página diz isso.
