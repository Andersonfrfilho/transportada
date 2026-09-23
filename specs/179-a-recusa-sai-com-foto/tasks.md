# Tasks — Feature 179

Uma task por vez. Cada uma fecha com typecheck + lint + teste da app tocada + commit isolado, e
evidência em `evidence.md`.

## Fase 1 — O tipo declara a exigência
> 🤖 Modelo: `sonnet`

- **T101** Teste de contrato: `company_occurrence_types` aceita `attachmentMode` e `returnsToDepot`,
  e os valores omitidos viram `off` e `false`. (CA07, CA08)
- **T102** Migration aditiva: colunas `attachment_mode varchar(16) not null default 'off'` com CHECK
  `in ('off','optional','required')` e `returns_to_depot boolean not null default false`, mais
  `rollback.sql` com chave própria e `GET DIAGNOSTICS ROW_COUNT`. Rodar `make migration-test`.
- **T103** Schema, repositório e use-case de salvar tipo passam a ler e gravar os dois campos. (CA01)

## Fase 2 — A API aceita e exige
> 🤖 Modelo: `sonnet` (T203 e T205 são 🧠 — o parecer do `architect` está em `architecture-review.md`)

> ⚠️ A revisão de arquitetura de 23/09 mudou esta fase. Três coisas vieram dela: a idempotência que
> não existe (T200), o `runDocumentOutcome` da T205, e a miniatura que já é do cliente (T206).

- **T200** A rota de ocorrência do motorista ganha **chave de idempotência**, que hoje ela não tem —
  `/deliver` e `/return` já leem a chave, esta não. Reaproveitar `withFieldReport` e derivar a
  operação do conteúdo, como `buildOccurrenceBatchOperation` faz com `sha256Hex(bytes)`. Sem isto a
  fila offline da Fase 3 duplica ocorrência e objeto no bucket. (RF13)
- **T201** Teste de contrato: emitir URL assinada de upload valida tipo (imagem ou PDF) e tamanho, e
  a rota da ocorrência recusa objeto que não existe, não é da empresa ou não veio desta viagem.
  (RF2a, RF2b)
- **T202** Upload direto ao storage por URL assinada de vida curta: rota que emite a URL e
  conferência do objeto ao registrar a ocorrência. A rota da ocorrência **continua JSON** — o
  arquivo não passa pela API (RF2). Isto substitui o plano anterior de multipart, e por isso nenhum
  cliente antigo quebra.
  ⚠️ O parecer de arquitetura assumia multipart; releia `architecture-review.md` sabendo que esta
  parte mudou por decisão do usuário em 23/09. A compensação de bucket (`runWithStoredObjectCleanup`)
  continua valendo, agora para o objeto órfão de uma ocorrência que nunca chegou.
- **T203** 🧠 `register-driver-occurrence.use-case.ts` recusa tipo `required` sem anexo ou sem
  `note`, com erro de domínio próprio e código estável em `shared/errors/codes.ts`. A escrita é
  **única**: `runWithStoredObjectCleanup` + `unitOfWork.execute`, o padrão que o escritório já usa —
  falha no insert apaga o objeto, falha no upload nunca grava a linha. Ocorrência "pendente de
  envio" foi **descartada**: criaria um estado que nenhuma outra ocorrência tem e violaria CA02.
  ⚠️ Isto exige **dar uma unit of work ao caminho do motorista**, que hoje não tem. É o custo real
  desta task, e não estava estimado. (CA02, CA03, RF3)
- **T204** Teste de contrato: tipo com `returnsToDepot` devolve a nota **fechando parada e viagem**;
  tipo sem a marca não toca a nota. (CA09, RF10)
- **T205** 🧠 A devolução entra no encadeamento de `runDocumentOutcome`, como o canhoto já entra —
  **nunca** escrevendo `separation_status` direto, que marcaria a nota sem fechar parada nem viagem
  e deixaria a parada aberta para sempre. Nota já entregue e nota já devolvida **já estão resolvidas**
  pela política de transição (`documentAlreadyClosed` e `unchanged`): a task é não contorná-las.
  O tipo declara **qual código** de `DRIVER_RETURN_REASONS` aplica — coluna própria, nunca a `note`,
  que quebraria a tradução da tela. (CA10, RF10)
- **T206** O caminho do motorista manda `thumbnail` como o do escritório já manda (spec 161). **Não**
  se gera miniatura no servidor: o produto já a gera no cliente, com objeto e `purpose` próprios.
  (RF12, CA12)

## Fase 3 — O motorista tira a foto
> 🤖 Modelo: `sonnet`

- **T301** Teste de contrato da tela: tipo `required` sem foto ou sem motivo não habilita o envio, e
  a mensagem diz qual dos dois falta. (CA04)
- **T302** Captura da imagem na tela de ocorrência, com o caminho de galeria quando a câmera é
  negada, e os mesmos limites de tamanho e tipo do comprovante de entrega.
- **T303** A fila offline carrega a imagem junto do corpo; a tela distingue "na fila" de "enviado".
  Smoke cobrindo o caminho sem sinal. (CA05, RF5)

## Fase 4 — O painel e o fechamento
> 🤖 Modelo: `sonnet` (T403 é 🧠 — revisão de design com print)

- **T401** O editor de tipos de ocorrência oferece as duas marcas — comprovante e devolução ao
  barracão — em pt-BR e en. (CA01, RF14)
- **T402** A imagem da recusa aparece para o escritório pelo caminho de anexos existente, e a lista
  mostra **miniatura**, buscando a imagem cheia só ao abrir. (CA06, CA11)
- **T403** A tela do motorista avisa que aquele tipo devolve a nota ao barracão, antes de confirmar
  — devolver mercadoria não pode ser efeito surpresa.
- **T404** 🧠 Revisão de design e usabilidade com print, em 375px e no desktop (web.md §15). (CA13)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/179-a-recusa-sai-com-foto/ (leia spec.md, plan.md e
tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet · Fase 2 → executor model=sonnet, T203 e T205 🧠 validam com
architect em opus antes de escrever código · Fase 3 → executor model=sonnet · Fase 4 → executor
model=sonnet, T404 🧠 revisão de design com print · revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação. Cada task fecha com typecheck + lint + teste da app
tocada + commit isolado, evidência em evidence.md. A migration da T102 fecha com make
migration-test, e nasce com rollback.sql.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
