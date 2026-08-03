# Feature 014 — Emissão de CT-e a partir da seleção: contrato de taxa e usabilidade

## Problema e resultado

A feature 012 entregou o caminho "seleciono notas → vejo a projeção → crio o lote". Ele funciona,
mas hoje o operador não consegue usá-lo: o único perfil de emissão cadastrado nunca chega à tela,
o diálogo de emissão nasce fora da área visível e o bloqueio de uma nota só aparece depois que ela
já foi selecionada.

Três defeitos medidos no ambiente local, com o `make dev` no ar:

1. **O contrato decimal de taxa diverge entre API e frontend.** A coluna
   `cte_emission_profiles.icms_rate` é `numeric(9,6)` e guarda `0.000000`. O driver `bun-sql` cru
   devolve `"0.000000"`, mas o `numeric()` do Drizzle normaliza para `"0"`, e é `"0"` que sai no
   corpo da resposta. O guard do frontend (`RATE_PATTERN = /^(?:0|1)\.[0-9]{6}$/`) exige seis
   casas, `profileListFromApi` lança `CTE_PROFILES_RESPONSE_INVALID`, a query cai em erro e
   `profilesQuery.data` fica `undefined`. Efeito visível: o `SelectMenu` de "Perfil de emissão"
   sobra só com "Automático" e a tela Administração → Perfis de emissão de CT-e exibe
   "Não foi possível carregar os perfis". O regex da própria API
   (`RATE_DECIMAL = /^(?:0|0\.[0-9]{6}|1|1\.000000)$/`) aceita `0` puro — os dois lados descrevem a
   mesma grandeza de formas incompatíveis.

2. **O diálogo de emissão é capturado por um ancestral com `transform`.** `.cteEmissionOverlay` é
   `position: fixed`, mas `DIV.application-page-transition` tem `transform: matrix(1,0,0,1,0,0)` e
   por isso vira o containing block do overlay. Medido em viewport 1440×900 com `scrollY: 0`: o
   overlay ocupa `top: 182 / height: 2331.58` e o diálogo cai em `y ≈ 1197` — cerca de 300px abaixo
   da dobra. O operador clica em "Gerar CT-es" e a tela não muda; ele precisa rolar para descobrir
   que nada quebrou.

3. **O bloqueio da nota só é conhecido depois da seleção.** "Já vinculada a outro CT-e" é uma
   condição sabida no momento em que a linha é listada, mas hoje ela só aparece na projeção, dentro
   do diálogo. O operador seleciona, abre, e só então descobre que a seleção não produz nada.

**Resultado esperado:** o operador enxerga na própria tabela quais notas não podem gerar CT-e e por
quê; ao abrir o diálogo, ele aparece onde o olho já está; escolhe entre "Automático" e qualquer
perfil ativo da empresa pelo nome; e alcança em um clique os parâmetros que aquele perfil aplica ao
CNPJ do emitente.

## Fora do escopo

- Valor de frete digitado à mão por CT-e. É pedido de produto com consequência fiscal e de
  auditoria (quem alterou, por quê, o que vai no XML) e está registrado como `[NEEDS CLARIFICATION]`
  na Fase E — nenhuma linha é implementada enquanto a pergunta estiver aberta.
- Transformar o diálogo em página ou drawer. Decisão do usuário em 2026-07-29: mantém-se o modal,
  corrigido com portal e travas.
- Cadastro de componentes de cobrança do perfil — a projeção não depende deles; o valor vem do
  percentual da regra de frete.
- Revisão do contrato decimal fora do módulo `cte-profiles`. Outras rotas que leem `numeric` via
  Drizzle podem ter o mesmo desvio, mas entram por evidência própria, não por suposição.

## Histórias priorizadas

### P1 — Escolher o perfil de emissão pelo nome

**Given** sou operador com `cte.manage` e a empresa tem perfis de emissão ativos
**When** abro "Gerar CT-es" e abro o seletor de perfil
**Then** vejo "Automático (pelo CNPJ do emitente)" e cada perfil ativo pelo nome
**And** ao escolher um perfil específico, a projeção é recalculada com os parâmetros dele

### P2 — Administrar os parâmetros de um CNPJ

**Given** sou administrador com `settings.manage`
**When** abro Administração → Perfis de emissão de CT-e
**Then** a lista carrega e mostra, por perfil, o percentual, os CFOPs, o CST e os CNPJs que ele casa
**And** a partir do diálogo de emissão alcanço essa tela em um clique

### P3 — Ver o diálogo onde o olho está

**Given** estou no topo da tabela de notas com uma nota selecionada
**When** clico em "Gerar CT-es"
**Then** o diálogo aparece centralizado na área visível, independentemente do scroll da página
**And** o fundo não rola, o foco fica preso no diálogo e Escape fecha

### P4 — Saber do bloqueio na hora de selecionar

**Given** uma nota já está vinculada a um CT-e não cancelado
**When** vejo a tabela de notas
**Then** a linha indica o motivo do bloqueio e não entra na seleção
**And** a barra de seleção informa quantas das notas marcadas estão bloqueadas antes de eu abrir o
diálogo

## Contratos que não se negociam

- `companyId` vem do contexto autenticado, nunca do payload.
- Taxa e dinheiro trafegam como string decimal de escala fixa — taxa com 6 casas, dinheiro com 4 —
  em **um** formato só, o mesmo na ida e na volta.
- Nenhuma normalização de decimal acontece no componente de UI: a borda é a serialização da API.
- A projeção continua sem transmitir nada à SEFAZ.
- Mudança em query exige teste de tenant-safety.
