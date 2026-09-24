# Tasks — 183

`[P]` = pode rodar em paralelo sem editar os mesmos arquivos. Task só fecha com evidência de teste em
`evidence.md` (que nasce com a primeira task verificada). Teste de contrato/aceite **antes** da
implementação. Teste novo entra na lista explícita do `package.json` da app.

Toda task que cria ou muda tela fecha também com uma **revisão rápida** da página tocada contra a
checklist da spec (§ "Revisão total de design e usabilidade"), com captura no `evidence.md`. A
revisão total da T902 não substitui essas revisões; ela acontece no fim, com tudo junto.

## Fase 0 — Destravar

> 🤖 Modelo: `opus` (decisão) · a T002 é do usuário

- [x] **T001** Passar a ADR-0072 e a ADR-0073 para `aceito` e confirmar que a única
      `[NEEDS CLARIFICATION]` que resta (provedor de transcrição) só bloqueia a T706. Evidência: as
      ADRs com status e data.
- [ ] **T002** 🙋 O usuário submete à Meta os modelos de WhatsApp da contratante (abertura de
      ocorrência; aviso de que há decisão pendente no portal — sem botão de decisão, D4) e do
      motorista (aviso de mensagem nova; aviso de troca para o app). **Pare e pergunte** — é conta da empresa na Meta. Evidência: nomes e
      estado dos modelos no `evidence.md`.
- [x] **T003** Anotar no `specs/143-a-contratante-responde-por-e-mail/tasks.md` que T014, T015,
      T016, T018, T024 e T025 seguem pela 183 (sem apagar nada da 143). Evidência: o diff.

## Fase 1 — Conferir o pacote (ADR-0072; o SDK chega pronto)

> 🤖 Modelo: `sonnet` · nada se constrói no pacote a partir daqui

- [x] **T101** Conferência do contrato publicado (`conversations-ui@0.3.1`, `meta-whatsapp-*`) item a
      item, e a decisão do dono do projeto sobre o que falta (SDK genérico; composição e estilo do
      nosso lado). O bump das versões entra na primeira task que usar o pacote (T401). Evidência: a
      tabela da conferência e a decisão no `evidence.md`.

## Fase 2 — O detalhe e a tabela (P1, P2) — não depende da Fase 1

> 🤖 Modelo: `sonnet`

- [x] **T201** Contrato de `GET /trip-occurrences/:id` para os dois tipos, com tenant (404 de outra
      empresa), `fleet.read` (403 sem ela; motorista e agregado sem acesso), a tratativa (`case`) no
      formato da listagem e o bloco do motorista nulo quando não há. Evidência: contrato vermelho.
- [x] **T202** `get-trip-occurrence.use-case.ts` + query + rota até o T201 ficar verde. Evidência:
      contratos + integração com os dois tipos.
- [x] **T203** Bloco `document` na listagem e no detalhe (RF2), valor como string decimal, sem
      N+1. O RF4 (estado da conversa na listagem) vai com a T404, porque depende das tabelas da T401.
      Evidência: integração conferindo o número de consultas e o formato.
- [x] **T204** Rota `/ocorrencias/:id` no frontend (parse/build/navigate), linha clicável e
      `TripOccurrenceDetail.page.tsx` sem a conversa: resumo com autoria, nota, motorista com foto/iniciais e contato (ou "sem motorista"), fotos, e o
      `OccurrenceCasePanel` e o painel do acerto da 164 reaproveitados, com as permissões de lá; e o
      link da linha do tempo da viagem para o detalhe (180 RF15). Evidência: contratos de serviço puro
      da rota, do mapeamento e do link.
- [x] **T205** Colunas Contratante, Endereço de entrega e Valor NF-e na tabela, no menu de colunas e
      na persistência. A coluna Conversa lê o RF4 e vai com a T404. Evidência: a da
      `docs/frontend/data-tables.md` § 6.
- [x] **T206** Linha do tempo (RF19) com os eventos que já existem (registro, fotos, avisos e os da
      tratativa em `trip_occurrence_case_events`), tempos no topo e filtros; os eventos de conversa entram nas Fases 4–6 pela mesma fonte.
      Evidência: contrato da query de eventos (ordem, intervalo) e do mapeamento ator → cor.
- [x] **T207** Item, quantidade e unidade da ocorrência (specs 166/172) no detalhe: saíram da T204
      porque `GET /trip-occurrences/:id` não os devolve — a listagem nunca precisou. Contrato da API
      (campo novo no detalhe, `numeric` como string, empresa do contexto) antes da tela. Evidência:
      integração do detalhe com item e sem item, e contrato do cliente.

## Fase 3 — Contatos com tipos e canais (P3)

> 🤖 Modelo: `sonnet` · T301 é 🧠 (migration) — revisar com `architect` em `opus`

- [x] **T301** 🧠 Migration aditiva de `contractor_contacts` (RF5) com preenchimento e `rollback.sql`.
      Evidência: `make migration-test`.
- [x] **T302** Política tipos → `receives_occurrences`/`can_decide` e contrato das rotas de contato
      com os campos novos e o aceite (autor e data do servidor). Evidência: política + contratos.
- [x] **T303** `ContractorContactsPanel` com nome, setor, telefone, tipos, grupos, canais e canal
      preferido. Evidência: contrato de validação.

## Fase 4 — Conversa com a contratante por e-mail (P4) — absorve 143 T014–T016, T018

> 🤖 Modelo: `sonnet` · T401 é 🧠 (migration)

- [x] **T401** 🧠 Migration das tabelas `occurrence_conversation*` (plan § Dados) com `rollback.sql`.
      Evidência: `make migration-test` + contrato de tenant do schema.
- [x] **T402** Política de status (RF14) por tabela. Evidência: suíte da política.
- [x] **T403** Gateway de e-mail do módulo novo sobre os casos de uso da 143 (a 143 T014/T015 entram
      aqui): enviar, responder, prévia pelo mesmo template. Evidência: teste de caso de uso.
- [x] **T404** Rotas de conversa (listar, enviar, marcar lida, prévia) e o estado da conversa na
      listagem (RF4, vindo da T203) com tenant, permissão e o
      separador, e a coluna Conversa da tabela (vinda da T205), no menu e na persistência.
      Evidência: contratos de rota e o da `docs/frontend/data-tables.md` § 6.
- [x] **T405** Recebida por e-mail vira mensagem da conversa; status do Resend aplicado pela
      política. Evidência: integração no worker.
- [x] **T406** Política de identificação do remetente (RF16), `from_display_name` gravado pelo
      worker, cartão do contato e "Adicionar aos contatos" preenchido. Evidência: suíte da política +
      contrato do payload da conversa (nome e tipos vêm do contato; o endereço como chegou também).
- [ ] **T407** Aba Contratante (canal e-mail) sobre o `conversations-ui` e o diálogo "Enviar à
      contratante" com prévia; os tokens de balão da T704 chegam às peças pelos `classNames`.
      Evidência: contratos de serviço puro + smoke do envio.

## Fase 5 — Conversa com a contratante por WhatsApp (P5)

> 🤖 Modelo: `sonnet` · T502 é 🧠 (segurança do webhook)

- [ ] **T501** Política de atribuição (RF9, com o ramo do motorista). Evidência: suíte por tabela.
- [ ] **T502** 🧠 Webhook: ramo "contato de contratante com aceite" (D6), status da Meta e
      recebidas com mídia. Evidência: contratos (número sem aceite segue recusado) + integração do
      status até `read`, idempotente.
- [ ] **T503** Envio por WhatsApp no worker pelo `SendMessageUseCase` do módulo (RF8): modelo fora da
      janela, texto e mídia dentro. Evidência: teste de caso de uso com o provider falso.
- [ ] **T504** Contrato de que nada que chega pelo WhatsApp (texto, botão, áudio, transcrição) muda a
      tratativa, a taxa ou o acerto (D4). Evidência: o contrato.
- [ ] **T505** Fila de não atribuídas (rota + tela simples). Evidência: contratos.
- [ ] **T506** Canal WhatsApp na aba Contratante e no diálogo (E-mail / WhatsApp / Os dois).
      Evidência: contratos de serviço puro.

## Fase 6 — Conversa com o motorista (P7)

> 🤖 Modelo: `sonnet`

- [ ] **T601** Rotas `/me/trips/current/occurrences/:id/messages` (listar, responder com foto) e o
      aviso na inbox com `dedupeKey`. Evidência: contratos (motorista de outra viagem não alcança).
- [ ] **T602** 🧠 Canal WhatsApp do motorista pelo telefone verificado (ADR-0063), com o desvio dos
      fluxos de comando só por `context.id` (RF9). Evidência: teste de caso de uso + contrato de que
      mensagem sem `context.id` da conversa continua chegando aos fluxos da spec 144.
- [ ] **T603** Aba Motorista no detalhe, com "Anexar à ocorrência" e "Encaminhar à contratante".
      Evidência: contratos de serviço puro.
- [ ] **T604** Tela da conversa no PWA do motorista, com status `delivered`/`read` gravados ao
      baixar/abrir. Evidência: contrato de serviço + smoke.
- [ ] **T605** Expiração da janela (RF20): política por tabela, job agendado idempotente, aviso
      automático, troca do canal padrão (app para o motorista, e-mail para a contratante), aviso na
      caixa de envio e configuração por empresa. Evidência: suíte da política + integração (o aviso
      sai uma vez com o job rodando duas vezes; resposta antes cancela).

## Fase 6b — A contratante conversa pelo portal (P6)

> 🤖 Modelo: `sonnet` · T651 é 🧠 (superfície externa)

- [ ] **T650** Atualizar `apps/frontend-client/CLAUDE.md` com a decisão de crescer a app (ADR-0073,
      aceita na T001). Evidência: o diff.
- [ ] **T651** 🧠 `conversationRef` na resposta de `GET /client/me/occurrences` (164) e as rotas
      `/client/me/occurrence-conversations/:ref` (mensagens, envio, lida, anexo) com
      `resolveContractorScope` e a visibilidade da 164 D5. Evidência: contratos (id interno recusado
      por texto de fonte; outra contratante e ocorrência não visível respondem igual a inexistente;
      nenhum campo do motorista na resposta).
- [ ] **T652** Contrato de que nada que a contratante manda pelo portal muda a tratativa; a decisão
      continua pelo `DecisionForm` e pela rota da 164. Evidência: o contrato.
- [ ] **T653** A conversa na tela "Ocorrências" que o portal já tem (anexo por arquivo, player de áudio, sem
      gravação). Evidência: contratos de serviço puro e de texto de fonte (a app não tem Playwright) + `Permissions-Policy` inalterada.
- [ ] **T654** Canal Portal do lado do operador e o aviso por e-mail sem corpo aos usuários do
      portal. Evidência: contrato do template (sem corpo) + teste de caso de uso.

## Fase 7 — Status, áudio, respostas rápidas e anexos (P8, P9, P10)

> 🤖 Modelo: `haiku` (T701, T704) · `sonnet` (T702, T703)

- [ ] **T701** [P] `company_quick_replies` + rotas `settings.manage` + tela em Configurações.
      Evidência: contratos.
- [ ] **T702** Anexos: upload, conferência de tipo pelo conteúdo, limite por canal, URL temporária;
      extração das recebidas no worker. Evidência: contratos + integração.
- [ ] **T703** Selo de status na UI com os horários, destaque de falha e "Reenviar por outro canal".
      Evidência: contrato de mapeamento status → selo (e-mail nunca mostra "lida").
- [x] **T704** [P] Tokens `--color-bubble-out`, `--color-bubble-contractor`, `--color-bubble-driver`
      (tema escuro e claro). Evidência: contrato de contraste 4,5:1 do texto sobre cada balão, nos
      dois temas. Feita antes da T206, que usa as mesmas cores na linha do tempo (RF19); passar os
      tokens às peças de cada aba foi para a T407, que cria a primeira aba.
- [ ] **T705** Áudio (RF17): player (tocar, posição, velocidade) e gravação no navegador, envio
      pelo WhatsApp e pelo app, recebido pelos dois. Evidência: contratos (formato, duração e tamanho
      máximos) + integração do recebido até o anexo com `sha256`.
- [ ] **T706** 🔒 Transcrição (RF18): porta `speech-to-text.port.ts`, transcrição no worker depois
      de gravar, texto ligado ao anexo, interruptor por empresa. **Bloqueada** até a dúvida do
      provedor virar ADR. Evidência: teste de que transcrição nunca decide + provider falso.

## Fase 8 — PWA e fumaça (P11)

> 🤖 Modelo: `sonnet`

- [ ] **T801** Lista em cartões e detalhe em abas abaixo de 768 px, alvos de toque ≥
      `--touch-target`. Evidência: smoke Playwright em viewport de celular.
- [ ] **T802** Envio automático por tipo de ocorrência (143 T025) pelo canal preferido do contato.
      Evidência: teste de caso de uso.

## Fase 9 — Fechamento

> 🤖 Modelo: `opus` para a revisão; `haiku` para a documentação

- [ ] **T901** Revisão de código com `code-reviewer` e `security-reviewer` em `opus`: N+1 na
      listagem, PII em log, 500 sem stack trace, porta nova do webhook.
- [ ] **T902** 🧠 Revisão total de design e usabilidade (spec § "Revisão total de design e
      usabilidade") de todas as páginas do painel, do PWA e do portal, com as telas rodando.
      Evidência: matriz de capturas, checklist por página e lista de achados com gravidade no
      `evidence.md`.
- [ ] **T903** Corrigir os achados bloqueantes e importantes da T902, um commit por achado, e
      refazer a revisão das páginas tocadas. Evidência: cada achado com o commit que o fecha; nenhum
      bloqueante aberto.
- [ ] **T904** `apps/*/CLAUDE.md`, `docs/ai-context/` e `docs/SECURITY.md` com "A ocorrência tem duas
      conversas".

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/183-a-ocorrencia-tem-duas-conversas/.

ANTES DE COMEÇAR, leia nesta ordem: CLAUDE.md, AGENTS.md, docs/spec/constitution.md, spec.md,
plan.md e tasks.md da 183, docs/adr/0072-a-conversa-multicanal-vem-do-pacote.md,
docs/adr/0073-o-portal-ganha-a-conversa-da-ocorrencia.md, docs/adr/0051-a-conversa-vem-do-pacote-o-tailwind-nao.md,
docs/adr/0050-o-cliente-tem-portal.md, specs/143-a-contratante-responde-por-e-mail/ (spec, plan,
tasks) e os CLAUDE.md de cada app que a task tocar. Protótipo das telas (referência visual):
https://claude.ai/artifact/WnJBKYDc3eRt2QJGxizh7h

ONDE: crie o worktree com `make worktree NAME=spec-183` e trabalhe só nele (branch work/spec-183).
Não publique em staging nem em lugar nenhum sem me perguntar.

ORDEM: uma task por vez, na ordem do tasks.md: Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 6b → 7 → 8 → 9.
Se a Fase 1 parar por falta no pacote, siga pelas Fases 2 e 3 (não dependem dele) e pare antes da 4.

MODELOS: o que cada fase indica no tasks.md. Tasks marcadas 🧠 (T301, T401, T502, T602, T651,
T902) são validadas com architect model=opus antes de fechar. Revisão final (T901) com
code-reviewer + security-reviewer model=opus.

CADA TASK:
1. escreva primeiro o teste de contrato/aceite e mostre-o falhando;
2. implemente o mínimo para ele passar;
3. rode, da app tocada: `bun run typecheck` e `bun run lint` na raiz; na API, OS DOIS comandos,
   `bun --env-file=../../.env.test test --timeout 120000` e
   `bun --env-file=../../.env.test run test:integration` (sem o --env-file a integração PULA, e
   pular não é passar); `make migration-test` quando houver migration; `bun run --cwd apps/<app>
   test` no frontend e no portal;
4. teste novo entra na lista explícita do package.json da app, senão não roda;
5. se a task mexe em tela: revisão rápida da página contra a checklist da spec (§ "Revisão total de
   design e usabilidade") com captura;
6. registre a evidência em evidence.md (comando, saída resumida, capturas quando houver);
7. marque a task [x] e faça um commit isolado com a task no título (ex.: `feat(trips): T202 …`).

REGRAS QUE NÃO SE NEGOCIAM: companyId só do contexto autenticado (no webhook, do canal); teste
negativo entre empresas; dinheiro em numeric/Decimal, serializado como string; nenhum log com
telefone, e-mail, corpo, assunto, nome de arquivo ou segredo; migration só aditiva, com
rollback.sql; nenhuma rota do portal recebe id interno; portal sem câmera/microfone; o motorista
nunca aparece no portal; texto livre e transcrição nunca decidem; UI do painel só com
src/components/ui/ e tokens; a conversa vem do @adatechnology/conversations-ui, sem Tailwind e sem
remontar o grid.

PARE E PERGUNTE ANTES DE:
- marcar as ADR-0072 e ADR-0073 como aceitas (T001, T650);
- a T002 (modelos na conta Meta da empresa — é comigo);
- a T101, se a versão instalada do pacote não tiver algum item da lista;
- a T706 (transcrição): fica bloqueada até existir a ADR do provedor;
- qualquer segredo, variável de ambiente nova, deploy, push para staging, migration destrutiva;
- qualquer [NEEDS CLARIFICATION] novo que surgir, ou divergência entre a spec e o código real
  (registre a divergência e proponha a correção da spec antes de seguir).

NÃO FAÇA: pular ou desligar teste para ficar verde; marcar task sem evidência; implementar mais de
uma task no mesmo commit; alterar a spec 143 além da anotação da T003.

AO FIM DE CADA FASE: me mande um resumo curto (tasks fechadas, o que ficou de fora e por quê,
próximos passos).
```
