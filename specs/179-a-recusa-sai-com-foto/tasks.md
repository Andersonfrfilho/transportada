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
> 🤖 Modelo: `sonnet` (T203 é 🧠 — validar com `architect` em `opus` antes de escrever)

- **T201** Teste de contrato: `POST /me/current-trip/documents/:id/occurrences` aceita multipart com
  `file`, e segue aceitando JSON quando o tipo não exige anexo.
- **T202** A rota vira multipart reaproveitando `readOfficeMultipartFile` e `storage.store`; o
  anexo grava `attachmentObjectId` com o `companyId` do contexto autenticado. (RF2, RF8)
- **T203** 🧠 `register-driver-occurrence.use-case.ts` recusa tipo `required` sem anexo ou sem
  `note`, com erro de domínio próprio e código estável em `shared/errors/codes.ts`. Decidir aqui se
  a escrita é única ou se a ocorrência nasce pendente de envio — é o ponto que a spec mais arrisca
  errar. (CA02, CA03, RF3)

- **T204** Teste de contrato: tipo com `returnsToDepot` marca a nota como devolvida com o motivo da
  ocorrência; tipo sem a marca não toca a nota. (CA09, RF10)
- **T205** 🧠 O registro da ocorrência aplica a devolução na **mesma transação**, reaproveitando
  `return_reason` / `separation_status = 'returned'`. Recusa a devolução de nota já entregue; ser
  idempotente para nota já devolvida. Nunca deixar um dos dois gravado sem o outro. (CA10)
- **T206** Miniatura gerada no servidor ao armazenar a imagem, servida pelo caminho de anexos, com
  ocorrência antiga sem miniatura seguindo válida. (RF12, CA12)

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
