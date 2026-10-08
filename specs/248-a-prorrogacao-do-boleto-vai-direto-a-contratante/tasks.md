# Tasks

> Pré-condições: a **spec 247** em `origin/staging` (editor do e-mail à contratante, RF2 dela,
> `{{numeroNotaSemSerie}}`); 241 e 246 em `origin/staging`. **Não** depende da 183 T002/T503 (sem
> modelo da Meta, decisão do usuário). Decisões do usuário (Q1–Q4, Q6) e por delegação (D1–D14) em
> `spec.md`. Nenhuma task trata tipo por nome.

Uma task por vez, na ordem. Cada uma fecha com typecheck, teste e commit isolado, e registra a
evidência em `evidence.md`. Na API, contrato e integração são dois comandos e nenhum cobre o outro;
a integração exige `--env-file=../../.env.test`; teste novo entra na lista do `package.json` da app.
No worker, `make worker-integration` provisiona o banco descartável.

## Fase 0 — Conferência

> 🤖 Modelo: `haiku`

- [x] **T0.1** Conferir os fatos do `plan.md` § Contexto contra `origin/staging` (arquivo e linha),
      incluindo `SendMessageUseCase.sendMedia`/`assertWithinWindow` no `meta-whatsapp-module`
      instalado e `NfeXmlParty` no pacote fiscal instalado. Divergência vira nota em `evidence.md`.
- [x] **T0.2** Conferir que a 247 está em `origin/staging`; se não estiver, parar.

## Fase 1 — Painel e app tolerantes (etapa 1)

> 🤖 Modelo: `haiku`

- [ ] **T1.1** Painel: validação aceita os campos novos do tipo, as três colunas da exceção e o objeto
      `contractorReply` da ocorrência como opcionais; contrato com e sem as chaves.
- [ ] **T1.2** App do motorista: idem para o estado do retorno na ocorrência.

## Fase 2 — O e-mail do cliente da nota

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** No `adatechnology-packages`: `NfeXmlParty.email?` lido de `<dest><email>` (e do
      emitente, por simetria), com teste do parser sobre XML com e sem a tag; publicar a versão.
- [ ] **T2.2** Worker: gravar `nfe_documents.recipient_email` no import (validado, ≤ 254; inválido
      vira nulo, com contador no log, sem o valor). Integração.
- [ ] **T2.3** Job `nfe.recipient-email.backfill` (molde de `identity.document.backfill`): relê o XML
      original guardado, idempotente, em lotes. **Em produção, só com autorização do usuário.**

## Fase 3 — O dado (etapa 2)

> 🤖 Modelo: `sonnet` (T3.1 é 🧠 — `opus`, validar com `architect` antes)

- [ ] **T3.1** 🧠 Schema e migration: colunas do tipo e CHECKs (`spec.md`), colunas da exceção,
      `nfe_documents.recipient_email`, `occurrence_contractor_replies`,
      `occurrence_contractor_reply_deliveries`, `occurrence_contractor_reply_events`, FKs compostas,
      índice parcial, `tenant-safety.contract.ts`; `rollback.sql`; `make migration-test`.
- [ ] **T3.2** Integração da migration: defaults, cada CHECK do tipo, `handled ⇔ autor e nota`,
      `trigger = operator ⇔ actor_user_id`, unicidade por ocorrência e por `idempotency_key`.
- [ ] **T3.3** Mutações da T3.2 registradas: tirar a CHECK `forward_to_note_recipient = automatic ⇒
modo ≠ off`; default `automatic` em `forward_to_note_recipient`; permitir `actor_user_id` nulo
      com `trigger = operator`.

## Fase 4 — Domínio e trilho

> 🤖 Modelo: `sonnet` (T4.4, T4.7 e T4.9 são 🧠 — `opus`: ação automática sem humano, envio a
> terceiro e retomada pela mensagem do motorista)

- [ ] **T4.1** Contrato **antes**: `contractor-reply.contract.ts` (API **e** worker, mesma tabela):
      0/1/N anexos, tipo pelos bytes, já entregue, cancelado, tratado; `decideAlert` (prazo,
      intervalo, teto, paradas).
- [ ] **T4.2** `decideContractorReply` e `decideAlert` nas duas apps.
- [ ] **T4.3** Mutações da T4.1 registradas: aceitar pelo nome do arquivo; entregar com dois PDFs;
      alertar depois do teto; ler o modo do tipo em vez da cópia do retorno.
- [ ] **T4.4** 🧠 Abertura do retorno na transação do envio automático, com configuração **efetiva**
      copiada; varredor `occurrence.automatic-mail.sweep`. Integração CA01 (registro pelo app **e**
      pelo fluxo de WhatsApp) e **CA04 — só a configuração decide** (mutação: `if` pelo nome).
- [ ] **T4.5** Resposta por e-mail (worker, depois de `recordOccurrenceConversationMailReply`) e pelo
      portal (API, depois do commit da mensagem do portal) aplicam a política; integração CA02 nos
      dois caminhos, resposta duplicada e empresa B (CA09).
- [ ] **T4.6** `deliverContractorReplyToDriver` no `app_chat`, referência ao mesmo `stored_object`,
      aviso no sino que já existe; o expurgo conta as duas referências. Integração.
- [ ] **T4.7** 🧠 Envio a terceiro: `forward-contractor-reply-by-email` (cliente da nota e e-mail
      informado), validação RF11, limite de taxa, 5 por ocorrência, `Idempotency-Key`, mensagem de
      saída **sem thread** no worker, PDF como anexo com teto de 10 MB, máscara no log
      (`maskEmailAddress` promovida a `shared/`). Integração CA07.
- [ ] **T4.8** Mutações da T4.7 registradas: aceitar `a@b.com,c@d.com`; aceitar `\r\nBcc:`; cair para
      outro endereço quando a nota não tem e-mail; enviar duas vezes com a mesma chave.
- [ ] **T4.9** 🧠 WhatsApp: entrega por `SendMessageUseCase.sendMedia` (janela do pacote),
      `fallback_app_chat`/`wait_for_driver`, `WhatsAppWindowExpiredError` tratado; retomada no hook da
      mensagem recebida, sem consumir a mensagem, com trava por linha. Integração CA06 com o pacote
      dublê (duas mensagens seguidas → um envio).
- [ ] **T4.10** Cron `occurrence.contractor-reply.alert` e templates de notificação com chave por
      alerta; ações `resend-request` e `handled`. Integração CA05 (job em dobro, quatro paradas, teto).
- [ ] **T4.11** Contrato de parede + mutação: nenhum log com e-mail, nome de arquivo, CNPJ ou número de
      nota nos arquivos novos (CA08).

## Fase 5 — Telas (etapa 3)

> 🤖 Modelo: `sonnet`

- [ ] **T5.1** Aba Tipos: bloco "Retorno da contratante" (dentro de "E-mail à contratante" da 247),
      com o `Select` da aplicação, os campos e as CHECKs como mensagens no campo; exceção por
      contratante com "Igual ao tipo".
- [ ] **T5.2** Lista de ocorrências: selo do retorno e filtro "Atrasadas".
- [ ] **T5.3** Detalhe da ocorrência: painel do retorno (estado, prazo, alertas, ações "Reenviar o
      pedido", "Marcar como tratado", contatos da contratante), envios ("Enviar ao motorista",
      "Enviar ao cliente da nota" com motivo quando indisponível, "Encaminhar para um e-mail"), linha
      do tempo com os eventos.
- [ ] **T5.4** App do motorista: conversa da ocorrência (lista com não lidas, leitura, resposta com
      anexo, download do PDF por URL assinada, aviso "sem rede"), o aviso do sino abrindo a conversa, e
      "Pedido enviado à contratante" na ocorrência.

## Fase 6 — Roteiro operacional

> 🤖 Modelo: `haiku`

- [ ] **T6.1** Acrescentar ao roteiro da 247 (`docs/operacao/tipos-de-ocorrencia-do-sac.md`) a
      prorrogação com os valores exatos da spec § "Modelo do SAC". Nada de seed nem migration que
      altere tipo de empresa existente.

## Fase 7 — Revisão e fechamento

> 🤖 Modelo: `sonnet`; T7.2 → `code-reviewer` `opus`

- [ ] **T7.1** Revisão de design e usabilidade com print em 375, 768 e 1280: aba Tipos (bloco do
      retorno), lista com selo, detalhe com o painel do retorno, conversa no app do motorista.
      **Comparar o `preview.html` com a tela real, lado a lado**, com os mesmos dados, e registrar em
      `evidence.md` a tabela "elemento → preview → tela real → veredito" (rótulos, ordem, estados
      vazio/erro/desabilitado/indisponível com motivo, selects, contraste, foco, alvos ≥ 44 px, sem
      estouro de largura). Verificação por texto primeiro; print só como prova.
- [ ] **T7.2** Passada independente de funcionalidade, usabilidade e design por `code-reviewer`
      (`opus`): configurar o tipo na tela, registrar pelo app e pelo WhatsApp, responder por e-mail e
      pelo portal com um PDF, ver o boleto no chat do motorista, deixar vencer o prazo e ver o alarme
      repetir, mandar ao cliente da nota e a um e-mail informado. Reprovado com bloqueante/alto →
      corrige e repete.
- [ ] **T7.3** `CLAUDE.md` da raiz, `apps/*/CLAUDE.md` tocados, `docs/ai-context/`, e em
      `docs/SECURITY.md` o risco aceito (D6) e o e-mail de terceiro guardado.
- [ ] **T7.4** Gates: `bun run typecheck`, `make check`, `make migration-test`, `make
worker-integration`, integração da API em primeiro plano com `--env-file`; depois de fetch +
      rebase + `bun install --frozen-lockfile`, `db:generate` = `no_changes`.
- [ ] **T7.5** `evidence.md` consolidado.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/248-a-prorrogacao-do-boleto-vai-direto-a-contratante/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Pré-condição: a spec 247 em origin/staging (editor do e-mail à contratante, {{numeroNotaSemSerie}});
se faltar, pare e avise. Não depende de modelo da Meta.
Regras que não se negociam: TUDO é configuração do tipo — nenhum comportamento por nome de tipo ou
constante; nenhum seed/migration cria ou altera tipo de empresa existente. Decisões do usuário
(Q1–Q4, Q6) e por delegação (D1–D14) em spec.md são fechadas; não reabrir sem o usuário.
O canal principal ao motorista é o chat do próprio produto; WhatsApp só mensagem livre na janela de
24 h, sem modelo. E-mail a terceiro: um endereço por vez, nunca em log, mascarado na tela.
Modelos: Fases 0, 1 e 6 → executor model=haiku · Fases 2, 3, 4, 5 e 7 → executor model=sonnet ·
T3.1, T4.4, T4.7 e T4.9 🧠 → opus, validadas com architect antes de implementar · revisão final
(T7.2) → code-reviewer model=opus.
Escalada: gate falhou 2x → sobe um nível (haiku→sonnet→opus) e registra em evidence.md.
Ordem de publicação (ADR-0081 §9): Fase 1 (painel e app tolerantes) antes de pacote, banco, worker,
API e cron (Fases 2–4), e só então as telas (Fase 5). A migration tem rollback.sql.
Gates de cada task: typecheck + teste + commit isolado, evidência em evidence.md. Na API contrato e
integração são dois comandos; a integração exige --env-file=../../.env.test; teste novo entra na lista
do package.json; no worker, make worker-integration. Tasks de mutação (T3.3, T4.3, T4.8 e as
mutações de T4.4 e T4.11) só fecham com a execução vermelha registrada.
Antes de fechar: T7.1 compara o preview.html com a tela real em 375/768/1280 e registra a tabela de
diferenças; T7.2 passada independente com code-reviewer model=opus; reprovou, corrige e repete.
A publicação do pacote fiscal (T2.1) é no repositório adatechnology-packages, pelo fluxo dele.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer leitura ou escrita em produção
(inclusive o backfill T2.3), qualquer [NEEDS CLARIFICATION].
```
