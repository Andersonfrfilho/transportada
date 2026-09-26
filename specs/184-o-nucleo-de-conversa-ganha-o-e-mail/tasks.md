# Tasks — 184, o núcleo de conversa vira pacote

> Lê-se depois de `spec.md` e `plan.md`. **Uma task por vez, uma task por commit**, teste de
> aceite/contrato **antes** da implementação, e task só fecha com evidência em `evidence.md`.
>
> ⚠️ **Duas paradas obrigatórias** (⛔). Elas não são etapa de trabalho: são pedido ao dono do
> projeto, e a spec espera. Publicar pacote é ADR-0054 e ADR-0065.
>
> 🤖 Modelo por fase conforme `docs/spec/model-economy.md`. Fase 🧠 pede `opus` e a sessão **para
> antes de começar**.

## Fase 1 — `conversation-contracts` (no `adatechnology-packages`)

> 🤖 Modelo: `sonnet`. T101 é 🧠 — é o desenho do vocabulário, e renomear depois quebra host.

- [ ] **T101** 🧠 Teste de contrato do vocabulário: canal, direção, status, resultado de DKIM e tipo
      de anexo, com os nomes que a 183 já usa. **O teste vem antes do tipo.** (RF1, RNF7)
- [ ] **T102** O pacote nasce: `package.json` no molde do `notification-contracts` (ESM+CJS, `dts`,
      `files: ["dist"]`, `sideEffects: false`, dependência única `zod`), `tsup.config.ts`,
      `tsconfig.json`, `CLAUDE.md` com as invariantes. (RF1, RNF5)
- [ ] **T103** Os tipos do T101. Barrel explícito em `src/index.ts`, sem `export *`. (RF1)
- [ ] **T104** Teste de contrato da **tabela de capacidades** (`plan.md` § Fase 1), incluindo as duas
      linhas que a tela usa para não mentir: `email` não confirma leitura, `portal` não grava áudio.
      (RF2, D3, D4)
- [ ] **T105** A tabela de capacidades. (RF2)
- [ ] **T106** Teste da **máquina de status**: só avança, guarda horário por transição, idempotente
      por `(canal, id do provedor)`, e evento fora de ordem não inventa horário. (RF3, D6)
- [ ] **T107** A máquina de status. (RF3)
- [ ] **T108** As portas: `ConversationChannelPort`, `ConversationEmailTransportPort`, `ClockPort`,
      `ObjectStoragePort`, `TranscriberPort` (opcional). Só assinatura. (RF4)
- [ ] **T109** **Contrato do CA01**: varre o `src/` do pacote e falha se aparecer `occurrence`,
      `contractor` ou `driver`. É o que segura a ADR-0075 §2 com o tempo. (CA01)

## Fase 2 — `conversation-module` (no `adatechnology-packages`)

> 🤖 Modelo: `sonnet`. T201 é 🧠 — o schema é o que a migração da fase 5 vai ter de acertar.

- [ ] **T201** 🧠 Teste de schema: conversa com assunto e **sem** assunto pelo mesmo caminho,
      `subject_type`/`subject_id` sem FK, participante genérico `(canal, identificador)`. (RF5, D1,
      P2)
- [ ] **T202** Schema e migrations, a partir do da 183 com os dois cortes do `plan.md` § Fase 2.
      Mantém o CHECK de autoria, o `unique` do status idempotente e o `sha256` do anexo. (RF5)
- [ ] **T203** Teste de que `companyId` **nunca** é aceito do corpo da requisição — o mesmo
      `strictness.test.ts` que o `notification-contracts` tem. (RNF3)
- [ ] **T204** Repositórios atrás de porta. (RF6)
- [ ] **T205** Teste dos casos de uso: abrir, enviar, receber, atualizar status, marcar lido,
      listar. (RF6)
- [ ] **T206** Os casos de uso e a factory `createConversationModule({ config, features, providers })`.
      **Porta ausente desliga o recurso**, nunca flag `hasX` (ADR-0051 §4). (RF6, RNF2)
- [ ] **T207** Teste da **atribuição genérica**: por referência de resposta; sem ela, conversa aberta
      mais recente do identificador; ambígua → fila de não atribuídas. **Nunca palpite.** (RF7, D7,
      CA06)
- [ ] **T208** A atribuição genérica. (RF7)
- [ ] **T209** Teste do anexo: `sha256`, tipo conferido **pelo conteúdo** (extensão mentindo é
      recusada), teto **por canal**, nenhum byte no banco. (RF8)
- [ ] **T210** O anexo. (RF8)
- [ ] **T211** Respostas rápidas por público, com posição e ativo. (RF9)
- [ ] **T212** Teste de integração contra Postgres real: conversa com assunto e sem assunto, status
      idempotente, atribuição ambígua. (CA02, CA05, CA06)

## Fase 3 — o transporte do canal `email` (no `adatechnology-packages`)

> 🤖 Modelo: `sonnet`. T301 é 🧠 — é a fórmula do token, e errar nela perde conversa em andamento.

- [ ] **T301** 🧠 Teste do **token derivado**, fixando byte a byte o token que a 143 gera hoje, com
      o prefixo como parâmetro. Se este teste passar, nenhuma conversa em andamento perde a
      resposta. (RF14, CA07)
- [ ] **T302** O token derivado, com prefixo parametrizado. (RF14)
- [ ] **T303** Teste do threading: `In-Reply-To` e `References` da última mensagem recebida,
      `Idempotency-Key` igual ao id da nossa mensagem. (RF14, CA07)
- [ ] **T304** O threading. (RF14)
- [ ] **T305** Teste do MIME bruto: gravado com `sha256` **antes de qualquer interpretação**. (RF14)
- [ ] **T306** O MIME bruto e a extração de anexo a partir dele. (RF14, RF8)
- [ ] **T307** Teste de DKIM com fixtures **sintéticas** (chave de teste, resolvedor de DNS
      injetado): alinhada, desalinhada, corpo adulterado, sem assinatura, DNS fora do ar. E-mail real
      anonimizado **não serve** — anonimizar quebra a assinatura. (RF14)
- [ ] **T308** O DKIM por `mailauth`, com `unverifiable` que **não se refaz depois**. (RF14)
- [ ] **T309** Teste de que ligar o canal `email` **sem transporte falha na subida**, nomeando a
      peça que falta. (D5, CA03)
- [ ] **T310** A exigência do transporte. (D5)
- [ ] **T311** `changeset` das fases 1–3.

## Fase 4 — ⛔ parada: o usuário publica o núcleo

- [ ] **T401** ⛔ **Pare e peça ao dono do projeto:** merge no `main` do `adatechnology-packages` e
      publicação. Só depois de a versão estar **no registry** é que a fase 5 começa — typecheck
      verde sobre `dist` espelhado **não é prova** (CLAUDE.md de lá). A sessão **não segue sozinha**.

## Fase 5 — o TransportAdA consome

> 🤖 Modelo: `sonnet`.

- [ ] **T501** Instalar a versão publicada e fixá-la nos três apps que usam conversa. (RF11)
- [ ] **T502** Teste de contrato dos adaptadores: quem é a contratante, quem é o motorista, a
      permissão e o `companyId` continuam do produto. (RF12)
- [ ] **T503** Os adaptadores das portas do núcleo. (RF11, RF12)
- [ ] **T504** Teste do **ramo do motorista** na atribuição: mensagem que não responde a nada segue
      para os fluxos de comando da 144, e **não** entra na conversa. (RF13, D7)
- [ ] **T505** O ramo do motorista, sobre a atribuição genérica do núcleo. (RF13)
- [ ] **T506** O transporte de e-mail da 143 passa a implementar `ConversationEmailTransportPort`,
      **sem mudar comportamento**. (RF14, CA07)
- [ ] **T507** Os módulos da 183 passam a chamar o núcleo. (RF11)

## Fase 6 — migração

> 🤖 Modelo: `sonnet`. **A primeira task pode parar a fase.**

- [ ] **T601** ⚠️ **Contar as linhas antes de migrar**, em staging e em produção:
      `occurrence_conversations`, `_messages`, `_attachments`, `_reads`, `_unassigned`. O número vai
      para a `evidence.md`. **Se contrariar a premissa de base vazia, a fase para** e o plano volta
      ao caminho duplo. (D8, CA08)
- [ ] **T602** Migration: cria o schema do núcleo, copia o que houver (idempotente por id), e **só
      então** derruba as tabelas da 183. (RF15, D8)
- [ ] **T603** `make migration-test` — migration e rollback em Postgres descartável. (RF15)
- [ ] **T604** Os testes da 183 verdes depois da troca. **É o arnês desta spec**, e nenhuma task da
      fase 5 ou 6 fecha com ele vermelho. (CA09)

## Fase 7 — `conversations-ui`

> 🤖 Modelo: `sonnet`. T703 é 🧠 — revisão de design com print (web.md §15).

- [ ] **T701** `email` no `CONVERSATION_CHANNEL`, e a tela passa a ler a tabela de capacidades **do
      contrato**, não a dela. Contrato falha se a UI declarar a própria. (RF10)
- [ ] **T702** A tela obedece à capacidade: recurso que o canal não tem fica **desabilitado com dica
      dizendo por quê**; recurso de outro canal **some**. (RF10, D3, CA04)
- [ ] **T703** 🧠 Revisão de design com print, no canal `email` e no `whatsapp`, em 375px e no
      desktop (web.md §15). O selo de lida **não aparece** no e-mail. (D4, CA04)
- [ ] **T704** `changeset` da fase 7.
- [ ] **T705** ⛔ **Pare e peça ao dono do projeto:** segunda publicação, e o bump no TransportAdA.

## Fase 8 — fechamento

> 🤖 Modelo: `opus` para a revisão; `haiku` para a documentação.

- [ ] **T801** 🧠 Revisão de código e de segurança nos dois repositórios, com `code-reviewer` e
      `security-reviewer`. Confere em especial: nenhuma PII em tipo persistido do pacote (RNF4),
      nenhum `process.env` lido pelo pacote (RNF2), nenhum `any` (RNF5).
- [ ] **T802** Confirmar que **nenhuma decisão de negócio mudou de lugar**: a tratativa da 164
      continua onde está. (CA10, ADR-0075 §6)
- [ ] **T803** Documentação: `CLAUDE.md` dos dois repositórios, `docs/ai-context/`, e a ADR-0072
      marcada como **revista em parte** pela ADR-0075.
- [ ] **T804** `evidence.md` fechado, com a contagem da T601 e o que ficou aberto escrito.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/184-o-nucleo-de-conversa-ganha-o-e-mail/ (leia
spec.md, plan.md, tasks.md e a ADR-0075 antes de começar). Uma task por vez, na ordem do tasks.md,
um commit por task, teste antes da implementação.

⛔ PARE nas tasks T401 e T705: são publicação de pacote, e quem publica é o dono do projeto. Não
siga sozinho.
⚠️ PARE na T601 se a contagem contrariar a premissa de base vazia.

Modelos: T101, T201, T301, T703 e T801 são 🧠 → opus, e a sessão para antes de começar cada uma.
O resto → sonnet.
```
