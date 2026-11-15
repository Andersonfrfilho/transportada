# Feature 340 — Portal de entregas do contratante e do destinatário

> Status: **rascunho para revisão** (design, sem código). Pedido do Anderson em 15/11/2026. Relacionadas: 063 (portal do
> cliente), ADR-0050 (portal em app separada), 164/183/263 (ocorrência e conversa no portal), 339 (pedido de coleta),
> 338 (orçamento público, reservada), 316 (vendedor), 060 (hora e preço do cliente).
> Numeração: 338 está reservada e a 339 já existe; esta é a **340**.

## Problema e resultado

O Anderson quer uma página onde o **contratante** (quem paga o frete) e o **cliente** (destinatário da nota) entram e
veem as entregas deles: status, horário estimado, conversa com o escritório quando dá problema, ocorrências levadas até
eles, relatórios que importam e os pontos de eventos no mapa.

## O que já existe (e será reaproveitado)

Conferido em `apps/frontend-client`, `apps/api-transportada/src/contractor-portal` e `occurrence-conversation`:

| Pedido                    | Hoje                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrar                    | **Só o contratante**, pelo Keycloak (convite, papel `contractor`, vínculo em `contractor_portal_bindings`). Tela de identificação antes do login já existe. |
| Entregas, status, horário | `GET /client/me/deliveries`: nota, status da viagem, `estimatedArrivalAt`, `deliveredAt`, motivo de devolução. Lista com agendamento (060).                 |
| Mapa                      | `DeliveryMap` em SVG com a posição ao vivo (ADR-0050 §5: consentimento do motorista, rastro morre com a viagem, sem nome nem placa).                        |
| Ocorrências e chat        | Lista, decisão (`DecisionForm`) e conversa com a transportadora **por ocorrência** (183/263). Não há conversa sobre a entrega sem ocorrência.               |
| Cobrança                  | Lotes de taxa extra para o contratante decidir (`/client/me/extra-charge-batches`).                                                                         |

**O que não existe:** (1) acesso do **destinatário** — a 063 D6 prometia, mas o portal construído só vincula contratante;
(2) **linha do tempo e pontos de eventos** no mapa (hoje só um ponto vivo); (3) **chat da entrega** sem precisar de
ocorrência; (4) **relatórios**; (5) tela inicial com resumo.

## Fora do escopo

Pedir coleta/entrega (339), orçamento (338), rastreio ao vivo novo (já existe), qualquer função de operação, ver custo,
margem, motorista ou placa.

## Decisões propostas

- **D1 — Mesma app, dois perfis.** Continua `apps/frontend-client` (a separação da ADR-0050 é entre painel interno e
  externos, não entre contratante e destinatário). O perfil vem do vínculo: `contractor` ou `recipient`. Quem tem os dois
  vê duas abas (063, casos extremos).
- **D2 — Vínculo do destinatário por documento da nota.** Tabela nova `recipient_portal_bindings` (membership → cliente
  de entrega, `company_id` nas duas FKs, mesmo desenho do vínculo do contratante). O recorte é o destinatário das notas.
  Administrar o vínculo é `users.manage`, com papel novo `recipient` e permissões `deliveries.track` e `occurrences.talk`
  (sem `charges.decide`: destinatário não decide dinheiro).
- **D3 — Nenhuma rota recebe id interno** (ADR-0050 §4). Tudo por chave de acesso ou `public_ref`; chave de outro,
  inexistente e sem viagem respondem igual. Contrato por texto de fonte confere que o recorte vem só de
  `resolveContractorScope` / `resolveRecipientScope`.
- **D4 — Linha do tempo da entrega.** `GET /client/me/deliveries/:accessKey/events`: lista fechada de marcos já gravados
  (nota importada, separada, saiu para entrega, chegou na parada, entregue, devolvida, ocorrência aberta/resolvida), com
  hora e, quando houver, coordenada **da parada** (nunca do motorista no caminho). Serializador próprio, com contrato de
  campos proibidos.
- **D5 — Mapa de eventos.** O `DeliveryMap` ganha pontos: origem (cidade), parada de destino, chegada, ocorrência,
  entrega. Continua desenho em SVG, zero terceiro. Posição ao vivo segue com as três guardas da ADR-0050.
- **D6 — Chat da entrega.** Conversa "Falar com o escritório" por nota, reutilizando `ParticipantConversations` e o
  serializador da 183 (sem nome nem telefone de motorista ou funcionário). **Decisão pendente** (ver Dúvidas): estender a
  conversa de ocorrência ou criar assunto "entrega". Aviso de mensagem nova por e-mail sem o corpo, como hoje.
- **D7 — Ocorrências.** Reaproveita a lista e a conversa atuais. O destinatário vê ocorrência e conversa só das notas dele;
  `DecisionForm` (decidir reposição/pagamento) segue **só do contratante**.
- **D8 — Relatórios.** Todos calculados no servidor, só do recorte, com exportação CSV. Contratante: entregas por período
  e situação, no prazo vs atrasadas (previsto × entregue), ocorrências por tipo, devoluções e motivos, canhotos pendentes,
  taxas extras decididas. Destinatário: recebimentos do período, pendentes, ocorrências abertas, comprovantes.
  Nenhum relatório traz frete, custo ou margem.
- **D9 — Tela inicial.** Resumo (a caminho, atrasadas, com ocorrência aberta, entregues na semana) e atalho para cada.
- **D10 — Padrão visual.** Esta app **não tem design system** (CLAUDE.md da app). Tela nova de relatório e filtros pede
  decisão por escrito: seguir o CSS próprio atual (recomendado, menor risco) ou adotar o design system do painel (ADR
  nova). Prints claro/escuro, desktop/celular em qualquer caso.
- **D11 — Aviso ao entrar em rota ou ser entregue** (063 P3): fora desta spec; entra depois sobre a 286/309.

## Histórias

- **H1** Contratante/destinatário entra e vê o resumo e a lista das entregas, com status e horário estimado.
- **H2** Abre uma entrega: linha do tempo e mapa com os pontos dos eventos.
- **H3** Quando dá problema, fala com o escritório na própria entrega e acompanha as ocorrências.
- **H4** Abre relatórios, filtra por período e exporta CSV.
- **H5** O escritório vincula o destinatário ao acesso no painel.

## Requisitos

- **RF1** Destinatário: vínculo, papel, escopo e rotas `/client/me/*` com o mesmo recorte (CA: conta sem vínculo é `403`).
- **RF2** Eventos (D4) e pontos no mapa (D5), com contrato de campos proibidos (motorista, placa, valor, trajeto).
- **RF3** Chat da entrega (D6) com anexo e áudio como na 183; `Permissions-Policy` inalterada.
- **RF4** Relatórios (D8) e CSV, escapando fórmulas (`=`, `+`, `-`, `@`).
- **RF5** Resumo inicial (D9).
- **RF6** Isolamento multiempresa e entre contratantes/destinatários, com contrato negativo.
- **RF7** Texto em `*.locale.json`; nada de dado pessoal em log.

## Critérios de aceite

- **CA01** Destinatário vê só as notas dele; outra nota responde igual a inexistente.
- **CA02** Payload de eventos não contém motorista, placa, valor nem trajeto (teste falha se aparecer).
- **CA03** Mensagem do cliente chega ao painel e a resposta aparece no portal sem dado do funcionário.
- **CA04** Relatório bate com a lista (mesma contagem) e o CSV não executa fórmula.
- **CA05** Prints claro/escuro, desktop/celular de resumo, entrega com mapa, chat e relatórios.

## Dúvidas (para o Anderson)

1. **Como o destinatário entra?** (a) convite Keycloak como o contratante (recomendado: já existe e é seguro), ou (b) código
   de uso único pelo documento (063 D2; a 339 supõe isso, mas não foi construído e exige muito cuidado contra enumeração).
2. **Chat da entrega:** estender a conversa de ocorrência com assunto "entrega" (recomendado) ou conversa nova separada?
3. **Quanto do rastro o cliente vê?** Só os marcos e a posição ao vivo atual (recomendado) ou também o trajeto percorrido?
4. **Relatórios:** a lista do D8 serve, ou há algum que o contratante já pede (ex.: canhotos, tempo de entrega por cidade)?
5. **Visual:** manter o CSS próprio da app (recomendado) ou levar o design system do painel para o portal?
