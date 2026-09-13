# Feature 143 — A contratante responde por e-mail

> Decisão de arquitetura: **ADR-0063** (revoga uma linha da ADR-0048). Provedor: Resend, nos dois
> sentidos; a Cloudflare segue só como DNS.

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
- Criar o webhook no Resend pela API: a página mostra a URL, e o administrador cria o webhook no
  painel do Resend.
- Trocar o e-mail que o produto já manda pelo `notification-module` (convite, recuperação de
  senha). Ele continua no `SMTP_URL`.

## Histórias priorizadas

### P0 — O administrador configura o e-mail por uma página

**Given** um administrador com `settings.manage`, **When** ele abre "E-mail com contratantes" e
informa a chave de API do Resend, o segredo de assinatura do webhook, o remetente e o subdomínio de
resposta, **Then** a página mostra a URL do webhook para colar no Resend (evento `email.received`)
e uma lista de verificação:

- a chave é aceita pelo Resend;
- o domínio do remetente está verificado no Resend;
- o subdomínio de resposta tem MX publicado;
- o webhook já chamou a API com assinatura válida;
- o e-mail de teste foi entregue;
- a resposta ao teste chegou;
- a resposta veio com DKIM alinhado.

Cada item pendente mostra o que fazer, com o valor a copiar. **And** o botão "Enviar e-mail de
teste" manda uma mensagem ao próprio administrador, e a resposta dele fecha os três últimos itens.

### P1 — O operador envia a ocorrência e recebe a resposta na conversa

**Given** uma ocorrência de nota cuja contratante tem contatos cadastrados, **When** o operador
clica em "Enviar à contratante", **Then** o e-mail sai pelo sistema com um `Reply-To` único. **And**
quando a contratante responde, a mensagem (sem o texto citado) aparece na conversa da ocorrência.
**And** a resposta do operador escrita no app chega à contratante na mesma conversa da caixa dela.

### P2 — A resposta decide a taxa

**Given** uma taxa `recorded` com valor, **When** o operador escolhe "Enviar para aprovação por
e-mail", **Then** a taxa vai para `submitted` e o e-mail com valor e motivo sai. **And** quando um
contato com permissão de decidir responde `APROVADO` (ou `RECUSADO: motivo`) na primeira linha, com
DKIM alinhado, a taxa vai para `approved` (ou `rejected`). A decisão fica em
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
  não distingue caixa na prática). O endereço de resposta é `<token>@<subdomínio de resposta>`, sem
  depender de `+`, porque o Resend recebe em qualquer endereço do domínio. O banco guarda só o
  **hash** do token — e o token em si é **derivado**, nunca sorteado e guardado à parte:
  `token = base32lower(HMAC-SHA256(replyTokenSecret, "transportada:contractor-mail-reply:v1:" +
companyId + ":" + threadId))`, truncado em 128 bits. É determinístico por conversa de propósito —
  ver o RF7, que é quem exige isso. Correção pós-entrega da T009 (2026-09-13): a primeira versão
  gerava o token à toa e o descartava depois de gravar o hash, o que tornava RF7 impossível de
  cumprir numa segunda mensagem da mesma conversa.
- **RF3** A contratante é a do **emitente** da nota, pelo mesmo `findChargeParties` que a taxa já
  usa. Um segundo critério faria a conversa e a taxa apontarem para contratantes diferentes.
- **RF4** O MIME bruto de todo e-mail recebido é baixado da API do Resend e gravado no bucket
  privado, com `sha256`, antes de qualquer interpretação. Tudo isso roda no worker.
- **RF5** A política de interpretação devolve exatamente um de: `approve`, `reject` (com motivo),
  `message`, `late` (taxa já decidida), `ignored_auto_reply`. Os motivos de rebaixamento são tipados:
  `keyword_absent`, `sender_not_listed`, `sender_cannot_decide`, `dkim_not_aligned`,
  `dkim_unverifiable`, `charge_not_submitted`.
- **RF6** A decisão por e-mail usa a mesma transição de `delivery-charge-state.policy.ts`.
  `delivery_charge_events` ganha `decided_by_message_id`, e o CHECK passa a exigir exatamente um
  entre ator, token de lote e mensagem.
- **RF7** A resposta do operador sai com `In-Reply-To` e `References` da última mensagem recebida,
  com o mesmo `Reply-To` e com `Idempotency-Key` igual ao id da nossa mensagem.
- **RF8** Resposta automática (`Auto-Submitted` diferente de `no`, `X-Autoreply`,
  `Precedence: bulk | auto_reply | junk`) vira `ignored_auto_reply`. Ela nunca decide, e o sistema
  nunca responde a ela (isso evita laço entre duas respostas automáticas).
- **RF9** A decisão avisa pela inbox (`notification.v1`) o motorista da viagem (`trip_drivers` →
  membership) e o despachante (último `trip_dispatch_snapshots`), com `dedupeKey` derivada da
  mensagem.
- **RF10** A configuração é por empresa (`contractor_mail_settings`: a chave de API, o segredo do
  webhook e o `replyTokenSecret` (RF2) selados num envelope só — três campos, não dois —, o
  remetente, o nome do remetente, o subdomínio de resposta e o id opaco do webhook). Os segredos
  **nunca** voltam na resposta, só `apiKeyConfigured` e `webhookSecretConfigured`, e toda resposta
  leva `cache-control: no-store`. O `replyTokenSecret` **nunca** é aceito do cliente: nasce no
  servidor, na primeira configuração, e sobrevive a toda atualização depois disso (correção
  pós-entrega da T009).
- **RF11** O webhook é `POST /public/inbound-emails/<webhookId>`. A assinatura Svix é conferida
  sobre o corpo cru (`svix-id.svix-timestamp.corpo`, HMAC-SHA256 com o segredo da empresa), com
  janela de 5 minutos, e o mesmo `svix-id` não é aceito duas vezes.
- **RF12** A verificação (`GET …/checks`) consulta o Resend com a chave (a chave é aceita e o
  domínio do remetente está verificado), o MX do subdomínio de resposta (DNS resolvido pela API) e
  o banco (último webhook recebido, último teste enviado e recebido). Cada item volta como `ok`,
  `pending` ou `failed`, com motivo tipado, e nenhuma falha de rede derruba a página.
- **RF13** O e-mail de teste abre uma conversa `setup_test`, que nunca decide nada. A resposta a ele
  registra o resultado do DKIM, e é esse registro que diz ao administrador se a decisão por e-mail
  vai funcionar com o provedor de e-mail dele.

## Requisitos não funcionais

- O webhook responde em menos de 1 s: confere a assinatura, grava a referência e o outbox, e o
  worker faz o resto.
- Nenhum log leva endereço de e-mail, assunto, corpo ou segredo, só `threadId`, `messageId` e o
  resultado.
- O envio e a leitura usam a API HTTP do Resend via `fetch`. A única dependência nova é a
  `mailauth`, para o DKIM, e a entrada dela depende do spike T004.

## Casos extremos e falhas

- **Dois contatos respondem coisas diferentes:** vence o primeiro que o worker processar. O segundo
  vira `late`, e o operador é avisado da divergência.
- **Encaminhamento com "responder a todos" de alguém fora da lista:** a resposta vira
  `sender_not_listed`, registrada e sem efeito.
- **Token desconhecido ou de conversa encerrada:** o worker descarta sem gravar o corpo (não há a
  quem atribuí-lo). Fica só um contador.
- **O Resend reenvia o mesmo webhook:** a idempotência é o `email_id` do Resend, único por empresa.
- **O DNS da contratante não responde na hora da verificação:** `dkim_unverifiable`, que não decide.
  A verificação não se refaz depois, porque a chave pode ter girado e o resultado de agora é o que
  vale como prova.
- **A empresa não configurou o e-mail:** os botões de envio não aparecem, e o webhook responde 401
  para o id dela. O restante do produto não muda.
- **A chave do Resend foi revogada:** o envio falha como `provider_unauthorized`, a mensagem fica
  `failed` na conversa, e a verificação da página acusa a chave.
- **A taxa volta a `recorded`:** hoje não existe essa transição, então o caso não acontece.

## Critérios de aceite

- A política de interpretação tem teste para cada saída do RF5 e para cada motivo de rebaixamento.
- A verificação de DKIM tem teste com mensagens assinadas por uma chave de teste: alinhada,
  desalinhada, corpo adulterado e sem assinatura.
- Um teste de integração leva um webhook assinado até a taxa `approved`, a linha em
  `delivery_charge_events` com `decided_by_message_id` e dois avisos na inbox.
- Contrato de tenant: configuração, conversas, mensagens e contatos são filtrados por `companyId`,
  e um token de outra empresa não acha nada.
- Contrato por texto de fonte: nenhuma chamada de log em `contractor-mail/**` recebe `from`,
  `subject`, `body` ou segredo.
- O webhook responde 401 para assinatura inválida, timestamp fora da janela e id sem configuração.
- A página é o único caminho de configuração: nenhuma variável de ambiente nova de Resend.

## Dúvidas

Nenhuma bloqueante. Dois pontos se confirmam na execução, com saída definida:

- **A `mailauth` roda no Bun** (T004). Se não rodar, a execução para e pergunta, porque a
  alternativa é verificar DKIM com código nosso, e isso é decisão nova.
- **O caminho da API que devolve o e-mail recebido e o escopo mínimo da chave** (T007). A chave de
  envio pode não bastar para ler recebidos; se for preciso uma de acesso total, a página diz isso ao
  administrador.
