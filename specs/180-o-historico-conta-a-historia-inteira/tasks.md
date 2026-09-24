# Tasks — Feature 180

Uma task por vez. Cada uma fecha com typecheck + lint + teste da app tocada + commit isolado, e
evidência em `evidence.md`.

⚠️ `bun test` não acha `*.integration.ts` sem `./` no caminho.

## Fase 1 — O que já foi feito

> 🤖 Modelo: `sonnet`

- **T101** ✅ Motivo da devolução traduzido; filtro por várias notas, mantendo os eventos da viagem;
  marcador centralizado no item (`63cd5ca6b` e o commit do marcador).
- **T102** ✅ Seeder local grava `identity_user_profiles` — sem ele a autoria vinha nula e a tela
  dizia "usuário removido" de usuário ativo. **Pendente de commit** (a árvore tinha trabalho da
  spec 179 em curso).

## Fase 2 — O histórico deixa de mentir

> 🤖 Modelo: `sonnet`

- **T201** Teste de contrato: autoria ausente **não** vira "usuário removido" quando não se sabe o
  motivo. A frase fica reservada a vínculo perdido; o resto diz que o autor não está identificado.
  (RF3, CA03)
- **T202** `fieldAuthorship.service.ts` para de usar `authorship.removedActor` como destino de
  qualquer `actorName` nulo. Textos em pt-BR e en.
  ⚠️ A causa raiz na bancada era o seeder (T102); esta task é sobre a tela **não afirmar** o que não
  sabe — vale em produção, onde o nome pode faltar por outro motivo.

## Fase 3 — O evento leva à coisa e abre

> 🤖 Modelo: `sonnet`

- **T301** Teste de contrato: a nota do evento leva à nota; a parada, à parada. (RF15, CA13)
- **T302** Links no item, por `href` — nada de requisição nova na lista. (RF18)
- **T303** Teste de contrato: evento com detalhe expande e recolhe; evento sem nada a acrescentar
  não oferece o controle. (RF16, CA14, CA16)
- **T304** Expansão no item, com título/hora/autoria sempre visíveis e o resto dentro. Acessível por
  teclado, área de toque de 44px.
- **T305** Ao expandir ocorrência com anexo, buscar e mostrar as fotos pela rota existente
  (`GET /trip-occurrences/:id/attachments`), reusando `OccurrenceAttachmentGrid`. O `item.id` do
  evento de ocorrência **é** o id da ocorrência. (RF5, RF6, CA05, CA15)

## Fase 4 — O evento é formatado

> 🤖 Modelo: `sonnet`

- **T401** Hierarquia visual do item: título, meta e detalhes distintos; dado rotulado, não embutido
  na frase. (RF17)
- **T402** Avatar de iniciais a partir do `actorName`, cor derivada do nome (estável), ausente
  quando não há autor identificado. Só frontend — não toca a API nem a D6. (RF9–RF11, CA08, CA09)

## Fase 5 — O que a API precisa entregar

> 🤖 Modelo: `sonnet` (T501 é 🧠 — mexe no contrato da timeline)

- **T501** 🧠 Veículo e motorista no evento de carregamento. Campo novo no item obriga
  `TRIP_TIMELINE_ITEM_KEYS` e o guard de chave exata a subirem junto — **frontend tolerante
  primeiro**, senão a lista inteira quebra. Join nas consultas existentes, sem N+1. (RF4, CA04)
- **T502** Link para a posição recomendada da carga a partir do evento de carregamento — link, não
  desenho embutido: o cargo placement tem tela própria. (RF7, CA07)
- **T503** 🧠 Revisão de design e usabilidade com print, em 375px e no desktop (web.md §15). (CA18)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/180-o-historico-conta-a-historia-inteira/ (leia
spec.md e tasks.md antes de começar; a Fase 1 já está feita). Uma task por vez, na ordem.
Modelos: Fases 2-4 → executor model=sonnet · Fase 5 → executor model=sonnet, T501 e T503 🧠 validam
com architect em opus antes · revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação. Cada task fecha com typecheck + lint + teste + commit
isolado, evidência em evidence.md. Rode teste em primeiro plano (nohup + until kill -0), nunca
monitor.
Pare e pergunte antes de: mudar o contrato da timeline sem o frontend tolerante, deploy, qualquer
[NEEDS CLARIFICATION].
```
