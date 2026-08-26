# 065 — O caminhão sai antes do documento, e o motorista leva o romaneio

> **Emenda a 059** (o portão da emissão e a prontidão) e a **061** (receita prevista na montagem).
> Depende da **056** (paradas e estados) e da **057** (a viagem no bolso do motorista).

## Problema e resultado

A ordem real da operação é esta, e ela não é a que o produto assume:

```
NF-e chegam da SEFAZ
      ↓
mercadoria chega ao barracão
      ↓
separação  →  rotas  →  MOTORISTA SAI NA RUA        ← sem documento fiscal nenhum
      ↓
lote de CT-e, autorizado pela contratante
      ↓
NFS-e das entregas no município da transportadora
      ↓
MDF-e  ← emitido sozinho, assim que passa a ser possível
```

Uma viagem carrega **entregas da mesma cidade e de outras ao mesmo tempo**. Isso não é caso extremo:
é a carga de todo dia, e é o que faz os dois defeitos abaixo se somarem em vez de se anularem.

**O caminhão sai antes de qualquer emissão.** O CT-e é emitido depois, por lote inteiro, e só quando a
contratante autoriza — não é escolha do barracão, é o combinado comercial. A NFS-e das entregas
urbanas sai no mesmo momento. O MDF-e, por consequência, nasce por último.

O produto hoje assume o contrário em dois lugares, e os dois são defeito, não funcionalidade faltando:

1. **O portão da emissão exige a viagem em `dispatched` exato** (spec 059). Quando o lote é
   autorizado, a viagem já está `in_transit` ou `completed` — e o portão recusa o caso normal.
2. **A prontidão só conhece CT-e.** Entrega dentro do município da transportadora vira NFS-e e nunca
   terá CT-e: a nota ficaria `no_cte` para sempre, e uma carga mista travaria a viagem inteira.

E fica um vazio operacional que ninguém preenche: **entre a saída do caminhão e a autorização do
MDF-e, o motorista não tem o que mostrar** — nem para conferir a carga, nem para a portaria do
cliente, nem para si mesmo.

**Resultado:** o motorista sai com um romaneio da carga na mão desde o despacho; quando o lote é
autorizado e os documentos saem, a viagem sabe sozinha se pode manifestar; e o DAMDFE substitui o
romaneio no mesmo lugar da tela.

## Fora do escopo

- **Mudar a emissão** de CT-e, de NFS-e ou de MDF-e. As três funcionam.
- **A autorização da contratante** sobre o lote — `batches.approve` já existe e não é tocado aqui.
- **Precificar frete.** `freight_rules` continua dona; o que nasce é uma dimensão de filtro dela.
- **NFS-e fora de Ribeirão Preto.** O provedor `notarp` é municipal; outra cidade é spec própria.
- **Encerramento do MDF-e** — dívida registrada na 059.

## Decisões

### D1 — O romaneio é da carga, e ele **não é documento fiscal** — a tela diz isso

Entre o despacho e o MDF-e o motorista precisa de algo na mão. Esse algo é o **romaneio de carga**:
veículo, condutor, paradas na ordem, e por parada as notas com chave, número, destinatário, município,
volumes e peso. Ele nasce no despacho, do que a viagem já sabe, e **não emite nada em lugar nenhum**.

Vocês o chamam de "pré-MDF-e", e o nome descreve bem o momento dele. Mas **na tela ele não pode se
chamar assim**, e essa é a decisão:

> Um papel intitulado "pré-MDF-e", com veículo, condutor e lista de notas, **parece um DAMDFE**. Numa
> barreira, parecer é o bastante para alguém apresentá-lo — e apresentar documento que imita fiscal e
> não é vale mais caro do que não apresentar nada. Ele se chama **"Romaneio de carga"**, e carrega,
> visível e junto do título, **"não é documento fiscal"**.

O romaneio existe do despacho até o MDF-e ser autorizado. Depois disso o DAMDFE toma o lugar dele **no
mesmo ponto da tela** — o motorista não aprende dois lugares.

### D1b — A entrega urbana não tem MDF-e nem CT-e, então quem documenta a carga é a NF-e

Confirmado com a operação: transporte dentro do município **não exige MDF-e**. A consequência é que,
para essa parte da carga, não existe CT-e nem manifesto — **a NF-e é o único documento**, e ela
precisa estar na mão do motorista.

Então o romaneio não é só uma lista: por parada, cada nota abre com **número, série, chave por
extenso e o código de barras da chave**, mais destinatário, município, volumes, peso e valor. É com a
chave que um fiscal consulta no portal e é com ela que a portaria do cliente confere.

**O que isto não é:** substituto da DANFE impressa. A DANFE que acompanha a mercadoria é a que o
emitente imprimiu e mandou junto com a carga — ela continua viajando na caixa. O que está no celular
é a **cópia digital para conferência e consulta**, e a tela diz isso com essas palavras.

> **Custo declarado:** gerar a DANFE em PDF é possível — as engrenagens do DACTE (renderizador de PDF
> e gerador de código de barras) já existem e serviriam —, mas é trabalho próprio, de layout inteiro
> e campo a campo. Chave e código de barras resolvem consulta e conferência **hoje**; a DANFE
> renderizada é spec separada, com o custo dela declarado, e não entra aqui.

### D2 — O portão da emissão aceita a carga que já saiu, não só a que está saindo

A garantia que o portão protege é: *depois de `dispatched` nenhuma nota entra ou sai, então o conjunto
declarado no manifesto não pode mudar por baixo dele* (ADR-0043 §2). Essa garantia vale para
`dispatched`, `in_transit` **e** `completed` — todas são "a carga já saiu".

Exigir `dispatched` exato, como a 059 faz hoje, recusa justamente o caso normal desta operação: o lote
é autorizado com o caminhão na rua ou já de volta. O predicado certo já existe no domínio —
`isTripDispatched()` (spec 056) — e é ele que passa a valer.

O que continua recusado é o oposto: manifestar carga que **ainda não saiu**, porque aí a nota
undécima ainda pode entrar.

### D2b — O MDF-e se emite sozinho assim que passa a ser possível

O gatilho é a autorização do último CT-e **que a viagem espera** — e "que ela espera" é a parte que
importa numa carga mista: as notas de entrega urbana nunca terão CT-e, então esperar por elas é
esperar para sempre. Quem responde "já dá?" é a prontidão corrigida da D4, não a contagem de notas.

`automatic_mdfe_on_completion` continua **desligado por padrão** para empresa nova — a ADR-0046 §3
está certa, emissão fiscal automática é ação irreversível contra órgão público e ninguém deve ligá-la
pelo cliente. O que muda é que, para esta operação, ela é o caminho normal e não a exceção: aqui a
emissão manual é o contorno de quando o automático não pôde.

E **falha de emissão automática nunca é silenciosa**: certificado vencido, mais de 50 municípios,
manifesto já vivo — cada um vira notificação e fica visível na viagem, com o motivo. Um automático que
não age e não avisa é pior do que não existir, porque ninguém está mais olhando.

### D3 — Quem decide o documento é o município de entrega

| Entrega                     | Documento | Imposto |
| --------------------------- | --------- | ------- |
| No município da empresa     | NFS-e     | ISS     |
| Em qualquer outro município | CT-e      | ICMS    |

Comparação por **código IBGE**, nunca por nome — "Ribeirão Preto", "RIBEIRAO PRETO" e "Rib. Preto" são
a mesma cidade e três strings diferentes.

> ⚠️ **Ressalva registrada, e é escolha consciente do mantenedor.** A regra fiscalmente completa é o
> **par origem→destino**: transporte é municipal quando começa e termina no mesmo município. "Destino =
> município da empresa" coincide com ela enquanto a coleta for em Ribeirão — que é a operação de hoje.
> Havendo coleta em outra cidade com entrega em Ribeirão, o trajeto é intermunicipal e o documento
> correto é **CT-e**. A implementação deixa o município de origem lido e comparável, e a troca é uma
> condição num arquivo só (`resolveFiscalDocumentKind`).

### D4 — A nota de NFS-e não entra no manifesto e não pode bloqueá-lo

**Carga mista é o caso normal**, não a exceção: a mesma viagem entrega em Ribeirão e em Sertãozinho.
O MDF-e declara **CT-e**; nota de transporte municipal, documentada por NFS-e, não vai dentro dele.

| Nota                   | Espera | Situação                        |
| ---------------------- | ------ | ------------------------------- |
| entrega em Sertãozinho | CT-e   | autorizado → conta no manifesto |
| entrega em Sertãozinho | CT-e   | em lote → **bloqueia**          |
| entrega em Ribeirão    | NFS-e  | autorizada → fora do manifesto  |
| entrega em Ribeirão    | NFS-e  | não emitida → **não bloqueia**  |

A última linha é a menos óbvia e a que mais importa: a NFS-e é receita e é obrigação, mas **não é
condição do manifesto**. Ela aparece como pendência da viagem, em lugar próprio.

E **viagem cujas entregas são todas urbanas não tem MDF-e**: ela é `not_applicable`, não "incompleta".
Ficar incompleta para sempre é como uma viagem some da lista sem ninguém entender.

### D4b — A viagem **não** emite nada: ela anuncia o que já saiu vinculado

A emissão continua sendo do escritório, pelo caminho que já existe — lote de CT-e que a contratante
autoriza, lote de NFS-e das entregas urbanas. **A viagem não gera nenhum dos dois**, e não deve: quem
decide quando emitir é o combinado comercial, não o barracão.

O que a viagem faz é **sinalizar**. Na listagem de notas e na composição do lote, cada nota diz a
viagem em que ela saiu — as de NF-e urbana e as de CT-e, sem distinção. É a informação que hoje falta
na hora de montar o lote: **fatura-se o que saiu**, e quem monta o lote precisa saber o que saiu sem
abrir a tela de viagem para conferir uma por uma.

É sinal, não bloqueio. Nota vinculada a viagem **deve** entrar no lote — é justamente a carga que
rodou. Transformar isso em impedimento inverteria o sentido da informação.

### D4c — A viagem pode dizer que não precisa de manifesto, e dizer por quê

A classificação da D4 acerta o caso geral: viagem com nota de fora precisa de MDF-e, viagem só urbana
não. Mas a realidade tem canto que a regra não cobre — e uma regra sem escape vira contorno em papel.

Então `trips.requires_mdfe` nasce com **três estados**, e não dois:

| Valor    | Significado                                                              |
| -------- | ------------------------------------------------------------------------ |
| `null`   | **derivado** da classificação — é o padrão, e é o que acerta quase sempre |
| `true`   | o operador afirma que precisa                                            |
| `false`  | o operador afirma que não precisa                                        |

O padrão é `null` de propósito: um campo obrigatório aqui faria o operador responder toda viagem a uma
pergunta que o sistema já sabe responder, e responder no automático — que é como se erra.

Duas guardas, e a primeira é a que importa:

- **Forçar `false` numa viagem que tem nota de CT-e exige motivo escrito, e ele fica na trilha.** É o
  caso perigoso: carga intermunicipal circulando sem manifesto é multa e retenção em barreira. O
  produto não impede — a operação tem razões que ele não conhece —, mas não deixa acontecer calado. É
  o mesmo desenho do motivo obrigatório do despacho forçado, que já existe.
- **Forçar `true` numa viagem sem nota de CT-e é recusado.** Não existe manifesto vazio, e a viagem
  ficaria esperando para sempre por um documento que nunca vai ter o que declarar.

### D5 — A prontidão é informativa até o lote existir, e cobrança depois

A carga circula sem documento por decisão comercial, não por atraso. Uma tela que pinta "10 notas sem
CT-e" de vermelho durante a separação — e durante a viagem inteira — está gritando sobre o que é
normal, e o operador aprende a ignorar o vermelho. Aí ele ignora também o que importa.

Então a prontidão tem dois tons:

- **Antes de existir lote para as notas da viagem**: informativa. "Nenhum documento emitido ainda" com
  a contagem, sem alarme.
- **Depois que o lote existe**: cobrança. Aqui a nota sem CT-e autorizado é pendência de verdade —
  alguém começou a emitir e parou no meio.

### D6 — A parametrização de frete ganha município

Hoje o filtro da regra é `destinationStates` + `senderTaxIds`. Sem dimensão de município não há como
precificar a entrega urbana — que é justamente a que tem outro documento, outro imposto e outra margem.

Nasce `destinationCityCodes` (IBGE), no mesmo desenho: lista vazia é "toda cidade", e a regra mais
específica vence. **O tipo de documento não é parâmetro** — ele decorre da D3. Deixar configurar "esta
cidade emite CT-e" seria deixar configurar algo fiscalmente errado.

### D7 — Na montagem, a viagem diz quanto rende e quanto custa — e diz que é previsão

Como o caminhão sai antes de qualquer emissão, na montagem **não existe receita realizada**: existe
receita prevista, pelos mesmos parâmetros que gerariam o documento, sem gerar documento nenhum.

Isto emenda a **D1 da 061** ("receita é o CT-e autorizado, e nada mais"). As duas convivem porque são
números com propósitos diferentes, e a 061 já tem o vocabulário para separá-los:

| Momento            | Receita                | `source`    | Para quê                        |
| ------------------ | ---------------------- | ----------- | ------------------------------- |
| Viagem aberta      | parâmetros de frete    | `estimated` | decidir se vale montar a viagem |
| Viagem `completed` | CT-e/NFS-e autorizados | `measured`  | comparar histórico e bater com o financeiro |

O que a 061 proíbe — e continua proibido — é **somar previsão no relatório de resultado**. Previsão
decide hoje; realizado mede ontem. Misturar produz o relatório que discorda do financeiro, que é o
defeito que a D1 da 061 existe para evitar.

### D8 — O que o motorista leva funciona sem sinal

O romaneio e, depois, o DAMDFE são justamente o que ele precisa **quando não tem sinal** — barreira em
rodovia, portaria de cliente, subsolo. Os dois entram no cache da viagem que a 057 já mantém, e não
dependem de rede no momento de abrir.

## Histórias priorizadas

**P1 — o motorista sai com o romaneio**
_Dado_ uma viagem despachada, sem documento fiscal nenhum,
_quando_ o motorista abre a viagem no PWA,
_então_ vê o romaneio da carga — paradas, notas, destinatários, peso — com "não é documento fiscal" à
vista, e consegue abrir sem sinal.

**P1 — a nota da entrega urbana está na mão dele**
_Dado_ uma parada de entrega no município da transportadora, que não terá CT-e nem MDF-e,
_quando_ o motorista abre a parada,
_então_ vê a NF-e daquela entrega com chave por extenso e código de barras, e consegue abrir **sem
sinal** — porque barreira e portaria são exatamente onde não tem.

**P1 — o lote autorizado com o caminhão na rua emite o manifesto**
_Dado_ uma viagem `in_transit` cujo lote de CT-e acabou de autorizar,
_quando_ o operador emite o MDF-e,
_então_ ele é emitido — e não recusado por a viagem não estar mais em `dispatched`.

**P1 — a nota de serviço não trava o caminhão**
_Dado_ uma viagem com CT-e autorizados e uma NFS-e urbana ainda não emitida,
_quando_ a prontidão é consultada,
_então_ a viagem está pronta para manifestar, e a NFS-e pendente aparece como pendência da viagem.

**P1 — viagem urbana não manifesta**
_Dado_ uma viagem cujas entregas são todas no município da empresa,
_quando_ a prontidão é consultada,
_então_ ela responde que não há MDF-e a emitir, e a tela não oferece o botão.

**P1 — separar sem documento não é pendência**
_Dado_ uma viagem em separação, sem lote nenhum,
_quando_ o operador a abre,
_então_ a prontidão informa "nenhum documento emitido ainda" sem alarme.

**P1 — o manifesto sai sozinho quando o último CT-e autoriza**
_Dado_ uma viagem mista, com entregas urbanas e fora, e o último CT-e das notas de fora autorizando,
_quando_ o consumer processa a autorização,
_então_ o MDF-e é emitido sozinho — sem esperar pelas notas urbanas, que nunca terão CT-e.

**P1 — o automático que não pôde avisa**
_Dado_ uma viagem pronta e um certificado vencido,
_quando_ a emissão automática tenta,
_então_ ela não acontece, e a viagem mostra o motivo — em vez de ficar esperando calada.

**P2 — o DAMDFE toma o lugar do romaneio**
_Dado_ o MDF-e autorizado com o motorista na rua,
_quando_ ele abre a viagem,
_então_ o DAMDFE está no mesmo lugar onde o romaneio estava.

**P2 — quanto essa viagem rende**
_Dado_ uma viagem em montagem,
_quando_ o operador a abre,
_então_ vê receita prevista, custo previsto e margem, **marcados como previsão**, com a composição à
vista.

**P2 — preço diferente para a entrega urbana**
_Dado_ uma regra de frete cadastrada para o município da transportadora,
_quando_ a nota é avaliada,
_então_ ela usa essa regra, e não a regra geral da UF.

**P2 — a nota diz em que viagem ela saiu**
_Dado_ o operador montando o lote de CT-e,
_quando_ ele olha a lista de notas,
_então_ cada uma mostra a viagem em que saiu — porque fatura-se o que saiu, e hoje isso se descobre
abrindo a tela de viagem uma nota por vez.

**P3 — o romaneio impresso não se disfarça de documento fiscal**
_Dado_ o romaneio impresso na mão do motorista,
_quando_ alguém o olha,
_então_ o que se lê primeiro é "ROMANEIO DE CARGA — NÃO É DOCUMENTO FISCAL", e nada no desenho dele
imita DANFE ou DAMDFE.

## Requisitos funcionais

1. O portão da emissão passa a usar `isTripDispatched()` — `dispatched`, `in_transit` e `completed` —
   em vez de `dispatched` exato (D2).
2. `resolveFiscalDocumentKind`: módulo puro, `cte | nfse`, pelo IBGE de destino contra o da empresa,
   com o de origem lido e comparável (D3).
3. A prontidão classifica cada nota, exige CT-e autorizado só das de CT-e, lista as de NFS-e como
   pendência própria e responde `not_applicable` quando não há nota de CT-e (D4).
4. `trips.fiscal_readiness_state` ganha `not_applicable`.
4b. `trips.requires_mdfe` anulável, com motivo obrigatório para `false` em viagem com nota de CT-e e
    recusa de `true` em viagem sem nenhuma (D4c).
5. A prontidão distingue "sem lote ainda" de "com lote e faltando documento" (D5).
6. Romaneio de carga da viagem, com `GET /me/trips/current` carregando o que ele precisa, **sem**
   aparência de documento fiscal (D1).
6b. Por nota do romaneio: número, série, chave por extenso, código de barras da chave, destinatário,
    município, volumes, peso e valor — tudo no cache da viagem, disponível sem rede (D1b).
6c. Romaneio **em PDF para impressão**, com o título e o aviso de não-fiscal acima de tudo, e sem
    imitar o desenho de DANFE ou DAMDFE (D1, P3).
6d. Sinal de vínculo com viagem na listagem de notas e na composição do lote — NF-e e CT-e, sem
    bloqueio (D4b).
7. `freight_rule_versions.filters` ganha `destinationCityCodes`, IBGE de 7 dígitos (D6).
8. Avaliação prevista da viagem: receita por nota pelos parâmetros, custo pela composição da 061 D2,
   ambos com `source` declarado (D7).
9. DAMDFE do manifesto vivo acessível na viagem do motorista, substituindo o romaneio (D1, D8).
10. Evento de autorização de CT-e e consumer que pergunta se a viagem ficou pronta, com a prontidão
    corrigida da D4 como resposta — idempotente, e com a trava de manifesto vivo resolvendo a corrida
    (D2b). É a T009/T010 que a 059 deixou aberta.
11. Notificação em "ficou pronta", "emitido" e "não consegui emitir, e o motivo" (D2b).
12. Texto em `*.locale.json`.

## Requisitos não funcionais

- A classificação de uma viagem de 200 notas não faz N+1 — sai da mesma consulta da prontidão.
- A avaliação prevista **nunca** grava documento fiscal, nem rascunho. Teste garante que nenhuma
  escrita fiscal acontece no caminho.
- O romaneio e o DAMDFE abrem **sem rede** depois de a viagem ter sido carregada uma vez.
- Nenhuma chave de acesso nem CNPJ de participante em log.
- O DAMDFE sai por URL assinada de vida curta; o objeto não vira público.

## Casos extremos e falhas

| Caso                                                    | Comportamento                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Nota sem código IBGE de destino                         | Não classifica: pendência explícita "endereço sem município", nunca um chute para CT-e.               |
| Empresa sem `city_ibge_code` no perfil fiscal           | Classificação recusada com código próprio — sem o município da empresa não há regra.                  |
| Viagem mista com NFS-e pendente                         | Pronta para manifestar; a NFS-e vira pendência da viagem.                                             |
| Viagem só de entrega urbana                             | `not_applicable`; nenhum botão de manifesto.                                                          |
| Lote autorizado com a viagem já `completed`             | Emite normalmente (D2). É o caso mais comum desta operação.                                           |
| Carga mista, CT-e das notas de fora todos autorizados   | O automático dispara **sem** esperar as urbanas — elas nunca terão CT-e (D2b + D4).                   |
| Carga mista, uma nota de fora ainda sem CT-e            | O automático não dispara. Isso é espera legítima, e a viagem diz qual nota falta.                     |
| Automático impedido (certificado, 50 municípios)        | Não emite, notifica com o motivo e deixa visível na viagem. Nunca fica esperando calado.              |
| Nota com CT-e autorizado **e** entrega no município     | Divergência declarada: o documento emitido contradiz a classificação. Nada se cancela sozinho.        |
| Regra de município e regra de UF na mesma nota          | A de município vence — é a mais específica.                                                           |
| Sem regra de frete aplicável                            | Receita prevista da nota é zero **marcada como ausente**; a viagem soma o que tem e diz o que falta.  |
| MDF-e cancelado com o motorista na rua                  | O DAMDFE some da tela dele e o romaneio volta, com o motivo à vista.                                  |
| Nota desvinculada depois de o romaneio ser gerado       | O romaneio é sempre lido da viagem, nunca congelado — ele reflete o que ela carrega agora.            |

## Critérios de aceite

- [ ] Teste de que `in_transit` e `completed` emitem manifesto, e que `draft`/`separating`/`loading` não.
- [ ] Teste de que o automático dispara numa carga mista **sem** esperar as notas urbanas.
- [ ] Teste de idempotência do consumer, e de que dois eventos simultâneos geram um manifesto só.
- [ ] Teste de que o automático impedido notifica com o motivo em vez de ficar calado.
- [ ] Teste de classificação: destino no município → NFS-e; fora → CT-e; sem IBGE → pendência.
- [ ] Teste de que a NFS-e pendente **não** bloqueia o manifesto.
- [ ] Teste de viagem só urbana → `not_applicable`, sem oferta de manifesto.
- [ ] Teste de que forçar "não precisa de MDF-e" com nota de CT-e exige motivo e grava trilha.
- [ ] Teste de que forçar "precisa" numa viagem sem nota de CT-e é recusado.
- [ ] Teste dos dois tons da prontidão: sem lote versus com lote.
- [ ] Teste de que o romaneio não é apresentado como documento fiscal — título e aviso presentes.
- [ ] Teste de que romaneio, chave da NF-e e DAMDFE abrem sem rede.
- [ ] Teste de que a chave impressa no romaneio é a da nota daquela parada, e de que o código de
      barras codifica exatamente ela.
- [ ] Teste de que o PDF do romaneio carrega o título e o aviso de não-fiscal, e um contrato que
      falha se o aviso sair do documento.
- [ ] Teste de que o vínculo com viagem aparece na listagem de notas e **não** bloqueia o lote.
- [ ] Teste do filtro de município na regra de frete, incluindo a precedência sobre a UF.
- [ ] Teste de que a avaliação prevista não escreve documento fiscal nenhum.
- [ ] Integração: viagem mista, do barracão ao manifesto emitido com a viagem já concluída.
- [ ] ADR (**0047**) — a ordem real da operação, a classificação por município com a ressalva da D3, o
      romaneio que não é fiscal, e a emenda à D1 da 061.
- [ ] `tsc --noEmit` + `make validate`.

## Dúvidas

> **Fechado:** a carga urbana **não exige MDF-e**. Em compensação, ela não tem CT-e nem manifesto, e
> por isso a NF-e precisa estar no celular do motorista — é a D1b.

> **Fechado:** a viagem **não gera** lote de NFS-e nem de CT-e. Os dois continuam nascendo pelo
> caminho que já existe; a viagem só sinaliza o vínculo (D4b). Como ela não emite, a pergunta sobre
> agrupamento por tomador não é desta spec.

> **Fechado:** o romaneio **é impresso**. E por isso o desenho dele é requisito, não detalhe: impresso
> é justamente onde ele volta a parecer documento fiscal, e é impresso que alguém o apresenta numa
> barreira. Título e aviso vêm acima de tudo, e o layout não imita DANFE nem DAMDFE.

## 🤖 Modelo

| Etapa                                                     | Modelo    |
| --------------------------------------------------------- | --------- |
| Ordem da operação, classificação fiscal, emendas, ADR-0047 | `opus` 🧠 |
| Consumer, concorrência da emissão automática               | `opus` 🧠 |
| Portão, prontidão, filtro de município, avaliação, testes  | `sonnet`  |
| Romaneio e DAMDFE no PWA                                  | `sonnet`  |
