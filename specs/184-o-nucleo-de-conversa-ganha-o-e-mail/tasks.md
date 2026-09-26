# Tasks — 184, o núcleo de conversa vira pacote

> Lê-se depois de `spec.md` e `plan.md`. **Uma task por vez, uma task por commit**, teste de
> aceite/contrato **antes** da implementação, e task só fecha com evidência em `evidence.md`.
>
> ⚠️ **Duas paradas obrigatórias** (⛔). Elas não são etapa de trabalho: são pedido ao dono do
> projeto, e a spec espera. Publicar pacote é ADR-0054 e ADR-0065.

## O modelo é por task, não por fase

Cada task abaixo traz o modelo **com versão**, para a evidência poder dizer o que de fato rodou —
`opus` sozinho envelhece e não se confere depois. A regra de roteamento é a de
`docs/spec/agent-strategy.md` § "Roteamento econômico": Haiku para mecânico e repetitivo, Sonnet
para implementação, **Opus como gate para fiscal, concorrência, auth, criptografia, arquitetura e
produção**.

| Marca | Modelo        | Alias que se digita | Quando                                                                |
| ----- | ------------- | ------------------- | --------------------------------------------------------------------- |
| 🧠    | **Opus 5.5**  | `opus`              | desenho que vira contrato, criptografia, migração destrutiva, revisão |
| —     | **Sonnet 5**  | `sonnet`            | implementação e teste comuns                                          |
| ⚙️    | **Haiku 4.5** | `haiku`             | mecânico: molde copiado, contagem, changeset, documentação            |

⚠️ **Toda task 🧠 para a sessão antes de começar**, para trocar de modelo de propósito — e a
`evidence.md` registra o modelo que rodou, não o que a tabela pedia. Divergência é achado, não
detalhe.

⚠️ **Nota de rastreabilidade:** outras specs (005, 066, 086, e os dois `OBJETIVO-*.md`) citam um
`model-economy.md` que **não existe no repositório nem no histórico do git**. A tabela real é a do
`agent-strategy.md`, acima. Esta spec não repete a citação quebrada.

## Fase 1 — `conversation-contracts` (no `adatechnology-packages`)

- [ ] **T101** 🧠 `Opus 5.5` — Teste de contrato do vocabulário: canal, direção, status, resultado
      de DKIM e tipo de anexo, com os nomes que a 183 já usa. **O teste vem antes do tipo.** É Opus
      porque estes nomes viram contrato de host: renomear depois quebra quem instalou (RNF7).
      (RF1, RNF7)
- [ ] **T102** ⚙️ `Haiku 4.5` — O pacote nasce: `package.json` no molde do `notification-contracts`
      (ESM+CJS, `dts`, `files: ["dist"]`, `sideEffects: false`, dependência única `zod`),
      `tsup.config.ts`, `tsconfig.json`, `CLAUDE.md` com as invariantes. Molde copiado, sem decisão.
      (RF1, RNF5)
- [ ] **T103** `Sonnet 5` — Os tipos do T101. Barrel explícito em `src/index.ts`, sem `export *`.
      (RF1)
- [ ] **T104** `Sonnet 5` — Teste de contrato da **tabela de capacidades** (`plan.md` § Fase 1),
      incluindo as duas linhas que a tela usa para não mentir: `email` não confirma leitura, `portal`
      não grava áudio. (RF2, D3, D4)
- [ ] **T105** `Sonnet 5` — A tabela de capacidades. (RF2)
- [ ] **T106** `Sonnet 5` — Teste da **máquina de status**: só avança, guarda horário por transição,
      idempotente por `(canal, id do provedor)`, e evento fora de ordem não inventa horário.
      (RF3, D6)
- [ ] **T107** `Sonnet 5` — A máquina de status. (RF3)
- [ ] **T108** `Sonnet 5` — As portas: `ConversationChannelPort`, `ConversationEmailTransportPort`,
      `ClockPort`, `ObjectStoragePort`, `TranscriberPort` (opcional). Só assinatura. (RF4)
- [ ] **T109** ⚙️ `Haiku 4.5` — **Contrato do CA01**: varre o `src/` do pacote e falha se aparecer
      `occurrence`, `contractor` ou `driver`. É o que segura a ADR-0075 §2 com o tempo. (CA01)

## Fase 2 — `conversation-module` (no `adatechnology-packages`)

- [ ] **T201** 🧠 `Opus 5.5` — Teste de schema: conversa com assunto e **sem** assunto pelo mesmo
      caminho, `subject_type`/`subject_id` sem FK, participante genérico `(canal, identificador)`.
      É Opus porque este schema é o alvo que a migração da fase 6 vai ter de acertar. (RF5, D1, P2)
- [ ] **T202** `Sonnet 5` — Schema e migrations, a partir do da 183 com os dois cortes do `plan.md`
      § Fase 2. Mantém o CHECK de autoria, o `unique` do status idempotente e o `sha256` do anexo.
      (RF5)
- [ ] **T203** ⚙️ `Haiku 4.5` — Teste de que `companyId` **nunca** é aceito do corpo da requisição —
      o mesmo `strictness.test.ts` que o `notification-contracts` tem, copiado e adaptado. (RNF3)
- [ ] **T204** `Sonnet 5` — Repositórios atrás de porta. (RF6)
- [ ] **T205** `Sonnet 5` — Teste dos casos de uso: abrir, enviar, receber, atualizar status, marcar
      lido, listar. (RF6)
- [ ] **T206** `Sonnet 5` — Os casos de uso e a factory
      `createConversationModule({ config, features, providers })`. **Porta ausente desliga o
      recurso**, nunca flag `hasX` (ADR-0051 §4). (RF6, RNF2)
- [ ] **T207** `Sonnet 5` — Teste da **atribuição genérica**: por referência de resposta; sem ela,
      conversa aberta mais recente do identificador; ambígua → fila de não atribuídas. **Nunca
      palpite.** (RF7, D7, CA06)
- [ ] **T208** `Sonnet 5` — A atribuição genérica. (RF7)
- [ ] **T209** `Sonnet 5` — Teste do anexo: `sha256`, tipo conferido **pelo conteúdo** (extensão
      mentindo é recusada), teto **por canal**, nenhum byte no banco. (RF8)
- [ ] **T210** `Sonnet 5` — O anexo. (RF8)
- [ ] **T211** ⚙️ `Haiku 4.5` — Respostas rápidas por público, com posição e ativo. CRUD sem regra
      nova. (RF9)
- [ ] **T212** `Sonnet 5` — Teste de integração contra Postgres real: conversa com assunto e sem
      assunto, status idempotente, atribuição ambígua. (CA02, CA05, CA06)

## Fase 3 — o transporte do canal `email` (no `adatechnology-packages`)

> ⚠️ **Fase de criptografia.** O `agent-strategy.md` põe criptografia como gate de Opus, e aqui a
> conta é literal: errar o token perde toda conversa em andamento.

- [ ] **T301** 🧠 `Opus 5.5` — Teste do **token derivado**, fixando byte a byte o token que a 143
      gera hoje, com o prefixo como parâmetro. Se este teste passar, nenhuma conversa em andamento
      perde a resposta. (RF14, CA07)
- [ ] **T302** 🧠 `Opus 5.5` — O token derivado, com prefixo parametrizado. HMAC — gate de Opus.
      (RF14)
- [ ] **T303** `Sonnet 5` — Teste do threading: `In-Reply-To` e `References` da última mensagem
      recebida, `Idempotency-Key` igual ao id da nossa mensagem. (RF14, CA07)
- [ ] **T304** `Sonnet 5` — O threading. (RF14)
- [ ] **T305** `Sonnet 5` — Teste do MIME bruto: gravado com `sha256` **antes de qualquer
      interpretação**. (RF14)
- [ ] **T306** `Sonnet 5` — O MIME bruto e a extração de anexo a partir dele. (RF14, RF8)
- [ ] **T307** 🧠 `Opus 5.5` — Teste de DKIM com fixtures **sintéticas** (chave de teste, resolvedor
      de DNS injetado): alinhada, desalinhada, corpo adulterado, sem assinatura, DNS fora do ar.
      E-mail real anonimizado **não serve** — anonimizar quebra a assinatura. Assinatura
      criptográfica: gate de Opus. (RF14)
- [ ] **T308** 🧠 `Opus 5.5` — O DKIM por `mailauth`, com `unverifiable` que **não se refaz
      depois**. (RF14)
- [ ] **T309** `Sonnet 5` — Teste de que ligar o canal `email` **sem transporte falha na subida**,
      nomeando a peça que falta. (D5, CA03)
- [ ] **T310** `Sonnet 5` — A exigência do transporte. (D5)
- [ ] **T311** ⚙️ `Haiku 4.5` — `changeset` das fases 1–3.

## Fase 4 — ⛔ parada: o usuário publica o núcleo

- [ ] **T401** ⛔ **sem modelo — é do dono do projeto.** Merge no `main` do
      `adatechnology-packages` e publicação. Só depois de a versão estar **no registry** é que a
      fase 5 começa — typecheck verde sobre `dist` espelhado **não é prova** (CLAUDE.md de lá). A
      sessão **não segue sozinha**.

## Fase 5 — o TransportAdA consome

- [ ] **T501** ⚙️ `Haiku 4.5` — Instalar a versão publicada e fixá-la nos três apps que usam
      conversa. (RF11)
- [ ] **T502** `Sonnet 5` — Teste de contrato dos adaptadores: quem é a contratante, quem é o
      motorista, a permissão e o `companyId` continuam do produto. (RF12)
- [ ] **T503** `Sonnet 5` — Os adaptadores das portas do núcleo. (RF11, RF12)
- [ ] **T504** `Sonnet 5` — Teste do **ramo do motorista** na atribuição: mensagem que não responde
      a nada segue para os fluxos de comando da 144, e **não** entra na conversa. (RF13, D7)
- [ ] **T505** `Sonnet 5` — O ramo do motorista, sobre a atribuição genérica do núcleo. (RF13)
- [ ] **T506** 🧠 `Opus 5.5` — O transporte de e-mail da 143 passa a implementar
      `ConversationEmailTransportPort`, **sem mudar comportamento**. É a troca de dono do token e do
      DKIM em código que está em produção: gate de Opus. (RF14, CA07)
- [ ] **T507** `Sonnet 5` — Os módulos da 183 passam a chamar o núcleo. (RF11)

## Fase 6 — migração

> ⚠️ **A primeira task pode parar a fase.**

- [ ] **T601** ⚙️ `Haiku 4.5` — **Contar as linhas antes de migrar**, em staging e em produção:
      `occurrence_conversations`, `_messages`, `_attachments`, `_reads`, `_unassigned`. O número vai
      para a `evidence.md`. **Se contrariar a premissa de base vazia, a fase para** e o plano volta
      ao caminho duplo. Contagem é mecânica; a decisão que ela dispara é do dono do projeto.
      (D8, CA08)
- [ ] **T602** 🧠 `Opus 5.5` — Migration: cria o schema do núcleo, copia o que houver (idempotente
      por id), e **só então** derruba as tabelas da 183. `drop` sobre dados de produção: gate de
      Opus, e a 183 já tratava toda migration como 🧠. (RF15, D8)
- [ ] **T603** ⚙️ `Haiku 4.5` — `make migration-test` — migration e rollback em Postgres descartável.
      (RF15)
- [ ] **T604** `Sonnet 5` — Os testes da 183 verdes depois da troca. **É o arnês desta spec**, e
      nenhuma task da fase 5 ou 6 fecha com ele vermelho. (CA09)

## Fase 7 — `conversations-ui`

- [ ] **T701** `Sonnet 5` — `email` no `CONVERSATION_CHANNEL`, e a tela passa a ler a tabela de
      capacidades **do contrato**, não a dela. Contrato falha se a UI declarar a própria. (RF10)
- [ ] **T702** `Sonnet 5` — A tela obedece à capacidade: recurso que o canal não tem fica
      **desabilitado com dica dizendo por quê**; recurso de outro canal **some**. (RF10, D3, CA04)
- [ ] **T703** 🧠 `Opus 5.5` — Revisão de design com print, no canal `email` e no `whatsapp`, em
      375px e no desktop (web.md §15). O selo de lida **não aparece** no e-mail. (D4, CA04)
- [ ] **T704** ⚙️ `Haiku 4.5` — `changeset` da fase 7.
- [ ] **T705** ⛔ **sem modelo — é do dono do projeto.** Segunda publicação, e o bump no
      TransportAdA.

## Fase 8 — fechamento

- [ ] **T801** 🧠 `Opus 5.5` — Revisão de código e de segurança nos dois repositórios, com
      `code-reviewer` e `security-reviewer`. Confere em especial: nenhuma PII em tipo persistido do
      pacote (RNF4), nenhum `process.env` lido pelo pacote (RNF2), nenhum `any` (RNF5).
- [ ] **T802** `Sonnet 5` — Confirmar que **nenhuma decisão de negócio mudou de lugar**: a tratativa
      da 164 continua onde está. (CA10, ADR-0075 §6)
- [ ] **T803** ⚙️ `Haiku 4.5` — Documentação: `CLAUDE.md` dos dois repositórios,
      `docs/ai-context/`, e a ADR-0072 marcada como **revista em parte** pela ADR-0075.
- [ ] **T804** ⚙️ `Haiku 4.5` — `evidence.md` fechado, com a contagem da T601, o modelo que rodou
      cada task e o que ficou aberto escrito.

## Contagem por modelo

| Modelo             | Tasks                                                                                            | Quantas |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------- |
| 🧠 Opus 5.5        | T101, T201, T301, T302, T307, T308, T506, T602, T703, T801                                       | 10      |
| Sonnet 5           | T103–T108, T202, T204–T210, T212, T303–T306, T309, T310, T502–T505, T507, T604, T701, T702, T802 | 30      |
| ⚙️ Haiku 4.5       | T102, T109, T203, T211, T311, T501, T601, T603, T704, T803, T804                                 | 11      |
| ⛔ dono do projeto | T401, T705                                                                                       | 2       |
| **Total**          |                                                                                                  | **53**  |

A Fase 3 concentra metade do Opus (T301, T302, T307, T308) porque é a única fase de criptografia:
token derivado e assinatura DKIM. O resto do Opus são os três desenhos que viram contrato (T101,
T201) ou mexem em produção (T506, T602), mais as duas revisões (T703, T801).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/184-o-nucleo-de-conversa-ganha-o-e-mail/ (leia
spec.md, plan.md, tasks.md e a ADR-0075 antes de começar). Uma task por vez, na ordem do tasks.md,
um commit por task, teste antes da implementação.

O modelo está escrito em cada task. Troque de modelo de propósito ao entrar numa 🧠 (Opus 5.5), e
registre na evidence.md o modelo que de fato rodou — divergência da tabela é achado.

⛔ PARE nas tasks T401 e T705: são publicação de pacote, e quem publica é o dono do projeto. Não
siga sozinho.
⚠️ PARE na T601 se a contagem contrariar a premissa de base vazia.
```
