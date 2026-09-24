# Feature 170 — As ações da viagem no cabeçalho, e a prontidão fiscal junto delas

## Problema e resultado

A tela da viagem espalha decisão por três lugares. **"Ações da viagem"** — hoje "Liberar para
separação" e "Cancelar viagem" — fica numa seção no meio da página, depois do painel de carga e do
mapa. A **prontidão fiscal** ("0 de 1 notas prontas", dispensa de MDF-e, gerar CT-e) fica em outro
bloco, mais abaixo. E as ações unitárias de cada nota ficam num terceiro lugar, na linha da nota.

Quem decide o que fazer com a viagem precisa rolar a página para achar o botão, e quem quer saber
se ela pode ser despachada precisa procurar em outro bloco. São informações da **mesma decisão**,
separadas por acaso de implementação.

Resultado: as ações de estado da viagem e o que barra o próximo passo ficam no cabeçalho, junto do
status — onde a decisão acontece.

## Fora do escopo

- As ações **por nota** (separar, carregar, ocorrência, desvincular), que pertencem à linha da nota.
- As ações em **lote** sobre a seleção, que pertencem ao maço selecionado.
- Mudar o que cada ação faz. Esta spec move e agrupa; não altera regra.

## Histórias priorizadas

### P1 — Decidir sem rolar a página

**Given** a viagem aberta
**When** o operador olha o cabeçalho
**Then** vê o status, a ação principal do estado atual e o que falta para o próximo passo.

### P2 — O que barra aparece junto do que libera

**Given** uma viagem que exige MDF-e e não tem CT-e autorizado
**When** o operador olha o cabeçalho
**Then** vê o impedimento ao lado da ação de despachar, não num bloco distante.

### P3 — A destrutiva não divide vizinhança com a de todo dia

**Given** o cabeçalho com as ações
**When** o operador vai clicar na ação principal
**Then** "Cancelar viagem" está afastada, com tratamento visual de destrutiva.

## Requisitos funcionais

- **RF1** O cabeçalho da viagem passa a hospedar a ação principal do estado (liberar para
  separação, despachar) e a destrutiva (cancelar), com a hierarquia da revisão de 23/09: principal
  sólida, destrutiva secundária em tom de alerta e afastada.
- **RF2** A prontidão fiscal vira um resumo de uma linha no cabeçalho — quantas notas prontas e o
  impedimento, quando houver —, com o detalhe permanecendo onde está hoje.
- **RF3** Em telas estreitas, cabeçalho e ações empilham sem esmagar o status, e a destrutiva fica
  por último.
- **RF4** Nada de ação inerte: botão que não cabe no estado não é desenhado, como já é hoje.
- **RF5** A seção "Ações da viagem" some da posição atual quando passa ao cabeçalho — não existem
  os dois lugares ao mesmo tempo.
- **RF6** A ação em lote continua onde está, ligada ao maço selecionado.

## Requisitos não funcionais

- Só frontend. Nenhuma rota, nenhum contrato novo.
- Área de toque de 44px em mobile (web.md §10).
- Contraste conferido no estado normal e no desabilitado.

## Casos extremos e falhas

- **Viagem cancelada ou concluída**: cabeçalho sem ação, só status — não aparece caixa vazia.
- **Sem permissão de gerir**: nenhuma ação no cabeçalho, e a prontidão continua legível.
- **Muitos impedimentos ao mesmo tempo**: o resumo mostra o primeiro e diz quantos faltam; a lista
  inteira continua no bloco de prontidão.

## Critérios de aceite

- **CA01** As ações de estado aparecem no cabeçalho e somem da seção antiga.
- **CA02** A destrutiva é a última e tem tratamento próprio.
- **CA03** O resumo de prontidão aparece no cabeçalho e o detalhe continua acessível.
- **CA04** Em 375px nada é esmagado e a ordem se mantém.
- **CA05** Sem permissão, nenhuma ação é desenhada.
- **CA06** Revisão de design com print, comparando com as telas irmãs (web.md §15).

## Dúvidas

Nenhuma.
