# Feature 321 — Canhoto retido pelo cliente

## Problema e resultado

Em 10/11/2026 o Anderson pediu uma ocorrência para o caso em que **o cliente segura o canhoto** na entrega e **outro motorista
pode buscá-lo depois**, em outra viagem. Hoje o motorista só tem duas saídas ruins: entregar sem canhoto (cai em "canhoto
pendente" da 223, que não diz _por quê_ nem dá a quem cobrar) ou não dar baixa.

Regras do Anderson (10/11/2026): a ocorrência **nunca vai à SPANI** nem a contratante alguma; **abrir a ocorrência já libera** a
nota para outra viagem, **sem etapa da contratante**; a viagem nova **não leva o peso nem a dimensão** da nota, por configuração do
tipo; o motorista da viagem nova **finaliza coletando o canhoto**; o painel mostra uma **flag com tooltip** explicando o caso.

Resultado: o tipo **"Canhoto retido pelo cliente"** que (a) não gera aviso à contratante em canal algum, (b) mantém a entrega
concluída, (c) cria uma **coleta de canhoto** pendente que o escritório encaixa na viagem de outro motorista, e (d) resolve quando o
canhoto chega.

## Fora do escopo

- Qualquer aviso à contratante (e-mail, chat, grupo de WhatsApp) pela retenção ou pela coleta.
- Mudar a regra do canhoto obrigatório (218/223) ou a conferência (220/222).
- Desfazer a trava "entregue não migra" (`trip_documents_delivered_locks_release_check`): ver D4.
- Reentrega da mercadoria (a mercadoria foi entregue; só o papel volta). A 260 segue como está.
- Cobrança financeira por canhoto não devolvido; alerta de prazo (fase 2).

## Decisões

- **D1 — Tipo de ocorrência de nota, aberto pelo cadastro.** Reusa `company_occurrence_types`, o registro por nota
  (motorista, escritório e WhatsApp) e a aba Tipos. Nome "Canhoto retido pelo cliente", etapa `delivery`. Criado por cadastro/script
  de staging, **não** pelo catálogo de bootstrap (T0 §10). Modos: observação obrigatória, foto opcional, sem itens, valor nem
  localização; `duplicate_request_policy = until_resolved` (T0 §11).
- **D2 — Nunca vai à contratante, por contrato.** `emails_contractor = false` e sem modelo no tipo, mais **guarda no código**, porque os
  envios manuais não leem o tipo (T0 §4). Função pura `occurrenceTypeNeverNotifiesContractor(type)` lida por: e-mail automático
  (143/269/271), varredor do worker, envio/chat manual do escritório e, quando entrar, o canal de grupo da 318 (PR #646). A guarda
  é por **marca no tipo** (`blocks_contractor_notice`, boolean, padrão `false`), não por nome nem por id fixo. `notifies` **não** é o
  interruptor: a equipe interna continua avisada pela 275, e o CA diz "contratante".
- **D3 — A entrega vale como feita e a viagem de origem fecha.** A ocorrência não solta a linha entregue: a trava
  `trip_documents_delivered_locks_release_check` e o índice de vínculo vivo continuam (T0 §1).
- **D4 — A "liberação" é um vínculo de coleta, não uma segunda linha de `trip_documents`.** Registrar o tipo cria uma **coleta de
  canhoto** (`trip_canhoto_pickups`, tabela nova e aditiva): `company_id`, `nfe_document_id`, `origin_trip_document_id`,
  `occurrence_id`, `pickup_trip_id` e `pickup_stop_id` (nulos até o escritório encaixar), `status`
  (`pending | scheduled | collected | cancelled`), `collected_at`. O escritório encaixa a coleta na viagem de outro motorista, numa
  parada no endereço do cliente. Isto evita o que uma segunda linha viva faria: dobrar contagem, score e rateio de custo e mostrar a
  nota "em rota" de novo à contratante (T0 §9). **Alternativa descartada:** relaxar o CHECK de entregue (muda uma invariante que o
  código inteiro assume).
- **D4b — Quem finaliza é o motorista da viagem nova.** A coleta aparece na parada dele como "Coletar canhoto"; ele a conclui
  fotografando o canhoto. O casamento do canhoto (T0 §3) passa a considerar as coletas `scheduled` **dele** (conjunto novo,
  além das notas abertas da viagem), tanto na rotina do worker quanto no bot.
- **D4c — A viagem nova não soma peso nem dimensão (config do tipo).** Coluna `counts_cargo_on_pickup_trip` (boolean, padrão
  `true`; o tipo é cadastrado com `false`). Como a coleta **não** é linha de `trip_documents`, nenhum leitor de carga a soma por
  construção: o valor `false` é o comportamento natural. O valor `true` (somar na viagem nova) exige alterar os leitores listados em
  T0 §8 e fica **fora da fase 1**: o cadastro recusa `true` para tipo com coleta até lá. O seletor mostra o valor e o porquê.
- **D4d — Flag com tooltip no painel (Anderson).** "Coleta de canhoto" na linha da nota/parada da viagem nova e na nota de origem
  ("canhoto retido"), terceiro booleano derivado, no molde do `proofPending` (T0 §7). Tooltip: "Esta nota volta só para buscar o
  canhoto; peso e dimensão não entram na carga desta viagem." Texto no locale pt-BR e en, componentes padrão do design system.
- **D5 — Resolve ao chegar o canhoto.** Quando o canhoto da nota é fotografado na coleta e aprovado, a coleta vira `collected` e a
  ocorrência recebe o andamento `resolved` (266). Mudança de banco necessária e aditiva (T0 §6): `resolved` do tipo `system` passa a
  aceitar `pickup_id` como origem, nova frase fixa `canhoto_collected`; reprovar na conferência **reabre** a coleta (`scheduled`) e
  a ocorrência (`reopened` por `system` com `pickup_id`). Espelhar a frase nas três apps (contrato de paridade).
- **D6 — Marca de "aberta" única.** Ocorrência deste tipo **aberta** = coleta com `status` em `pending | scheduled`. Selo, lista
  (filtro por id do tipo, não por nome), duplicidade e a 266 usam essa mesma definição.
- **D7 — Quem registra e quem escolhe a viagem** (recomendações assumidas, ver Dúvidas): motorista (app e WhatsApp) e escritório
  registram; o **escritório** encaixa a coleta na viagem, pelo painel, com a viagem em qualquer estado não finalizado.

## Requisitos funcionais

- **RF1** — Tipo cadastrável com os modos de D1; `blocks_contractor_notice` e `counts_cargo_on_pickup_trip` editáveis na aba Tipos
  com os seletores padrão do painel.
- **RF2** — Registrar o tipo cria a ocorrência e a coleta `pending`, sem e-mail, sem mensagem à contratante, em nenhum canal (D2).
- **RF3** — A nota de origem mostra "canhoto retido"; a viagem de origem fecha normalmente.
- **RF4** — O escritório encaixa a coleta numa viagem de outro motorista; a parada aparece no app dele como "Coletar canhoto".
- **RF5** — A coleta não entra em peso, volume, dimensão, ocupação, planta nem excesso de peso da viagem nova (D4c); a lista de
  notas a mostra com a flag e o tooltip (D4d).
- **RF6** — Canhoto fotografado na coleta casa (worker e bot), a coleta vira `collected` e a ocorrência resolve; reprovado, reabre (D5).
- **RF7** — Contratante, relatórios e score não enxergam a coleta como nova entrega (T0 §9).

## Requisitos não funcionais

- Tudo aditivo: tabela e colunas novas com padrão que mantém o comportamento de hoje; sem migration destrutiva. Os CHECKs do
  andamento (266) são **relaxados** em migration própria, com rollback que recusa rodar com dado dependente.
- Publicação em etapas (ADR-0081 §9): painel tolerante → API → app do motorista.
- Nenhum CNPJ ou nome de contratante no código.

## Casos extremos e falhas

- Dois registros do tipo na mesma nota: recusados como duplicado enquanto a coleta estiver aberta (`until_resolved`).
- Canhoto chega antes de encaixar a coleta (cliente devolveu ao próprio motorista): a foto na viagem de origem resolve a coleta
  `pending`.
- Coleta encaixada em viagem que depois cancela: volta a `pending`.
- Viagem de coleta finalizada sem o canhoto: a coleta volta a `pending` e a ocorrência segue aberta.

## Critérios de aceite

- **CA01** Contrato: `blocks_contractor_notice` impede aviso à **contratante** nos quatro pontos de D2; teste falha se um ponto ignorar a marca.
- **CA02** Registrar o tipo numa nota de contratante com envio automático ligado não gera e-mail nem mensagem de grupo; a equipe
  interna ainda é avisada pela 275.
- **CA03** A viagem de origem fecha; a nota continua entregue; a linha de `trip_documents` não muda (CHECK de entregue intacto).
- **CA03b** Peso, volume e ocupação da viagem nova ficam iguais com a coleta encaixada.
- **CA03c** Flag e tooltip aparecem, em tema claro e escuro, no desktop e no celular.
- **CA04** Foto do canhoto pelo motorista da viagem nova resolve; reprovação reabre.
- **CA05** Em staging, prints da aba Tipos e da lista, comparados com outra tela do painel.

## Dúvidas

Decidido pelo Anderson em 10/11/2026: **opção A**. A "liberação" da nota é uma coleta de canhoto ligada à viagem nova (D4), e
não a nota entregue solta.

Assumidas pelas recomendações, a confirmar: a coleta também não avisa a contratante; motorista e escritório registram; o escritório
escolhe a viagem; a SPANI exigir o canhoto para pagar fica fora (fase 2); alerta de prazo na fase 2.
