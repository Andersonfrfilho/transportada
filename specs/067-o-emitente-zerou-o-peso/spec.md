# Feature 067 — O emitente zerou o peso

## Problema e resultado

A NF-e 883663/2 da Zaragoza chegou autorizada, com valor, participantes e municípios completos,
e com o bloco de volume assim:

```xml
<vol><qVol>20</qVol><pesoL>0.000</pesoL><pesoB>0.000</pesoB></vol>
```

Vinte volumes, peso zero. O emitente declarou o volume e não declarou a massa — caso comum em
atacado, e nada que a transportadora possa corrigir na origem: o XML é preservado e assinado por
terceiro.

Hoje essa nota é **inelegível para os dois documentos de saída**. `checkDocumentEligibility`
(`cte-batches/domain/cte-batch-eligibility.policy.ts:113`) exige peso bruto positivo, e
`nfse-selection.policy.ts:107` chama **a mesma função** — a NFS-e herdou o gate do CT-e. O
resultado é que uma carga realmente transportada não pode ser cobrada por nenhum dos dois
caminhos, e o operador vê "Sem peso da carga" sem nada que possa fazer a respeito.

As duas metades do problema são diferentes, e é por isso que a solução não é uma só:

- **A NFS-e não usa peso.** Varredura em `nfse-invoices/domain/` e `worker/nfse-issuance/`: zero
  ocorrências. O RPS da Nota RP leva valor, descrição, tomador, endereço e alíquota. O gate ali
  bloqueia por um dado que nunca sai no documento.
- **O CT-e usa.** O peso vira `infQ/qCarga` (`cte-issuance/domain/cte-cargo.service.ts:89`) no XML
  assinado e transmitido à SEFAZ, e é base da tabela de frete por peso. Inventar valor default aqui
  é declaração falsa num documento arquivado, além de cobrança errada.

Ao fim desta feature: a NFS-e emite para essa nota sem cerimônia, e o CT-e emite **com o peso que
a transportadora declarar** — quem carrega o caminhão sabe a massa, e é ela a emitente do CT-e.

## Entrega em duas metades

A metade da NFS-e (P1) **não depende de nenhuma das dúvidas abertas** — as três são do lado do
CT-e — e é a que está barrando emissão hoje. Ela entrega sozinha, primeiro. A metade do CT-e
(P2 a P4) espera as respostas. Ver as duas fases em `tasks.md`.

## Fora do escopo

- Alterar o XML preservado da NF-e. Ele é imutável, sempre.
- Peso estimado automático para CT-e (peso médio da empresa, peso por produto, peso por NCM).
  O roteirizador tem estimativa marcada porque erra num roteiro; o CT-e erra numa declaração fiscal.
- Rever os outros gates (`missingTotal`, `missingParty`, `missingMunicipality`, `summaryOnly`).
- Peso no MDF-e, que soma pelos CT-es e herda o resultado desta feature sem mudança própria.
- **Aprender o peso do histórico da empresa** (kg por caixa derivado das notas que têm peso).
  Considerado e descartado em 2026-08-31: o XML não traz peso por item — `pesoB` só existe
  agregado no bloco `<vol>` —, então uma nota com cinco produtos são cinco incógnitas e uma
  equação. Só notas de um produto só ensinariam algo exato, e a cobertura nasceria parcial,
  exigindo o peso padrão como reserva de qualquer jeito. O padrão sozinho resolve o caso pelo
  qual a feature existe.

## Histórias priorizadas

### P1 — A NFS-e não pergunta o peso

**Given** uma NF-e autorizada, completa, com valor, participantes e municípios, e peso bruto zero
**When** o operador a seleciona para emissão de NFS-e
**Then** ela é elegível, e nenhum bloqueio de peso aparece

### P2 — A empresa configura o peso padrão por volume

**Given** um operador com permissão de configuração
**When** ele define o peso padrão por volume da empresa (kg por volume)
**Then** o valor fica gravado por empresa, com autor e data, e passa a valer para toda nota que
chegar sem peso

### P3 — O CT-e emite com o peso estimado, e ele sai marcado

**Given** a nota 883663/2, sem peso no XML e com `qVol` 20, e a empresa com peso padrão configurado
**When** ela é selecionada para lote de CT-e
**Then** ela é elegível, o peso usado é `qVol × peso padrão`, o `infQ` de peso bruto sai com esse
valor, e a tela mostra **antes da emissão** que aquele peso é estimado, não lido da nota

### P4 — O operador vê por que a nota está travada, e o que fazer

**Given** uma nota bloqueada por peso na tabela de Notas
**When** o operador olha a linha
**Then** o motivo continua legível, e existe a ação de informar o peso a partir dali

## Requisitos funcionais

- **RF01** — A elegibilidade deixa de ser uma função só. `checkDocumentEligibility` se separa nos
  gates comuns aos dois documentos (autorizada, completa, valor, participantes, municípios) e no
  gate de peso, que passa a valer **só para CT-e**.
- **RF02** — `NFSE_SELECTION_BLOCK_REASON` deixa de poder produzir `CTE_BATCH_DOCUMENT_MISSING_WEIGHT`.
  O vocabulário compartilhado continua (a nota de `nfse-selection.policy.ts:22` segue valendo para
  os demais motivos), mas o peso sai dele.
- **RF03** — Nasce o **peso padrão por volume**, configurado por empresa: valor em `numeric`
  estritamente positivo, unidade kg por volume. Ele **não é constante no código** — o produto é
  genérico (ADR-0021), e um número fixo seria a regra de uma transportadora dentro do produto de
  todas. Empresa sem peso padrão configurado não estima nada.
- **RF04** — O peso efetivo de uma nota é, nesta ordem:
  1. a soma de `nfe_volumes.gross_weight`, quando positiva — o que o emitente declarou;
  2. `qVol × peso padrão da empresa`, quando o padrão existe e a nota traz quantidade de volumes;
  3. ausência — e aí o bloqueio de peso continua valendo.
     Essa resolução mora num lugar só e devolve **valor + origem** (`xml` | `estimated`).
- **RF05** — Peso estimado é **sempre marcado**, em toda superfície que o mostra: na tabela de
  Notas, na prévia do lote e no detalhe do CT-e. O operador precisa saber antes de emitir que
  aquele número não veio da nota — é o mesmo contrato do roteirizador com `weightEstimated`
  (ADR-0044 §5), e pela mesma razão.
- **RF06** — A origem do peso é **congelada no payload** do CT-e, junto do resto. Auditoria seis
  meses depois precisa saber se aquele `infQ` foi lido ou estimado, e o payload é o que sobrevive.
- **RF07** — Configurar o peso padrão exige `settings.manage`, escopo `company`, e o painel mora
  na tela onde o efeito aparece — junto da emissão, não numa tela de configurações que cresce sem
  fim.
- **RF08** — Mudar o peso padrão **não recalcula** CT-e já emitido nem frete já apurado. O payload
  congelado é a verdade do que foi transmitido.
- **RF09** — Nota com `qVol` zero **e** peso zero continua bloqueada: sem quantidade de volumes não
  há de onde estimar, e um peso fixo por nota seria uma segunda regra de peso.

## Requisitos não funcionais

- A resolução do peso efetivo é **uma consulta por página**, ao lado da soma de volumes que já
  existe em `loadBlockContext` — nunca uma por linha.
- Nenhum caminho novo lê ou grava fora do `companyId` do contexto autenticado.
- O XML preservado não é lido nem reescrito por esta feature.

## Casos extremos e falhas

- **Nota com peso no XML**: o XML vence, sempre. A estimativa só entra na ausência.
- **⚠️ Risco assumido: o peso estimado é declaração fiscal.** O `infQ` transmitido à SEFAZ passa a
  conter um número que a transportadora calculou, não que ela pesou. Se ele divergir muito da carga
  real, é a transportadora que responde — a nota do emitente não a protege, porque o CT-e é
  documento dela. Mitigações desta spec: o padrão é por empresa (quem configura assume), a origem
  fica congelada no payload, e a marca de estimado aparece antes da emissão.
- **Peso padrão mal configurado** (ordem de grandeza errada): não há como o sistema saber. A tela
  mostra o peso resultante da estimativa antes do aceite do lote, que é o único momento em que um
  humano pode notar.
- **Nota sem peso, com `qVol` zero**: continua bloqueada com `CTE_BATCH_DOCUMENT_MISSING_WEIGHT`.
- **Empresa sem peso padrão**: mesma coisa. A estimativa é opt-in por configuração.
- **Peso padrão alterado entre a prévia e a emissão**: vale o do momento em que o payload congela,
  e é ele que fica registrado.
- **Peso declarado maior que a capacidade do veículo da viagem**: fora do escopo aqui; quem avisa
  disso é o roteirizador, e ele passa a ler peso real onde antes estimava.
- **Nota já emitida como NFS-e**: o vínculo continua sendo o bloqueio, não o peso.

## Critérios de aceite

- [ ] Uma NF-e autorizada e completa com `pesoB` zero é **elegível para NFS-e**, com teste de
      contrato usando exatamente o caso 883663/2.
- [ ] A mesma nota continua **inelegível para CT-e** enquanto não houver peso declarado.
- [ ] Declarado o peso, ela vira elegível para CT-e, e o `infQ` de peso bruto do payload sai com o
      valor declarado.
- [ ] `NfseSelectionBlockReason` não admite mais o motivo de peso — provado por tipo e por contrato.
- [ ] A declaração é append-only: duas declarações seguidas deixam duas linhas, e a leitura devolve
      a última.
- [ ] Contrato de isolamento multiempresa para a tabela nova, em `test/*-schema/tenant-safety.contract.ts`.
- [ ] Migration com `rollback.sql` ao lado, e `make migration-test` verde.

## Dúvidas

Nenhuma aberta. As três originais foram decididas em 2026-08-31 pelo dono do produto: o CT-e emite
com peso estimado; o peso estimado não alimenta frete por faixa de peso; instalação nova nasce sem
peso padrão configurado.
