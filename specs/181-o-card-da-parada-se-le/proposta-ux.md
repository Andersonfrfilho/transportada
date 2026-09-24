# Proposta de UX — o card da parada se lê (spec 181)

Análise de `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx`
e `apps/frontend-transportada/src/modules/trip/styles/trip.module.css`. Documento de diagnóstico
e proposta — sem código de implementação.

## 1. Diagnóstico de leitura

O card não tem estrutura: tem uma sequência. `.stopDocumentRow` (`trip.module.css:1033-1041`) é um
único `display: flex; flex-wrap: wrap` que recebe, como irmãos do mesmo nível, tudo que a linha
sabe sobre a nota — checkbox, número, dinheiro, data, pessoas, quatro badges de situação e a área
de ações. Cada item novo só aumenta o `flex-wrap`; não existe um segundo eixo (grade, seções,
recuo) que separe "isto é a identidade da nota" de "isto é dinheiro" de "isto é gente" de "isto é
alerta". O resultado é que o operador lê a linha inteira, palavra por palavra, para achar o único
dado que precisa — porque nada na tipografia ou no espaçamento diz onde parar.

Pontos concretos:

- **Nenhuma âncora visual na nota.** `.stopDocumentLabel` (o número, `879796/2`) usa
  `font-size: 0.85rem`, sem peso, na mesma família (`--font-utility`) que praticamente todo o
  resto da linha (`.stopDocumentMeta`, `.separationStatusBadge`, `.fiscalStatusBadge`…). Compare
  com `.stopLabel` — o endereço da parada — que é `font-weight: 600`. A parada tem uma âncora; a
  nota dentro dela não tem nenhuma. Num card com uma nota só isso quase não incomoda; com duas ou
  mais notas na mesma parada, não há como saber onde uma termina e a outra começa sem contar
  checkboxes.
- **Repetição de rótulo em vez de agrupamento.** "Recebe:", "Telefone:", "Contratante:" chegam
  como três `<span className={styles.stopDocumentMeta}>` independentes (linhas 352-368), cada um
  com seu próprio prefixo textual. É a mesma informação — "quem está do outro lado da entrega" —
  fatiada em três frases soltas que o flex-wrap pode inclusive separar em linhas diferentes,
  dependendo da largura disponível. O card cita **um destinatário** (nome + telefone) e **um
  contratante**; hoje eles competem por atenção com o mesmo peso tipográfico que o valor da
  mercadoria.
- **Dinheiro fatiado em fragmentos desconexos.** Mercadoria (linha 319-323), frete (329-338) e
  regra de frete (339-343) são três `<span>` separados, sem vírgula, sem parênteses, sem nada que
  diga "estes três números são a mesma conta". O usuário precisa somar mentalmente que "Mercadoria:
  R$ 754,63" e "Frete: R$ 90,56 (previsto)" pertencem ao mesmo raciocínio financeiro — hoje eles só
  são vizinhos por acaso de ordem no JSX.
- **Quatro selos de situação, zero hierarquia entre eles.** `.separationStatusBadge`,
  `.openOccurrenceBadge` (botão, linha 372-384), `.occurrenceCaseBadge` (linha 403-410) e
  `.fiscalStatusBadge`/`.fiscalWarning` (395-397, 416-429) usam bordas e tamanhos de fonte quase
  idênticos (`0.72rem`–`0.75rem`, borda 1px, `--color-copper` ou `--color-alert`). Nenhum é
  visualmente "o selo principal" — o operador tem que ler os quatro textos para descobrir qual é
  grave. Ver diagnóstico específico no item 4: dois desses quatro **disparam da mesma condição**.
- **Densidade sem fôlego.** `.stopDocumentRow` tem `gap: var(--space-2)` uniforme entre todo mundo
  — entre "Recebe: Fulano" e o próximo badge de alerta é o mesmo respiro que entre duas palavras da
  mesma frase. Não há separador maior entre "dados de leitura" e "selos de atenção", nem entre
  "selos" e "ações" (`.rowActions`, linha 430, também `flex-wrap` solto embaixo).
- **O painel de comprovante despeja tudo de uma vez.** Ao abrir `[Comprovante]`
  (`onToggleProof`/`openProofDocumentId`), `TripDeliveryProof.component.tsx` renderiza, nos três
  estados possíveis, `<TripDocumentProducts products={products} />` **incondicionalmente** (linhas
  41, 55, 81) e a prop `occurrences` também incondicionalmente (linhas 42, 56). Não há nível
  intermediário: ou o comprovante está fechado (nada aparece) ou está aberto e aparecem de uma vez
  a razão da devolução/entrega, a lista completa de produtos e a lista completa de ocorrências. É
  exatamente o "muro de texto" do card do usuário, só que dentro do próprio painel expansível.
- **Sem prévia do que expandir.** O botão `[Comprovante]` não diz quantos itens ou quantas
  ocorrências há dentro — o operador só descobre o tamanho do muro depois de já ter aberto.

## 2. Proposta de estrutura

O produto já tem o padrão certo: a linha do tempo (`TripTimeline.component.tsx`, spec 180,
RF16/CA14/CA16) ganhou disclosure — um `Button` com `aria-expanded`/`aria-controls`, texto
"Ver mais"/"Ver menos" e ícone de chevron, que só aparece quando `hasDetail` confirma que existe
algo a mostrar (nunca abre para o vazio). É essa peça que falta no card da parada, num segundo
nível: hoje `[Comprovante]` já expande/recolhe o card inteiro, mas o conteúdo de dentro não tem o
próprio disclosure.

**Primário — sempre visível, nunca atrás de um clique:**
- Identidade da parada: sequência + endereço (já é o padrão hoje, `.stopSequence` + `.stopLabel`).
- Identidade da nota: número do documento, promovido a âncora visual própria (peso/tamanho
  equivalente ao `.stopLabel` da parada, não ao texto de metadado).
- **Um** selo de situação — o de maior severidade entre os quatro atuais (ver item 4). Os demais
  viram informação secundária ou desaparecem por serem redundantes.
- O evento mais recente que aconteceu com a nota: "Concluída às 17:31" / "Devolvida às 17:31" — já
  existe como `StopExecution` a nível de parada; a nível de documento hoje esse dado só chega
  disperso dentro do selo de status de separação.

**Secundário — visível ao rolar/olhar o card aberto, mas fisicamente agrupado, não plano:**
- Bloco de dinheiro: mercadoria + frete + regra, num único agrupamento visual (mesmo contêiner,
  mesmo bloco tipográfico), não três `<span>` soltos competindo por linha no flex-wrap.
- Bloco de pessoas: destinatário + telefone numa linha só ("ALMEIDA COMÉRCIO... · (17) 3322-3777"),
  contratante como segunda linha do mesmo bloco, com peso menor — é dado de confirmação, não de
  triagem.
- Data de emissão da nota — hoje um `<span>` solto entre dinheiro e pessoas; passa a acompanhar o
  bloco de dinheiro (é dado fiscal/contábil, não operacional).
- Selos secundários que sobrarem do item 4 (ex.: alerta fiscal "sem perfil de emissão", marca de
  endereço de entrega) — visíveis mas com peso visual menor que o selo primário, agrupados entre si
  em vez de espalhados na mesma linha dos dados de pessoa/dinheiro.

**Terciário — só sob demanda, dentro do disclosure que hoje é `[Comprovante]`:**
- Imagem/assinatura do comprovante.
- Lista de produtos ("O que vai na nota") — hoje incondicional, passa a ter o próprio resumo
  fechado ("7 itens · ver todos") em vez de despejar a lista inteira assim que o card abre.
- Lista/histórico de ocorrências — mesmo tratamento: resumo ("2 ocorrências · ver histórico").
- O motivo textual da devolução/entrega (uma vez corrigido o defeito do item 6) pode subir para o
  nível **secundário** dentro do bloco de situação, já que é curto (uma palavra: "Ausente",
  "Recusa") — não precisa do disclosure completo só para isso.

**O que nunca se recolhe:** identidade da parada, identidade da nota, o selo de situação mais
crítico, e o botão de ação primário da linha (a ação que resolve o estado atual — "Registrar
ocorrência", "Emitir CT-e" etc., conforme `resolveDocumentRowAction`). Recolher qualquer um desses
obrigaria o operador a abrir o card só para saber se há algo a fazer, que é o oposto do que a
linha do tempo (spec 180) resolveu ao manter link e resumo sempre visíveis e só detalhar sob
demanda.

Esboço de hierarquia (pseudo-marcação, não implementação):

```
<StopCard>
  <StopHead>          [sequência] [endereço]            [selo-parada?] [execução]
  <DocumentRow>                                                          ← nível primário
    [checkbox] [número-da-nota — âncora]      [selo-situação-principal]  [ação-primária]
    <DocumentBody>                                                       ← nível secundário
      <MoneyGroup>     Mercadoria R$ … · Frete R$ … (previsto) · Regra: …
      <PeopleGroup>     Recebe: Nome · (telefone)
                        Contratante: Nome                    (peso menor)
      <SecondaryBadges> [selo fiscal] [marca endereço-entrega]
    <Disclosure aria-expanded aria-controls="proof-{id}">
      Comprovante · 7 itens · 2 ocorrências  [chevron]
    <DisclosurePanel id="proof-{id}">                                   ← nível terciário
      [motivo textual, se ainda não subiu ao secundário]
      [imagem do comprovante]
      <ProductsDisclosure>  "O que vai na nota (7)"  [chevron]
      <OccurrencesDisclosure> "Ocorrências (2)"  [chevron]
```

## 3. Agrupamento

| Grupo | Conteúdo hoje disperso | Tratamento proposto |
|---|---|---|
| **Dinheiro** | `nfeTotalValue`, `freightAmount`(+selo `estimated`), `freightRuleName` — 3 `<span>` soltos | Um único bloco/linha com separador visual próprio (não o mesmo `gap` genérico da linha toda); a regra de frete pode virar texto auxiliar menor dentro do mesmo bloco, não uma quarta linha |
| **Pessoas** | `contact.name`, `contact.phone`, `contact.contractorName` — 3 `<span>` com prefixo textual repetido | Destinatário + telefone numa linha (é quem se contata pra resolver a entrega); contratante em linha própria, tipograficamente mais discreta, dentro do mesmo bloco |
| **Situação** | `separationStatus`, `openOccurrenceBadge`, `occurrenceCaseBadge`, `fiscalStatusBadge`/`fiscalWarning` — 4 badges soltos na mesma linha dos dados | Um selo primário (o de maior severidade) sempre visível junto ao número da nota; os demais colapsam para um único agrupamento secundário "situação" (ver item 4 — dois hoje são a mesma informação duplicada) |
| **Conteúdo** | Produtos e ocorrências — hoje incondicionais dentro do comprovante aberto | Cada um vira seu próprio disclosure dentro do disclosure do comprovante, com contagem no rótulo fechado |

O ganho não é só cosmético: hoje "Devolvida" (situação), "R$ 754,63" (dinheiro) e "(17) 3322-3777"
(pessoa) estão a um `gap` de distância um do outro, na mesma fonte, na mesma cor quase — o
agrupamento é o que permite ao operador escanear por categoria ("preciso do telefone" → olho só o
bloco de pessoas) em vez de ler a linha inteira toda vez.

## 4. Os selos de situação

Achado que muda a proposta: **duas das quatro etiquetas nascem da mesma condição.** Em
`occurrenceMarker.service.ts`:

```ts
export function hasOpenOccurrenceMarker(document: OccurrenceMarkerSource): boolean {
  return document.openOccurrenceCase === true
}
```

E em `TripStopList.component.tsx`, o botão "Ocorrência aberta" (linha 373, condição
`hasOpenOccurrenceMarker(document)`) e o selo "Ocorrência em tratativa" (linha 403, condição
`document.openOccurrenceCase === true`) **testam exatamente o mesmo booleano.** Não são dois
estados diferentes do domínio — são a mesma tratativa aberta, renderizada duas vezes: uma como
botão de ação (abre `SeparationOccurrenceDialog`) e outra como selo informativo com tooltip
(`occurrence.openCaseHint`: "Esta nota tem uma ocorrência de destino em tratativa... o marcador só
sinaliza"). O card do usuário mostra as duas ("Ocorrência aberta" e "Ocorrência em tratativa")
lado a lado porque o código as trata como independentes; para quem lê, é a mesma frase dita duas
vezes com palavras diferentes.

Isso deixa três eixos realmente independentes, não quatro:

1. **Pipeline/resultado da entrega** — `separationStatus` (`Devolvida`, `Entregue`, `Separada`…).
   É o estado de maior nível: "o que aconteceu com a carga".
2. **Tratativa de ocorrência** — hoje duplicado em dois badges; deve virar **um** selo, com o botão
   de ação embutido nele (o próprio selo é clicável e leva ao diálogo — não precisa de um botão
   irmão dizendo a mesma coisa em texto).
3. **Estado fiscal** — `fiscalReadiness.reason` (`sem perfil de emissão`, `CT-e rejeitado`…). Eixo
   genuinamente diferente dos outros dois: fala de nota fiscal/CT-e, não da entrega física.

Hierarquia proposta entre os três eixos, para quando mais de um está ativo ao mesmo tempo (o caso
do card do usuário: devolvida + ocorrência + sem perfil):

- **Selo primário (sempre visível, cor de maior atenção):** o de maior severidade prática. Entre
  "tratativa de ocorrência aberta" e "sem perfil de emissão", a ocorrência é o que bloqueia decisão
  humana agora (alguém precisa decidir o que fazer com a mercadoria devolvida); o estado fiscal é
  bloqueio de emissão, mais operacional/adiável. Proposta: ocorrência aberta > pipeline anômalo
  (devolvida/recusada) > estado fiscal > pipeline normal (separada/carregada/entregue, sem selo de
  alerta nenhum, só o texto neutro que já existe).
- **Selos secundários:** os eixos que não venceram a prioridade acima aparecem, mas com peso visual
  menor (borda mais discreta, ou reunidos num único agrupamento textual "também: sem perfil de
  emissão" em vez de um badge com a mesma força visual do primário).
- Regra de cor: manter o que a spec 174 RF6 já decidiu — cor de alerta (`--color-alert`) reservada
  para recusa/cancelamento (`FISCAL_ALERT_REASONS`) e para nada mais. Ocorrência em tratativa já
  usa `--color-copper` de propósito (comentário da linha 341-344: "não é a cor de erro... ela segue
  liberada"). Isso já dá uma escala de dois tons que a proposta deve preservar, só que hoje ela se
  perde porque os quatro badges têm bordas do mesmo peso visual.

## 5. 375px

Hoje `.stopCardHead` já vira `flex-wrap: wrap` abaixo de `40rem` (640px) — ou seja, em 375px o
cabeçalho da parada **já** quebra em várias linhas (regra em `trip.module.css:1244-1247`, que só
remove o wrap acima de 40rem). O problema em 375px não é diferente do problema em desktop — é o
mesmo problema, agravado: menos largura por linha significa mais quebras de `flex-wrap`, e cada
quebra hoje é arbitrária (corta no meio de "Recebe: Nome" só porque o telefone não coube).

O que muda com a proposta:
- Os **agrupamentos** (dinheiro, pessoas, situação) resolvem isso por construção: um bloco vira uma
  coluna de largura total em vez de fragmentos que quebram sem aviso — é o mesmo raciocínio que já
  existe em `.occurrenceForm` (`trip.module.css:1372-1378`, "uma coluna só", comentário explícito
  sobre o `Select` não ganhar `flex: 1 1 100%` fora de grid).
- A área de toque de 44px (`--control-height-compact`, já usado em `.stopDragHandle`,
  `.separationStatusBadge` etc.) precisa continuar valendo para o botão do disclosure novo — ele é
  o elemento mais repetido em 375px (mais cards abertos um por vez, menos espaço para múltiplos
  botões visíveis ao mesmo tempo).
- Vale considerar recolher o **bloco de pessoas** por padrão em 375px mesmo antes do disclosure
  principal — telefone e contratante são dados de confirmação, e numa tela de operador em pé
  segurando o celular (o app é PWA, spec cita motorista/campo em vários pontos) a primeira decisão
  é sempre "que nota é essa, e o que houve com ela" — não "quem é o contratante".
- Ícones (`Icon` de `@/components/ui/icon`) já carregam parte do significado dos selos sem depender
  só do texto — em 375px, onde o texto quebra mais, isso ajuda a manter a leitura em uma linha por
  selo em vez de duas.

## 6. Defeito: código bruto no motivo da devolução

Confirmado e localizado — mas **não é** no arquivo que a tarefa apontou (`TripStopList` só abre o
comprovante via `renderProof`; quem desenha o texto é outro componente da mesma pasta).

**Onde está:** `apps/frontend-transportada/src/modules/trip/components/TripDeliveryProof.component.tsx`,
linhas 47-54:

```tsx
if (view.state === 'returned') {
  return (
    <>
      <p className={styles.hint}>
        {view.returnReason === null || view.returnReason === ''
          ? t('deliveryProof.returnedWithoutReason')
          : t('deliveryProof.returned', { reason: view.returnReason })}   {/* ← código cru */}
      </p>
```

`view.returnReason` chega como o código bruto (`recipient_absent`) e é interpolado direto na chave
`deliveryProof.returned` ("Nota devolvida: {{reason}}") — sem passar pelo dicionário. O dicionário
correto existe e está correto: `fieldActions.returnReason` no locale
(`recipient_absent` → "Ausente", `recipient_refused` → "Recusa", `damaged_goods` → "Avaria",
`establishment_closed` → "Estabelecimento fechado", `address_not_found` → "Endereço não
encontrado").

O curioso é que o mesmo defeito **já foi corrigido em outro componente da mesma feature**:
`TripTimeline.component.tsx`, linhas 202-214, tem o comentário explícito:

> `returnReason` é código (`recipient_refused`), não texto: o dicionário vive em
> `fieldActions.returnReason` e a tela do motorista já o usa. A linha do tempo mostrava o código
> [...]

e resolve com `t(\`fieldActions.returnReason.${returnReasonCode}\`, { defaultValue: returnReasonCode })`.
`TripDeliveryProof.component.tsx` é o mesmo defeito, num componente irmão, não corrigido — a
correção precisa do mesmo padrão de lookup com `defaultValue` (para não quebrar se algum código
novo chegar sem entrada no dicionário).

## O que eu não consegui verificar

- **Como o card realmente se comporta em runtime** — não naveguei a tela nem tirei captura; o
  diagnóstico é 100% leitura de código (componente + CSS module) e do dicionário de locale. Não
  confirmei visualmente cores calculadas (`color-mix(...)`) nem o resultado real do `flex-wrap` em
  larguras específicas.
- **Prioridade de negócio entre os três eixos de situação** (item 4) é minha leitura de UX a partir
  dos comentários no código (ex.: "ela segue liberada, o marcador só sinaliza") — não é uma decisão
  documentada em spec que eu tenha lido; vale confirmar com quem define a operação (a spec 173/174
  têm o contexto original de cada selo, mas não vi um documento que já hierarquize os três juntos).
- **Se existe uma versão mobile/driver-trip equivalente** deste card que já resolveu parte disso —
  vi `driver-trip/components/DriverStopCard.component.tsx` referenciado na busca por
  `returnReason`, mas não abri o arquivo; pode já ter um padrão de agrupamento reaproveitável (ou o
  mesmo defeito do item 6, replicado).
- **Impacto do agrupamento proposto nos testes de contrato existentes**
  (`test/trip-hooks.contract.test.ts` e outros na mesma pasta, hoje modificados na branch) — não
  tenho visibilidade sobre o que esses testes já fixam sobre a estrutura do DOM do card; quem
  implementar precisa conferir se os `data-revealed-panel`/ids (`buildTripTimelineDocumentAnchorId`
  etc.) usados como âncora por outras telas continuam estáveis com a nova estrutura.
