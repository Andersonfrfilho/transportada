# Feature 077 — O fator de cubagem não tem tela

## Problema e resultado

A spec 075 entregou o fator de cubagem por espécie: a tabela, a política, as rotas
`GET`/`PUT`/`DELETE` em `/company-settings/cargo-volume-factors` sob `settings.manage`, e a
ocupação do baú aparecendo no detalhe da viagem. **Só não entregou por onde configurar.**

Nenhuma task da 075 pediu interface — a T005 pediu "repositório e rotas", e ninguém notou a
lacuna até a verificação em staging, quando **eu gravei o `0,05` direto no banco** para poder
testar o resto. Hoje o operador não tem por onde mexer nisso.

O efeito prático é pior que "falta uma tela": a ocupação **não aparece** enquanto o fator não
existir, e a instalação nova não tem como fazê-lo existir. A feature 075 está no ar e é
inalcançável.

Ao fim desta feature o operador configura o fator pela tela, na aba onde o efeito dele aparece, e
a instalação nova consegue ligar a estimativa sem ninguém tocar no banco.

## Onde o painel mora, e por quê

`CLAUDE.md`, "Configuração perto do efeito": o painel vive na tela onde o efeito aparece, e o
endereço é declarado **uma vez** em `SETTINGS_PANEL_PLACEMENT`
(`company-settings/shared/companySettingsTabs.service.ts`).

O irmão dele já está lá: `cargoWeight: { module: 'nfe-workspace', source: 'cargoSettings', tab:
'imports' }` — o peso padrão por volume mora na aba de importação de notas, junto do dado que ele
estima. **O fator de cubagem vai ao lado dele**, e pelo mesmo motivo: os dois estimam a mesma
coisa a partir do mesmo `qVol`, e separá-los faria o operador procurar em dois lugares por duas
metades da mesma configuração.

⚠️ É o registro que garante o campo **vir preenchido**: a tela liga a consulta com
`enabled: canManageSettings && settingsScope.<source>` — permissão **e** aba aberta. Painel novo
sem entrada no registro renderiza formulário em branco sobre dado que existe.

## Fora do escopo

- **Tela para `vehicle_volume_references`.** É catálogo de mercado, sem `company_id`, semeado por
  migration — não é configuração de empresa, e dar tela a ela convidaria a editar o que a próxima
  migration sobrescreve.
- **Editar as dimensões do veículo.** `cargo_length_m`/`width`/`height` já existem em
  `fleet_vehicles` desde a 075, e o formulário da frota é outro escopo — mas ⚠️ ver D2, porque sem
  elas o degrau `measured` é inalcançável pela tela.
- **Aviso quando a ocupação passa de 100%.** A tela já mostra o estouro; transformá-lo em alerta é
  decisão de operação, não desta spec.

## Histórias priorizadas

### P1 — O operador liga a estimativa de cubagem

**Given** uma instalação sem fator configurado
**When** o operador abre a aba de importação de notas com `settings.manage`
**Then** ele vê o painel de cubagem vazio, com o texto explicando o que o número faz, e consegue
gravá-lo.

### P2 — O painel abre preenchido

**Given** um fator já gravado
**When** a aba é aberta
**Then** o valor atual aparece no campo — nunca em branco sobre dado que existe.

### P3 — Desligar é apagar, e a tela diz isso

**Given** um fator configurado
**When** o operador desliga a estimativa
**Then** a linha é apagada (`DELETE`), a ocupação desaparece das viagens, e a tela avisa **antes**
que é isso que vai acontecer.

### P4 — A espécie é visível, mesmo sendo uma só

**Given** que hoje toda nota cai na linha de espécie vazia
**When** o painel é exibido
**Then** ele mostra que aquele é o **padrão**, e não esconde que a tabela é por espécie — senão o
dia em que um emitente preencher `esp` ninguém saberá onde ajustar.

## Requisitos funcionais

- **RF1** — Painel novo declarado em `SETTINGS_PANEL_PLACEMENT`, em `nfe-workspace` / aba
  `imports`, ao lado de `cargoWeight`.
- **RF2** — Campo com máscara decimal e formato brasileiro na exibição (a 075 já imprime `2,25 m³`
  na viagem; entrada e saída precisam falar a mesma língua).
- **RF3** — Desligar usa `DELETE`, nunca gravar zero — o CHECK do banco recusa zero, e o schema Zod
  recusa antes.
- **RF4** — O texto de ajuda diz **o que o número significa** (metros cúbicos por volume) e **o que
  ele afeta** (a ocupação exibida na viagem), nunca só o nome do campo.
- **RF5** — A lista por espécie é exibida quando houver mais de uma linha; com uma só, o painel
  mostra o padrão sem obrigar o operador a entender a dimensão que ele não usa.

## Requisitos não funcionais

- **RNF1** — Rótulos em `*.locale.json` acentuados; o contrato de acentos varre por glob.
- **RNF2** — Campo pelos tokens de campo (`--field-height`/`--field-padding`), select do design
  system, nada de `<input>` cru fora do padrão.
- **RNF3** — Contrato de aba em `test/nfe-workspace/`, no padrão de
  `distribution-settings.contract.ts`.

## Casos extremos e falhas

- **Sem `settings.manage`** — o painel não é oferecido para escrita. ⚠️ Ver D1: se ele deve
  desaparecer ou ficar somente-leitura é a decisão que a spec toma.
- **Valor com mais de seis casas** — recusado na fronteira, com a mensagem ancorada no campo.
- **Zero digitado** — recusado, com o texto explicando que desligar é outro botão.
- **Falha de rede ao gravar** — o campo não perde o que foi digitado.

## Critérios de aceite

- **CA1** — Painel aparece na aba `imports` de `nfe-workspace`. (RF1)
- **CA2** — Abre com o valor atual preenchido. (P2)
- **CA3** — Desligar apaga a linha e a ocupação some da viagem. (P3/RF3)
- **CA4** — Zero é recusado com mensagem no campo. (Casos extremos)
- **CA5** — O texto diz o que o número afeta. (RF4)
- **CA6** — Contrato de aba e de acentos verdes. (RNF1/RNF3)

## Decisões

- **D1 — ⚠️ Revista na implementação: o painel exige `settings.manage`, e não fica somente-leitura.**

  A decisão original dizia o contrário, por analogia com a busca automática de notas, que "continua
  visível com o cartão somente-leitura". A analogia não se sustenta: **aquele cartão lê de outra
  rota** (`GET /nfe-imports/distribution`, com permissão de operação), enquanto o fator de cubagem
  tem uma fonte só, `GET /company-settings/cargo-volume-factors`, sob `settings.manage`. Painel
  somente-leitura ali não teria de onde ler — o servidor responderia 403, e a tela mostraria um
  cartão vazio ou um erro.

  As saídas seriam afrouxar a permissão da rota (dar a quem opera acesso a configuração) ou criar
  uma segunda rota de leitura. As duas custam mais do que o problema pede, porque **a razão original
  já está atendida em outro lugar**: a tela da viagem imprime _"Valor estimado: a nota fiscal não
  traz medida da carga, e o cálculo usa o fator de cubagem por volume configurado"_. Quem monta
  viagem já lê de onde vem o 28% — sem precisar do painel.

  O que fica: o painel é de quem administra configuração, e a **origem** do número é dita na tela
  onde ele aparece.

- **D2 — ⚠️ O degrau `measured` continua inalcançável pela tela, e isso é dito por escrito.**
  A 075 pôs `cargo_length_m`/`width`/`height` em `fleet_vehicles`, mas **nenhum formulário os
  edita**. Consequência: toda capacidade em produção sairá de `capacity_m3` (degrau `declared`) ou
  da referência — e o degrau mais preciso, o que a 075 desenhou como primeiro, não tem entrada.
  Isto **não** entra aqui porque é o formulário da frota, com validação e layout próprios; entra
  como spec própria, e fica registrado para não ser redescoberto na próxima verificação em staging.

## Dúvidas

Nenhuma bloqueante.
