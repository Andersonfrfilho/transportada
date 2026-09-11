# Spec 138 — A grade de números não vaza, o hover cobre o cartão, e a jornada some sob 24h

> 🤖 Modelo: `sonnet` (CSS, componente, i18n, contratos) — sem task 🧠: são ajustes de layout e
> formatação sobre uma regra já decidida (spec 110), não decisão estrutural nova.

## Problema

Capturas reais da proposta de roteiro ("Montar roteiro pela busca de notas" → "Propor roteiro"), com o
diálogo entre ~680 e ~900 px de largura (o diálogo é capado em `min(46rem, 100%)` — spec 110):

1. **A grade de seis números quebra.** "2.580,601" quebra antes de "kg"; "R$ 1.988,47" (RECEITA) vaza
   para fora da borda direita do cartão; "R$ 836,58" e "R$ 1.151,90" ficam colados sem espaço
   (`"R$ 836,58R$ 1.151,90"`); os rótulos (DESPESAS, LUCRO) não ficam alinhados sobre os valores.
   Causa: entre 40rem e 64rem a grade (`repeat(3, minmax(0, 1fr))`) disputava a mesma fileira flex que
   a identidade do veículo, sem quebra de linha — as duas se espremiam até a coluna quase zerar, e o
   valor sem `white-space: nowrap` deixava de respeitar a borda da célula.
2. **O hover cobre só parte do cartão.** `.proposalTrigger:hover` pintava só o botão-gatilho; a caixa
   de seleção e a fileira de ações ficavam fora do realce.
3. **Os botões ✓/✕ caem soltos.** Abaixo de 64rem eles formavam uma fileira independente, sem borda,
   sem alinhamento com a grade — pareciam um apêndice, não parte do cartão.
4. **A jornada em `Xh MM` não lê como duração.** "29h47" na barra de totais ("JORNADA SOMADA") e no
   TEMPO por viagem não diz "mais de um dia" a quem lê rápido.

## Decisões

- **D1 — A grade nunca disputa espaço com a identidade: ela desce inteira.** `.proposalTrigger` ganha
  `flex-wrap: wrap`; `.proposalMetrics` ganha `flex: 1 1 100%` (sempre vira fileira própria quando não
  cabe ao lado) e `min-width: 15rem`. A partir de 64rem (onde sobra largura) ela volta a `flex: 0 0
auto` e senta ao lado da identidade, como antes.
- **D2 — A grade reflui em três degraus, só com `min-width`:** 2 colunas na base, 3 a partir de 40rem,
  6 de largura fixa (7,5rem) a partir de 64rem — nunca `max-width`.
- **D3 — Todo valor numérico é `white-space: nowrap`** (`.proposalMetricValue`, nova classe na `Metric`
  do cartão e no `Total` da barra), para nunca quebrar no meio da unidade nem vazar da célula — a
  grade (D1+D2) garante que sempre há espaço para o valor caber.
- **D4 — O hover é do cartão inteiro.** `.proposalRow:hover` substitui `.proposalTrigger:hover`; maior
  especificidade que `.proposalRowOpen`, então vence com ou sem o detalhe expandido.
- **D5 — As ações são uma faixa de rodapé do cartão sob 64rem, e ficam ao lado da grade a partir daí.**
  Abaixo de 64rem, `.proposalActions` ganha `border-top` (mesmo traço do `.proposalDetail`) e recuo
  igual ao do gatilho — lê como parte do cartão. A partir de 64rem, mantém o comportamento anterior
  (coluna própria ao lado, largura reservada para os três botões). Ícone, `aria-label` e `Tooltip` já
  existiam (spec 110 D5b) — não mudou.
- **D6 — A jornada em dias/horas/minutos, com a regra "unidade zerada no meio se omite".**
  `formatDuration` (`routing/shared/suggestionValuation.service.ts`, já compartilhado por `trip` e por
  `routing`) passa a receber os rótulos de unidade traduzidos (`buildDurationUnitLabels`, novo par de
  chaves `duration.{days,hours,minutes}` em `routing.locale.json`/`.en.locale.json`) e produz
  `"1 d 5 h 47 min"` (29h47), `"5 h 47 min"` (abaixo de 24h), `"2 d"` (48h00 — hora e minuto zerados
  somem). Duração zero preserva a saída de sempre (`"0min"`): não vale criar uma segunda forma só para
  "nada". Não muda o cálculo, só o texto.

## Fora de escopo

- O `assemblyLeg.service.ts` (formatador de minutos do mapa de montagem, já sem dias) e o
  `formatDuration` local de `RouteSuggestionPanel` (duração de uma única rota, não uma jornada somada)
  não são tocados — são implementações distintas para telas distintas.
- A grade de 6 colunas fixas a partir de 64rem pode ultrapassar os 46rem do diálogo em janelas muito
  largas (>1024px) — pré-existente, fora do sintoma relatado (680–900px), fica para tarefa própria.
