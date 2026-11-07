# Feature 300 — O bot fala num padrão só

> Pedido do dono (Anderson) em 2026-11-06, depois de ver a lista "Qual parada?" no grupo de staging. O desenho de
> todas as conversas foi aprovado no mesmo dia ("ficou ótimo, vamos assim"): `conversas.html` nesta pasta é a
> referência visual e textual — abrir no navegador.
> Status: fechada em 2026-11-06. Nenhum `[NEEDS CLARIFICATION]` aberto.

## Specs do mesmo assunto (lidas contra o código em `origin/staging` `166c17a46`, 2026-11-06)

| Spec / ADR                                                | O que decidiu                                                                                                                      | Situação aqui                                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 294 RF17, RF25, RF28–RF31                                 | Parada pela nota e pelo cliente; pergunta de fora de ordem 1/2; evento repetido com menu por estado; bloco da parada; próxima rota | **Mantida a regra, troca o texto.** Nenhuma decisão de fluxo da 294 muda, exceto as listadas em RF8–RF12                               |
| 294 RF30                                                  | Distância e chegada prevista **só** com ponto compartilhado nesta viagem e pela estrada do OSRM                                    | **Mantida** e estendida à lista de paradas (RF4)                                                                                       |
| 286 RF7/RF9                                               | Falas do bot de comandos são nós `fala_*` do grafo raiz, editáveis; teste de arquitetura reprova texto literal em `sendText`       | **Usa.** Texto novo entra nas mesmas constantes e nós; nada de literal no envio. Republicar o grafo não apaga edição da empresa (T0.2) |
| 299                                                       | Lembretes do bot por etapa (aberta, 0/21 tasks)                                                                                    | **Herda o padrão.** As falas da 299 nascem no padrão desta spec (RF1–RF3); nada da 299 é implementado aqui                             |
| 223 RF8                                                   | Encerrar a viagem com nota aberta exige motivo; a nota fica sem baixa                                                              | **Mantida.** O texto diz quais ficaram sem baixa (RF11), nunca que "voltam ao escritório"                                              |
| Modal "Fora da rota sugerida" do app (commit `166c17a46`) | No app, a ordem da rota é sugestão; aviso em cobre                                                                                 | **Mesma voz** no bot: "Fora da rota sugerida", "Se achar melhor, pode…"                                                                |
| Memórias do dono                                          | Grupo mostra cliente e endereço; sem IA paga; nada de PII em log                                                                   | Mantidas                                                                                                                               |

## Problema e resultado

Cada fluxo do bot foi escrito numa época e fala de um jeito: a lista de paradas numera opções (1, 2, 3) que não são o
número da parada, não marca a próxima, repete o mesmo cliente sem distinguir onde fica e não tem mapa; a pergunta de
fora de ordem responde "Sim, a 7"; os "não entendi" variam; o link do mapa só mostra o ponto.

Resultado: todas as mensagens do bot ao motorista e ao atendente — grupo e conversa individual — seguem um padrão só
(RF1–RF3), e a lista de paradas passa a ajudar a decidir (RF4–RF7). O conteúdo de cada mensagem é o de `conversas.html`.

## Requisitos

### O padrão (vale para toda mensagem do bot ao motorista e ao atendente)

- **RF1 — Forma da mensagem.** Primeira linha: ícone + **título em negrito** dizendo do que se trata. Corpo. Opções
  `*N* - <ícone> <ação inteira>` ("Seguir para a _parada 7_", nunca "Sim, a 7"). Instrução de resposta em itálico no
  fim ("_Responda 1 ou 2._"). Próximo passo sempre na última linha: `➡️ _Próximo passo:_ …`.
- **RF2 — Bloco da parada, um só.** Toda parada mostrada em qualquer mensagem usa o mesmo bloco, nesta ordem, linha sem
  dado some: `*PARADA N de M*` (ou um cabeçalho do contexto: `👉 *PRÓXIMA DA ROTA · PARADA 3*`,
  `🚚 *VOCÊ ESCOLHEU · PARADA 7*`); `🧾 NF \`n\` · _cliente_`; `🏢 Contratante:`(onde já aparecia);`📍`bairro e
cidade (lista) ou endereço completo (bloco da parada, confirmação);`📦 volumes`; `📏 _km_ · ⏱️ _tempo_`;
`🗺️ _Como chegar:_ <link>`. Número da nota sempre em monoespaçado (crase), fácil de copiar.
- **RF3 — Destaque por citação.** A parada certa (próxima da rota, a em andamento, a do canhoto) vai em citação (`> `,
  barra verde no WhatsApp). Não existe sublinhado nem cor no WhatsApp; a citação é o destaque. A parada fora da ordem
  vai em citação também, com cabeçalho que diz que é a escolhida — os dois blocos lado a lado na pergunta.
- **RF3b — "Não entendi" é um só.** `🤔 *Não entendi.* <motivo>` seguido das opções de novo, por extenso
  ("Responda _1_ para seguir para a _parada 7_ ou _2_ para ir para a _parada 3_"), nunca só "Responda 1 ou 2".
- **RF3c — Desfechos curtos padronizados.** Descartado: `↩️ *Descartado.* Nada foi registrado.` Nada por enquanto:
  `👍 *Certo, nada foi registrado.*` + próximo passo. Recebido no comprovante: `✅ _Canhoto recebido._` /
  `👍 _Ok, sem a foto da mercadoria._` / `👍 _Anotado: <vínculo>._`.

### A lista de paradas

- **RF4 — Distância e tempo por parada** na lista, pela estrada (OSRM, **uma** consulta para a lista toda), da última
  localização compartilhada nesta viagem — a mesma origem do bloco da parada (294 RF30). Sem localização, a linha some e
  a lista termina com "📎 _Mande sua localização pelo clipe para ver distância e tempo._". OSRM fora do ar: a linha some
  em todas, a lista sai mesmo assim.
- **RF5 — A opção é o número da parada** (3, 4, 5…), o mesmo do app. Responder com o número da nota continua valendo.
  Número de parada que não está na lista: `🤔 *Não entendi.* Não achei a parada 12 nesta viagem.`
- **RF6 — A próxima da rota marcada**: primeira da lista, em citação, com `👉 *PARADA N de M* · _próxima da rota_`.
- **RF7 — Bairro e cidade** em cada parada da lista (endereço do destinatário da nota), em iniciais maiúsculas
  ("Centro, Sao Joaquim da Barra"); sem acento inventado — a nota não traz.
- **RF7b — "Como chegar"**: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` (abre a rota no Maps)
  substitui o link de busca (`/maps/search/`) em **todo** bloco. Parada sem coordenada: a linha some e o aviso de
  endereço sem localização certa que já existe aparece. Waze fica de fora (decisão do dono pode reabrir).

### Mudanças de comportamento aprovadas no desenho

- **RF8 — Menu do grupo ganha "↩️ Não entreguei"** (opção 4, ocorrência passa a 5), levando ao fluxo de devolução que
  hoje só abre pelo comando escrito.
- **RF9 — "Você já está a caminho da parada N"** deixa de ser só aviso: traz o bloco da parada e o menu
  _Cheguei na parada N / Abrir ocorrência / Nada por enquanto_ (o mesmo do "saí" repetido, 294 RF28).
- **RF10 — Contador do comprovante desde a primeira pergunta**: "_Faltam 3 itens: canhoto, foto da mercadoria e quem
  recebeu._", decrescendo ("_Falta 1 item._"). Hoje só aparece com mais de um item pendente no meio.
- **RF11 — Encerrar a rota diz quais notas ficam sem baixa**: na pergunta ("Ainda há _2 notas em aberto_: NF `a` e NF
  `b`") e no desfecho ("🏁 _Rota encerrada._ Ficaram sem baixa: NF `a` e NF `b`."). Nada muda no que o encerramento faz.
- **RF12 — Rota concluída se despede pelo nome**: "🏁 _Rota concluída!_ Todas as N paradas estão fechadas. Bom
  descanso, <primeiro nome>. 🌙" (nome do motorista da viagem; sem nome, sem a frase).
- **RF13 — "Quem recebeu" com ícone por opção e o cliente em citação** (desenho em `conversas.html` § 5).

### Fora do escopo

- Lógica dos fluxos além de RF8–RF12 (ordem, idempotência, validação, permissões, quem pode o quê).
- Emissão de NFS-e, menu do operador e verificação de telefone (outros textos, outro público).
- Lembretes da 299 (ela herda o padrão quando for implementada).
- Corrigir nome de cliente cortado em 40 caracteres: vem assim no XML do emitente (COMERCIAL ZARAGOZA, 156 de 2634
  notas em staging); a importação grava o nome inteiro quando ele vem inteiro (até 58).

## Critérios de aceite

1. Cada mensagem de `conversas.html` tem um contrato que compara o texto montado pelo bot, caractere a caractere, com o
   do desenho (dados de exemplo da fixture).
2. A lista de paradas de staging da viagem de 06/11 (paradas 3–7) sai como no desenho, com distância/tempo quando há
   ponto e sem a linha quando não há.
3. Nenhum texto literal novo em `sendText`/`sendMedia` (o contrato da 286 RF9 continua verde, sem exceção nova).
4. Republicar o grafo depois da troca dos `fala_*` não sobrescreve nó editado pela empresa (T0.2).
5. Grupo e conversa individual dizem o mesmo texto onde a mensagem existe nos dois.
