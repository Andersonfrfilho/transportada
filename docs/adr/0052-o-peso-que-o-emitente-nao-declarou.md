# ADR-0052 — O peso que o emitente não declarou

- Status: aceita
- Data: 2026-08-31
- Contexto: spec 067

## Contexto

A NF-e 883663/2 da Comercial Zaragoza chegou autorizada, completa, com valor e participantes, e com
o bloco de volume assim: `<vol><qVol>20</qVol><pesoL>0.000</pesoL><pesoB>0.000</pesoB></vol>`. Vinte
volumes, massa zero.

A nota 883658, **da mesma carga** — mesmo lacre 1022495, mesmo `NroCarga` 64175, mesma placa, mesmo
minuto de emissão —, veio com `qVol` 11 e `pesoB` 108,670. Ou seja: o emitente omite peso **por
nota**, não por política. Não há como prever, e não há como corrigir na origem: o XML é preservado
e assinado por terceiro.

Sem peso, `checkDocumentEligibility` recusava a nota, e ela não podia ser cobrada por **nenhum** dos
dois documentos de saída — nem CT-e nem NFS-e.

## Decisão

Duas decisões, porque o problema é diferente em cada documento.

**1. A NFS-e deixa de exigir peso.** Ela nunca o usou: varredura em `nfse-invoices/domain/` e
`worker/nfse-issuance/` devolve zero ocorrências, e o RPS da Nota RP não tem campo de massa. O gate
era herança da policy de CT-e, adotada porque "o serviço prestado é o mesmo transporte" — verdade
para participantes, municípios e valor, falso para o peso. `checkSharedEligibility` passou a
carregar o que os dois conferem em comum, e `NfseSelectionBlockReason` deixou de admitir o motivo de
peso **por tipo**.

**2. O CT-e estima o peso, pelo padrão da empresa.** `company_cargo_settings.default_volume_weight`
é kg **por volume**, e o peso efetivo é `qVol × padrão` quando o emitente não declarou massa. A
ordem é: XML → estimativa → ausência.

## Alternativas descartadas

- **Emitir o CT-e com `infQ` só de UNIDADE.** `composeCargoQuantities` já omite peso zero, então o
  payload não quebraria — mas entregaria à SEFAZ um CT-e sem massa declarada, e sumiria com o único
  momento em que a transportadora seria obrigada a pesar a carga.
- **Declaração manual por nota**, append-only, com autor e data. Mais precisa e mais auditável, mas
  o volume da operação não comporta pesar carga a carga; a ficha ficaria em branco e o bloqueio
  seguiria de pé na prática.
- **Aprender o peso do histórico da empresa.** Atraente porque `nfe_products` e `nfe_volumes` já
  guardam tudo — mas o XML **não traz peso por item**: `pesoB` só existe agregado no `<vol>`. Uma
  nota com cinco produtos são cinco incógnitas e uma equação. Só notas de um produto só ensinariam
  algo exato, a cobertura nasceria parcial, e o peso padrão seria necessário como reserva de
  qualquer jeito.
- **Reusar `company_route_optimization_settings.fallback_weight_kilograms`.** Aquele peso é **por
  parada**, para o solver distribuir carga entre veículos; este é **por volume**, para o `infQ`.
  Uma nota de vinte volumes usaria um deles uma vez e o outro vinte vezes.

## Consequências

- **⚠️ O `infQ` transmitido passa a poder conter peso que a transportadora calculou, não que ela
  pesou.** Divergência grande contra a carga real é exposição fiscal **dela** — a nota do emitente
  não a protege, porque o CT-e é documento próprio. Esta é a consequência central desta ADR, e ela
  foi aceita conscientemente pelo dono do produto em 2026-08-31.
- **A estimativa é opt-in.** Nulo é o padrão e desliga a estimativa; a nota sem peso continua
  bloqueada. Instalação nova não passa a declarar massa inventada por omissão de configuração.
- **Zero não é desligar** — nulo é. O CHECK do banco recusa zero: peso zero declararia que a carga
  não pesa nada.
- **Nota sem `qVol` continua bloqueada.** Sem quantidade de volumes não há de onde estimar, e um
  peso fixo por nota seria uma segunda regra de peso.
- **A estimativa entra por volume, não como total colado na nota**, para a soma que
  `composeCargoQuantities` faz continuar sendo a soma dos volumes, coerente com o `qVol` do XML.
- **Nota parcialmente pesada não é tocada:** basta um volume com massa para o que o emitente disse
  valer inteiro.
- **Mudar o padrão não mexe no que já foi emitido.** O payload congelado é a verdade do que foi
  transmitido; a estimativa é derivada na leitura.
- **O peso estimado não alimenta o frete por faixa de peso** — a transportadora não cobra por um
  número que ela mesma estimou.
- **⚠️ Não há marca de "peso estimado" por nota em nenhuma tela**, porque nenhuma superfície mostra
  peso hoje: a prévia do lote não o serializa e a tabela de Notas não tem coluna de peso. A
  divulgação existe só no painel de configuração. Quem for expor peso em qualquer tela **deve**
  levar a origem junto — é o que permite a um humano notar um padrão mal calibrado antes da emissão.
