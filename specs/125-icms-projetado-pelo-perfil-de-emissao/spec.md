# Feature 125 — O ICMS se projeta pelo perfil de emissão até o CT-e existir

## Problema e resultado

A parcela `icms` da conta da viagem só existia depois do CT-e autorizado (ADR-0049 §4: o ICMS é do
documento). Antes disso ela saía ausente com "nota ainda sem CT-e autorizado" — e na montagem, na
prévia e na proposta de roteiro **nunca** há CT-e: a margem que decide se a viagem vale a pena era
calculada sem o imposto que desce da receita.

O perfil de emissão que vai gerar o CT-e já guarda o que decide o imposto: `icms_cst`, `icms_rate` e
`icms_base_reduction_rate` (`cte_emission_profiles`). O resultado desta feature é a parcela `icms`
projetada nota a nota, pelo perfil que rege cada nota, sobre a receita prevista dela — com a **mesma
regra de base** do CT-e, marcada como estimada, e vencida pelo valor do documento assim que ele for
autorizado.

## Regras

1. **O documento vence sempre.** Nota com CT-e autorizado usa o `vICMS` do payload congelado,
   `measured`, como sempre.
2. **Sem documento, projeta pelo perfil.** O perfil é o que `findEmissionProfile` escolhe — o mesmo
   seam **sem lançar** de `resolveMunicipalServicePolicy` — pelo CNPJ do remetente e do destinatário
   da nota. A base é a receita da nota na conta (a linha `estimated` da regra de frete).
3. **A mesma regra do CT-e, nunca uma segunda.** O cálculo sai de `computeIcms`
   (`cte-issuance/domain/cte-icms.policy.ts`), que é o que `composeIcms` do builder passou a usar:
   - `00` → base cheia × alíquota;
   - `20` → base × (1 − redução) × alíquota;
   - `90` → base cheia × alíquota; com alíquota zero, sem destaque;
   - `40`, `41`, `51` → **zero declarado** (isento, não tributado, diferido), com o CST no `basis`;
   - `60` → o builder recusa emitir (`CtePayloadUnsupportedIcmsError`), e a projeção não inventa:
     ausência com `ICMS_CST_UNSUPPORTED`.
     O arredondamento é o do documento: base em duas casas, meio para cima.
4. **Ausência nomeada:**
   - nota sem perfil que a reja **ou empate** entre perfis, ou participante sem CNPJ →
     `NO_EMISSION_PROFILE` (é o `null` de `findEmissionProfile`, que junta os três de propósito —
     nos três o conserto é a aba de perfis de emissão);
   - receita ausente (nenhuma regra de frete casa) → `NO_FREIGHT_RULE`, como a linha de receita.
5. **A parcela é a soma das notas, com o pior caso da origem.** Toda nota conhecida (medida ou
   projetada) soma; nota ausente torna a parcela incompleta com a lacuna dela e `detail` =
   `ausentes/total`. Uma projetada basta para a origem ser `estimated`.
6. **Vale nas três superfícies** — viagem, prévia da montagem e proposta de roteiro passam por
   `buildValuationFromContext`, e os dois leitores de contexto carregam os perfis ativos uma vez.

## Decisões

### D1 — `computeIcms` extraído do builder, não copiado

A projeção precisa responder o que o CT-e vai dizer. Uma segunda implementação da base (a redução,
o arredondamento em duas casas, o CST 90 sem alíquota) divergiria calada no dia em que alguém mexer
numa das duas. O builder passou a mapear o resultado de `computeIcms` para `CteIcms`, e o contrato
do builder continua o mesmo.

### D2 — Base é a receita **da nota**, não a da viagem

O CT-e é emitido por nota (ou lote de notas do mesmo par), e cada nota pode cair num perfil
diferente. Projetar sobre o total da viagem aplicaria um CST a notas que o perfil delas não rege.

### D3 — Zero de isenção é valor, não ausência

"Não paga" e "não sei" não são a mesma resposta (ADR-0049 §4). A projeção de uma nota em CST 40 é
`0,00` estimado, e o `basis` diz o CST — é isso que a tela imprime como motivo.

### D4 — Empate não escolhe

Dois perfis empatados na mesma nota: escolher um seria o palpite que `findEmissionProfile` já recusa
na listagem. A emissão real recusaria com `CteEmissionProfileAmbiguousError`; a conta diz o mesmo
com `NO_EMISSION_PROFILE`.

## Ordem de deploy

Qualquer ordem. As lacunas novas chegam como texto (o `t()` cai no `defaultValue`), e o `basis` novo
(`of: 'icms'`) é lido **por forma** no frontend — o frontend antigo o descarta e imprime só o
número. Nenhum guard por lista fechada nesse caminho.

## Medições

Ver `evidence.md`.
