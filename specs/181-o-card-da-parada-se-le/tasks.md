# Tasks — Feature 181

Uma task por vez. Cada uma fecha com typecheck + lint + `bun test ./test/trip.contract.test.ts` +
commit isolado, e evidência em `evidence.md`.

⚠️ `bun test` precisa de `./` no caminho.
⚠️ Antes de editar teste, conferir `grep -oE "describe\('[^']+'"` antes e depois — quatro suítes já
foram apagadas nesta base por um replace amplo.
⚠️ Árvore compartilhada: `git add` com caminhos explícitos, nunca `-A`.

## Fase 1 — Os selos dizem coisas diferentes

> 🤖 Modelo: `sonnet`

- **T101** Teste de contrato: uma nota com ocorrência em tratativa produz **um** selo de ocorrência,
  não dois. `hasOpenOccurrenceMarker(document)` e `document.openOccurrenceCase` são a mesma condição
  (provado em `proposta-ux.md`). (RF2, CA02)
- **T102** Os selos passam a ser três eixos — pipeline, ocorrência, fiscal. O de devolução carrega o
  motivo traduzido junto ("Devolvida · ausente"), e a frase separada que repetia o fato sai.
  (RF2, RF3, CA03)

## Fase 2 — O card ganha estrutura

> 🤖 Modelo: `sonnet`

- **T201** Teste de contrato: o número da nota tem âncora tipográfica própria; dinheiro e pessoas
  saem em blocos rotulados. (RF4, RF5, CA04, CA05)
- **T202** Cabeçalho (endereço + horário + contagem), faixa de selos e grade rotulada, conforme a
  variação **B** aprovada. `.stopDocumentRow` deixa de ser um `flex-wrap` sem segundo eixo.
- **T203** Ordem das ações: a mais provável primeiro (marcar entregue numa nota carregada);
  devolver não ocupa a posição de acerto fácil.

## Fase 3 — O detalhe abre sob demanda

> 🤖 Modelo: `sonnet`

- **T301** Teste de contrato: produtos e ocorrências vêm recolhidos com contagem no rótulo; nota sem
  detalhe não oferece expansão. (RF6, CA06, CA07)
- **T302** Expansões reusando o padrão da spec 180 (`aria-expanded`/`aria-controls`, chevron,
  teclado, 44px) — não nasce um segundo modo de expandir.
- **T303** `TripDeliveryProof.component.tsx` para de despejar produtos e ocorrências
  incondicionalmente nos três estados. (RF7)
- **T304** Contratante, regra fiscal e contato vão para a expansão; ausência de telefone não ocupa
  espaço na frente. (RF4)

## Fase 4 — A seleção em massa deixa de se esconder

> 🤖 Modelo: `sonnet`

- **T401** Teste de contrato: a caixa de seleção ocupa posição fixa na nota, e a marcação por parada
  mantém o estado indeterminado quando só algumas estão marcadas. (RF10, RF12, CA09, CA11)
- **T402** A caixa ganha lugar próprio no card reorganizado — âncora de varredura vertical, não mais
  um controle perdido no texto corrido. A barra de ação em massa
  (`TripDetail.component.tsx:656`) diz quantas notas estão marcadas. (RF11, CA10)
  ⚠️ O recurso JÁ funciona (devolução em lote, com a nota que falha permanecendo marcada). Esta task
  é sobre encontrá-lo, não sobre reescrevê-lo.

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet` (T502 é 🧠 — revisão de design com print)

- **T501** 375px: blocos em largura inteira, empilhados, sem nada fora da tela. (RF9, CA08)
- **T502** 🧠 Revisão de design e usabilidade com print, em 375px e no desktop (web.md §15). (CA12)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/181-o-card-da-parada-se-le/ (leia spec.md,
proposta-ux.md e tasks.md antes de começar). Uma task por vez, na ordem.
Modelos: Fases 1-4 → executor model=sonnet · Fase 5 → executor model=sonnet, T502 🧠 revisão de
design com print · revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação. Cada task fecha com typecheck + lint + teste + commit
isolado, evidência em evidence.md. Rode teste em primeiro plano (nohup + until kill -0), nunca
monitor.
Pare e pergunte antes de: mudar o que a API devolve, deploy, qualquer [NEEDS CLARIFICATION].
```
