# Evidência — 076

## Fase A — A fatia de cada parada (T001–T003)

`test/cargo-volume/cargo-layout.contract.ts` escrito primeiro e falhando. Dez casos, e os três que
carregam a feature:

- **a última parada da rota fica no fundo** (`loadOrder` invertido em relação a `sequence`);
- **a primeira fica na porta** — quem sai primeiro tem de estar ao alcance;
- **excedente vai fora do baú**, nunca comprimido para caber: comprimir faria o desenho afirmar que
  a carga cabe, que é a única coisa que ele não pode dizer errado.

`resolveCargoLayout` (`trips/domain/cargo-layout.policy.ts`) é puro. O layout é montado no
repositório **a partir do que já veio** — `loadTripOccupancy` passou a devolver o volume por nota,
e o agrupamento por parada acontece em memória. Nenhuma consulta a mais.

## Fase B — O desenho (T004–T007)

Contrato de tela primeiro, nove casos. O painel é SVG-free (barras com `flex-grow` proporcional),
cores por token `--color-cargo-stop-1..6`, legenda em `role="list"` com o desenho `aria-hidden` — a
mesma informação em duas formas, uma para o olho e outra para leitor de tela e impressão.

⚠️ **Um contrato existente estava largo demais, e afrouxá-lo foi a decisão certa.**
`trip/mobile-first.contract.ts` varria **toda** `@media` do módulo exigindo ponto de quebra da
grade — e `prefers-reduced-motion`, que a RNF4 exige, não é consulta de largura. O produto já a usa
em quatro arquivos do design system, e o contrato **global** (`design-system/responsive.contract.ts`)
a aceita explicitamente. Só o do módulo proibia. Estreitei a varredura para consultas de largura,
que é o que o `web.md` §10 governa.

## ⚠️ O smoke caiu de novo, pelo mesmo motivo da 075 — e a lição foi mais fina

Quatro casos do smoke autenticado caíram: o helper não declarava `cargoLayout`, o guard usa chaves
exatas, e o detalhe da viagem parou de carregar.

**A spec 075 já tinha "consertado" isso**, anotando o helper com `TripDetailContract` para o `tsc`
pegar campo faltando. Não pegou — porque `TripDetailContract` é um **espelho escrito à mão**, e eu
acrescentei o campo só no tipo real. A tipagem protege contra o esquecimento no helper, não contra o
esquecimento no espelho.

O conserto durável desta vez compara o **objeto** da fixture com as chaves que o guard aceita —
tipo escrito à mão não se enumera em tempo de execução, mas o objeto sim. É o contrato que faltava,
e ele pega a próxima chave sem depender de ninguém lembrar de dois lugares.

```
bun test (API)            3986 pass · 0 fail
bun run test (frontend)   2302 pass · 0 fail
playwright (smoke)        45 passed
make check                EXIT=0
```

## Pendente

**T009** — verificação em staging. ⚠️ Os veículos de lá têm `capacity_m3` mas **não têm dimensões**,
e o degrau `measured` não tem entrada na tela (pendência registrada na 075). Preencher as três
medidas direto na base é parte do teste.
