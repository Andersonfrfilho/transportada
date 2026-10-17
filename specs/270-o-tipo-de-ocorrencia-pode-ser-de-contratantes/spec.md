# Feature 270 — O tipo de ocorrência pode ser de contratantes

> Pedido do dono no chat de 2026-10-16. Decisão de arquitetura:
> [ADR-0107](../../docs/adr/0107-o-tipo-de-ocorrencia-tem-escopo-de-contratantes.md), que **emenda a ADR-0106 §2** (spec
> 269: "o tipo continua geral — não é restrito a uma contratante").
>
> ⚠️ **Ordem:** a 270 é implementada **depois da 269** (`work/spec-269`) e rebaseada sobre ela. As duas mexem no mesmo
> editor de tipos (aba Tipos de `/ocorrencias`), no mesmo `PUT /company-settings/occurrence-types` (schema `.strict()`) e
> no mesmo guarda de resposta do painel (`tripResponse.validation.ts`). Ver `plan.md` § Ordem com a 269.

## Specs do mesmo assunto (lidas contra o código em `origin/staging`, e79e26171, 2026-10-16)

| Spec      | O que já decidiu e esta spec **usa sem refazer** (ou emenda, quando dito)                                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 157       | O motorista lista os tipos por `GET /me/trips/current/occurrence-types` (`trip.report`), nunca pela rota de configuração. A lista de tipos de rua vem de `listFieldOccurrenceTypes`.                                                                                                                           |
| 218 / 219 | Exceção por contratante e por destinatário (`company_occurrence_type_contractor_overrides`, e a de destinatário), resolução em 3 camadas; a contratante da nota é a do **CNPJ do emitente** da NF-e. A 219 levou a exceção ao motorista: o retrato da viagem traz os tipos **efetivos por nota**.              |
| 241       | `items_mode` no tipo. Não muda.                                                                                                                                                                                                                                                                                |
| 242       | O `PUT` do editor de tipos é `.strict()`, e **campo ausente não altera** o valor guardado (RF2). O campo novo segue a mesma regra.                                                                                                                                                                             |
| 246       | Momentos do tipo (`company_occurrence_type_moments`: `separation`, `document`, `stop`, `office`); a guarda de momento em todo caso de uso que registra; o servidor **lê a contratante da nota** e cobra o efetivo. A guarda nova entra ao lado da de momento, nos mesmos pontos.                               |
| 247 / 248 | Colunas da exceção por contratante (`reference_number_mode`, `declared_amount_mode`, `contractor_reply_mode`…). Não mudam.                                                                                                                                                                                     |
| 255       | `icon_name` no tipo; o chip "Só: …" desta spec fica ao lado do ícone no catálogo.                                                                                                                                                                                                                              |
| 266       | O `active` do tipo esconde o tipo **para registrar**; ocorrência já registrada continua visível. O escopo segue a mesma regra.                                                                                                                                                                                 |
| 269       | (em `work/spec-269`, ainda não em `staging`) `contractor_mail_template_id`/`_selected_at` no tipo e na exceção por contratante; modelo efetivo = exceção ?? tipo. **ADR-0106 §2 dizia que o dono recusou o tipo restrito a contratante** — o dono mudou de ideia em 2026-10-16; a ADR-0107 emenda esse trecho. |

## Problema e resultado

Todo tipo de ocorrência vale para toda nota. A transportadora atende contratantes com combinados diferentes: um tipo que
só faz sentido para uma contratante (um procedimento dela, um documento que só ela pede) aparece para o motorista em
nota de qualquer outra, e nada impede registrá-lo ali. A exceção por contratante **ajusta** o tipo (foto, observação,
modelo de e-mail), mas não consegue **tirar** o tipo das outras.

**Resultado:** cada tipo diz para quem vale. **Geral** (todas as contratantes) é o comportamento de hoje e o padrão. **Só
destas contratantes** guarda uma lista escolhida num seletor das contratantes cadastradas. O app do motorista e o painel
oferecem o tipo só nas notas cuja contratante está na lista, e o servidor recusa o registro fora dela. A exceção por
contratante continua como está: **a exceção ajusta, o escopo restringe** — são dois conceitos.

## Requisitos funcionais

- **RF1 — Escopo do tipo.** Cada tipo tem um escopo de contratantes:
  - `all` ("Todas as contratantes"): padrão; todo tipo existente fica assim na migration;
  - `listed` ("Só estas contratantes"): uma lista de **ao menos uma** contratante da mesma empresa.

  `listed` com lista vazia é inválido (400). Trocar para `all` apaga a lista.

- **RF2 — O seletor é das contratantes cadastradas.** No editor do tipo (aba Tipos de `/ocorrencias`), "Vale para:
  ( ) Todas as contratantes ( ) Só estas contratantes" e, na segunda, um **seletor múltiplo** das contratantes
  cadastradas, com busca por nome e por CNPJ. Não há texto livre nem chip digitado à mão. É o mesmo componente de
  seleção de contratante que o painel já usa, estendido para múltiplo quando preciso (`plan.md` § Painel).
- **RF3 — O catálogo mostra o escopo.** Na lista da aba Tipos, o tipo `listed` mostra o chip "Só: ZARAGOZA, RIBER PET"
  (nomes curtos; com mais de 2, "Só: ZARAGOZA e mais 2", com a lista completa no título). O tipo `all` não ganha chip.
- **RF4 — Só o tipo da contratante é oferecido.** Onde o registro tem uma **nota**, o tipo `listed` só é oferecido se a
  contratante da nota está na lista:
  - app do motorista: os tipos por nota do retrato da viagem (`GET /me/trips/current`) e a lista de
    `GET /me/trips/current/occurrence-types` (sem parâmetro novo: no momento `document` só os `all`);
  - painel: o registro do escritório em nome do motorista, o lote do escritório, o registro do galpão (separação, por nota: `GET /trips/:tripId/documents/:documentId/occurrence-types`) e o
    WhatsApp (motorista e operador, pela contratante da nota do fluxo). **Recebimento de carga está fora**: seus tipos são
    seed-only e sempre `all`;
  - a **nota sem contratante identificada** (CNPJ do emitente fora do cadastro) recebe só os tipos `all`;
  - lista pedida **sem nota** (o catálogo de rua do motorista, usado também como reserva quando o retrato não traz os
    tipos da nota) traz só os tipos `all`: um tipo restrito nunca aparece por falta de contexto.

- **RF5 — A parada não tem contratante.** A ocorrência de parada (`trip_stop_occurrences`, momento `stop`) não tem nota e
  a parada pode ter notas de várias contratantes. Por isso o escopo **não se aplica** ao registro de parada: todo tipo
  ativo do momento `stop` é oferecido como hoje. Um tipo que só tem o momento `stop` não pode ser `listed` (400); no
  editor, o "Vale para" fica travado em "Todas as contratantes" com a frase "Na parada não há contratante: este tipo vale
  para todas". Um tipo com `stop` e `office`/`separation` (nunca `document`: a 246 proíbe `document`+`stop`) pode ser `listed`: o escopo vale nos registros com nota, e na
  parada ele vale para todas (o editor diz isso).
- **RF6 — O servidor cobra.** Registrar numa nota um tipo `listed` sem a contratante da nota na lista responde **422
  `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR`** e nada é gravado, em todo caso de uso que registra ocorrência de nota
  (motorista, escritório, lote do escritório, galpão, fluxo do WhatsApp do motorista e do operador). A resposta
  não traz a lista de contratantes do tipo. O `contractorId` que o cliente manda na query das listas nunca decide o
  escopo: o servidor lê a contratante da nota.
- **RF7 — A fila offline do motorista.** Um registro que entrou na fila **antes** de o tipo mudar de escopo e sobe depois
  é recusado com o mesmo código; o app mostra a recusa como as outras recusas da 246/266 ("recusada", com o motivo
  "Este tipo de ocorrência não vale para a contratante desta nota") e o motorista escolhe outro tipo.
- **RF8 — O que já foi registrado fica.** Ocorrência já registrada continua visível e editável (correção de itens da
  167/240, tratativa, conversa, feed, relatórios, linha do tempo) mesmo que o tipo passe a excluir a contratante da nota —
  o escopo vale **para registrar**, como o `active` (266).
- **RF9 — O escopo e a exceção convivem.** A exceção por contratante (`company_occurrence_type_contractor_overrides`)
  continua editável para qualquer contratante e com o mesmo efeito. Num tipo `listed`, o editor da exceção avisa quando a
  contratante da exceção **não** está na lista ("esta exceção não tem efeito enquanto o tipo não valer para esta
  contratante"), sem bloquear nem apagar a exceção.
- **RF10 — Contratante inativa.** Contratante não se apaga (só fica `inactive`, PATCH de status). Uma contratante
  inativa que está na lista continua na lista e o tipo continua valendo para as notas dela; o seletor a mostra marcada
  como "(inativa)" e permite tirá-la. A lista nunca fica vazia em silêncio (FK `RESTRICT`, `plan.md` D2).
- **RF11 — Todos os tipos de hoje passam a ser da Spani (passo de dados, depois da feature em produção).** Pedido do dono:
  depois da feature publicada, cada tipo existente vira `listed` com só a contratante "Spani". É um passo de **dados**, à
  parte, por ambiente (staging, depois produção), idempotente, feito por script revisado, com listagem antes/depois no
  `evidence.md` e **parada para o dono confirmar** o ambiente e a contratante encontrada. Detalhe e consequências em
  `plan.md` § Passo de dados.

## Requisitos não funcionais

- **Isolamento:** a lista só aceita contratantes da empresa do tipo (FK composta `company_id`); contratante de outra
  empresa no `PUT` → 404 do mesmo jeito que contratante inexistente, sem revelar existência. `companyId` vem do token.
- **Servidor decide:** o app e o painel nunca filtram tipos por escopo por conta própria; recebem a lista já filtrada da
  API e o servidor recobra no registro (RF6).
- **Sem N+1:** a lista de tipos por nota do retrato da viagem lê o escopo de todos os tipos em uma consulta.
- **Sem PII em log:** a recusa loga ids (tipo, nota, contratante), nunca nome nem CNPJ.
- **Publicação em etapas (ADR-0081 §9):** painel tolerante às chaves novas do tipo → API → tela nova do editor → passo
  de dados.

## Fora do escopo

- Escopo por **destinatário** (o dono recusou exceção por destinatário na 269; o escopo é só por contratante).
- Escopo na ocorrência de **parada** (RF5).
- Seção "Tipos exclusivos desta contratante" na ficha da contratante: a informação está no catálogo (RF3); fica para uma
  spec própria se o dono pedir.
- Mudar a exceção por contratante, a resolução de 3 camadas ou o modelo de e-mail (269).
- Criar a contratante "Spani" onde ela não existe (RF11 para e avisa).

## Critérios de aceite

1. Tipo novo nasce `all` e aparece para nota de qualquer contratante e para nota sem contratante identificada, como hoje.
2. O tipo "Procedimento ZARAGOZA" `listed` = [ZARAGOZA]: no retrato da viagem do motorista ele aparece na nota da
   ZARAGOZA e **não** aparece na nota da RIBER PET nem na nota sem contratante; no painel, o registro do escritório faz o
   mesmo.
3. `POST` de registro com esse tipo na nota da RIBER PET responde 422 `OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR` e
   nada é gravado (integração), em cada caso de uso de nota.
4. Registro na fila do app feito com o tipo `all`, o tipo vira `listed` sem aquela contratante, a fila sobe: o item fica
   "recusada" com o motivo do RF7.
5. Ocorrência registrada antes da troca continua no feed, no detalhe, na linha do tempo, no relatório e na rota do
   motorista (266) e aceita correção de itens.
6. `PUT` com `contractorScope: 'listed'` e lista vazia → 400; com contratante de outra empresa → 404; tipo só de parada com
   `listed` → 400; `PUT` sem as chaves novas não altera o escopo guardado (242 RF2).
7. O painel publicado antes da API continua abrindo a aba Tipos, o registro e o feed quando a API passa a mandar
   `contractorScope` e `contractors` no tipo.
8. O editor mostra o seletor múltiplo com busca por nome e CNPJ; salvar e recarregar mostra as mesmas contratantes e o
   chip do RF3.
9. Passo de dados (RF11), em cada ambiente e com o dono confirmando: o dry-run lista os tipos e a contratante encontrada;
   com exatamente uma "Spani", o `--confirm` deixa todo tipo de nota `listed` = [Spani]; rodar de novo não muda nada; sem
   Spani (ou com mais de uma), o script para sem gravar e diz o que encontrou.
