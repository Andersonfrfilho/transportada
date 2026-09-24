# Feature 181 — O card da parada se lê

## Problema e resultado

Uma parada com uma nota e uma ocorrência produz isto, em sequência plana, sem hierarquia:

```
AVENIDA 21, 610, BARRETOS, SP · 1 nota · 1 nota com ocorrência · Concluída às 17:31
879796/2 · Mercadoria: R$ 754,63 · Frete: R$ 90,56 (previsto) · Regra: Bancada local — NFS-e
24/08/2026 · Recebe: ALMEIDA COMERCIO… · Telefone: (17) 3322-3777 · Contratante: COMERCIAL…
Devolvida · Ocorrência aberta · Ocorrência em tratativa · sem perfil de emissão
Nota devolvida: recipient_absent
O que vai na nota → 7 produtos
Ocorrências → item faltante, prova, autoria
```

Tudo no mesmo peso visual: endereço, dinheiro, pessoas, situação, produtos e histórico. O operador
que abre a viagem para decidir alguma coisa lê um parágrafo até achar o que procura.

Três causas, todas verificadas no código (`proposta-ux.md` tem arquivo e linha):

1. **`.stopDocumentRow` é um `flex-wrap` sem segundo eixo** — dinheiro, pessoas e datas viram `span`
   soltos na mesma esteira, sem agrupamento nem rótulo.
2. **O número da nota não tem âncora tipográfica.** O endereço da parada tem (`.stopLabel`,
   `font-weight: 600`); a nota, não. O olho não acha onde uma nota começa.
3. **O comprovante despeja produtos e ocorrências incondicionalmente** nos três estados de
   `TripDeliveryProof.component.tsx` — é daí que vem o volume, não da parada.

E um defeito de fundo: **os quatro selos de situação são três eixos.** `hasOpenOccurrenceMarker(document)`
e `document.openOccurrenceCase === true` são a **mesma condição booleana** — "Ocorrência aberta" e
"Ocorrência em tratativa" dizem o mesmo fato duas vezes.

Resultado: o card mostra sempre o que decide (endereço, situação, dinheiro, quem recebe) e recolhe o
que aprofunda (produtos, ocorrências, contato), no mesmo padrão de expansão que a linha do tempo
acabou de ganhar.

## Fora do escopo

- A lista de notas do workspace, que é outra tela.
- O conteúdo das ocorrências e a tratativa (specs 164, 166, 167), que não mudam.
- A tradução do motivo de devolução, **já corrigida** em `4764f3b00`.
- As ações de campo, que estão migrando para a lista noutra frente.

## Histórias priorizadas

### P1 — Achar a parada e a situação num relance

**Given** uma viagem com várias paradas
**When** o operador percorre a lista
**Then** cada card mostra endereço, horário e situação sem que ele leia o parágrafo inteiro.

### P1 — Os selos dizem coisas diferentes

**Given** uma nota devolvida com ocorrência em tratativa e sem perfil de emissão
**When** os selos aparecem
**Then** são três — pipeline, ocorrência, fiscal —, nunca o mesmo fato repetido.

### P2 — O dinheiro e as pessoas ficam separados

**Given** uma nota com valores e destinatário
**When** o card é montado
**Then** dinheiro e pessoas aparecem em blocos rotulados, não em `span` na mesma esteira do endereço.

### P3 — O detalhe abre quando se quer

**Given** uma nota com 7 produtos e 1 ocorrência
**When** o card é mostrado
**Then** eles aparecem recolhidos, com a contagem no rótulo; abrem sob o toque do operador.

## Requisitos funcionais

- **RF1** O card segue a variação **B** (escolha do usuário em 23/09): cabeçalho com endereço e
  horário, faixa de selos, grade rotulada de dados, ações, e expansões ao pé.
- **RF2** Os selos de situação são **três eixos**: pipeline (entregue/devolvida), ocorrência e
  fiscal. `hasOpenOccurrenceMarker` e `openOccurrenceCase` não podem gerar dois selos — são a mesma
  condição.
- **RF3** O selo de devolução carrega o motivo junto ("Devolvida · ausente"), em vez de um selo e uma
  frase separada repetindo o fato.
- **RF4** Dinheiro (mercadoria, frete e se é previsto) e pessoas (recebe, contratante, telefone) são
  blocos com rótulo próprio.
- **RF5** O número da nota ganha âncora tipográfica, como o endereço da parada já tem.
- **RF6** Produtos, ocorrências e contato ficam **recolhidos**, com contagem no rótulo fechado
  (`7 produtos na nota`), reusando o padrão de expansão da spec 180 (`aria-expanded`/`aria-controls`,
  chevron, teclado).
- **RF7** `TripDeliveryProof.component.tsx` para de despejar produtos e ocorrências
  incondicionalmente nos três estados; eles passam a ser expansão.
- **RF8** Nada aqui custa requisição nova: é reorganização do que o card já recebe.
- **RF9** Em 375px os blocos ocupam a largura inteira, empilhados; nenhum dado sai da tela.
- **RF10** A **caixa de seleção** da nota fica em posição fixa e previsível — sempre no mesmo lugar
  em toda nota, como âncora de varredura vertical. Ela existe hoje
  (`TripDocumentSelectionController`, com marcação por nota e por parada, inclusive indeterminada),
  e a ação em massa já funciona (`TripDetail.component.tsx:656`), mas **a barra só aparece depois da
  primeira marcação** e a caixa se perde no meio do texto corrido: o operador não encontra a porta
  de entrada do recurso que já tem.
- **RF11** Com alguma nota marcada, fica evidente **quantas** estão marcadas e o que se pode fazer
  com elas — hoje a barra aparece, mas depois de o operador descobrir sozinho como chegar nela.
- **RF12** A marcação por parada continua marcando as notas daquela parada, com estado indeterminado
  quando só algumas estão marcadas. Isso já funciona e não pode regredir.
- **RF13** Textos em pt-BR e en.

## Requisitos não funcionais

- Área de toque de 44px nas expansões; contraste AA nos selos.
- Sem cor literal: tokens do design system.
- A expansão de um card não recarrega a lista nem fecha os outros.

## Casos extremos e falhas

- **Parada com muitas notas**: o card cresce, mas cada nota mantém a mesma estrutura — é a âncora do
  RF5 que permite varrer.
- **Nota sem ocorrência e sem produtos**: não oferece expansão vazia (mesma regra da spec 180 CA16).
- **Nota sem destinatário ou sem telefone**: o bloco de pessoas omite a linha, não mostra rótulo com
  valor vazio.
- **Devolução sem motivo**: o selo diz apenas "Devolvida", sem o sufixo.
- **Motivo sem tradução** (`migration` legado): cai no próprio código, como já foi decidido.

## Critérios de aceite

- **CA01** O card mostra endereço, horário e selos sem exigir leitura do parágrafo.
- **CA02** Nunca aparecem dois selos para a mesma condição de ocorrência.
- **CA03** A devolução mostra motivo junto do selo, traduzido.
- **CA04** Dinheiro e pessoas aparecem rotulados em blocos distintos.
- **CA05** O número da nota se distingue tipograficamente.
- **CA06** Produtos e ocorrências abrem sob demanda, com contagem no rótulo fechado.
- **CA07** Nota sem detalhe não oferece expansão.
- **CA08** Em 375px nada sai da tela e a área de toque é respeitada.
- **CA09** A caixa de seleção da nota fica no mesmo lugar em todas as notas, visível sem procurar.
- **CA10** Com nota marcada, vê-se quantas estão marcadas e o que fazer com elas.
- **CA11** A marcação por parada segue marcando as notas da parada, com estado indeterminado.
- **CA12** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — variação **B** escolhida pelo usuário em 23/09, entre três apresentadas em preview.
