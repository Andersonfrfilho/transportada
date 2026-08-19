# 043 — O endereço do tomador na NFS-e

## Problema

A T017 da 042 — reemitir as 16 notas de Ribeirão Preto — foi executada e a prefeitura recusou de novo,
por outra causa:

```
NOTA_RP_UNKNOWN — É necessário informar o endereço completo do cliente
```

A rejeição da 042 (`Por favor informe o campo "Exigibilidade ISS"`) estava corrigida. Esta é nova, e é
nossa: o corpo que o worker monta em `/emitir` **nunca carregou o endereço do tomador**. `buildRps`
enviava CNPJ e razão social e nada mais sobre o cliente. A coleção oficial da v2 declara o bloco
`Cep · Endereco · Numero · Complemento · Bairro · Cidade · Estado · Telefone · Email` no RPS, e a
Nota RP recusa a nota inteira sem ele.

O endereço existe no banco desde a importação — `nfe_addresses` tem logradouro, número, complemento,
bairro, CEP, cidade e UF por participante. Ele simplesmente não era lido.

Dois agravantes:

- **A recusa chega tarde.** Nota sem endereço atravessa prévia, criação, congelamento e transmissão, e
  só falha na prefeitura, com as NF-e já travadas na fatura.
- **A reemissão não resolve.** O payload congelado é retransmitido literalmente, então reemitir uma
  nota nascida antes desta correção manda o mesmo RPS sem endereço.

## Objetivo

1. O RPS carrega o endereço do tomador que o perfil escolheu (remetente ou destinatário).
2. Nota cujo tomador não tem endereço completo é **bloqueada na prévia**, com razão própria, antes de
   virar fatura.
3. Payload congelado antes desta correção continua sendo transmitido — e recusado pela prefeitura, que
   é a causa real — em vez de morrer como defeito nosso de payload inválido.

## Decisões

**Endereço completo é conceito de domínio, não de gateway.** `nfse-taker-address.policy.ts` é a única
peça que decide o que é completo: cidade, bairro, número, CEP de oito dígitos, UF de duas letras e
logradouro obrigatórios; complemento e telefone opcionais viajam vazios. Ela canonicaliza no caminho —
tira a máscara do CEP e sobe a caixa da UF —, porque CEP mascarado de importação antiga e UF em caixa
baixa de digitação manual são o dado que existe, não exceção.

**Quem escolhe o tomador continua sendo o perfil.** `cte_emission_profiles.taker`: `0` remetente, `3`
destinatário. A seleção resolve o endereço do participante correspondente — o mesmo que já decidia
razão social e CNPJ.

**O endereço entra no payload congelado.** Ele é parte do que a empresa aprovou na prévia, então entra
no hash `payloadSha256` como o resto. `providerConfig` continua fora.

**`taker.address` é opcional no schema do worker.** Não por indulgência: payload congelado antes desta
mudança não pode virar `invalid_payload`, porque isso trocaria a recusa da prefeitura — a causa real,
que diz ao operador o que fazer — por um defeito nosso no diagnóstico.

**O cron não recebe cópia.** Ele consulta e baixa documento; não tem `/emitir`, `buildRps` nem
`payloadSchema`.

**O endereço não vai para a resposta da prévia.** O serializador continua escolhendo campo por campo:
a tela já mostra o endereço na nota, e um dado de cliente a mais no fio não resolve nada.

## Fora de escopo

- **`Email` no RPS.** `nfe_addresses` não tem coluna de e-mail; `EnviarEmail: false` continua, e sem
  ele o campo não faz falta. Inventar origem para o valor seria pior que omiti-lo.
- Cadastro ou correção de endereço na tela. Endereço vem da NF-e; nota sem ele fica bloqueada com a
  razão dita, e corrigir a origem é outra conversa.
- Códigos IBGE de município no RPS. A v2 lê `Cidade` como **nome** e `Estado` como **sigla** — é o que
  `cadastro.localizacao` devolve.

## Critérios de aceite

1. `resolveNfseTakerAddress` devolve endereço canônico para o completo, e `null` para: participante sem
   linha de endereço, campo obrigatório em branco, CEP fora de oito dígitos, UF que não é sigla.
2. A prévia bloqueia o documento com `NFSE_DOCUMENT_MISSING_TAKER_ADDRESS` quando o tomador escolhido
   pelo perfil não tem endereço completo — e o bloqueio segue o `taker` do perfil, não o papel fixo.
3. O payload congelado carrega `taker.address` com os oito campos.
4. `buildRps` emite `Cep · Endereco · Numero · Bairro · Cidade · Estado`, e omite `Complemento` e
   `Telefone` quando vazios.
5. Payload sem `taker.address` continua sendo transmitido, sem `invalid_payload`.
6. A tela traduz o código novo em frase, nos dois idiomas.
7. `make check` completo verde.

## Riscos

**A frota de notas já congeladas.** Toda nota criada antes deste merge tem payload sem endereço, e
reemitir não conserta. O caminho é **descartar e emitir de novo** — o descarte da 042 devolve as NF-e à
seleção. É consequência aceita: alterar payload congelado retroativamente destruiria a garantia de que
o que foi transmitido é o que a empresa aprovou.

**O bloqueio novo é visível.** Empresa com cadastro incompleto vai ver notas saírem da seleção que
antes entravam. Isso é o defeito aparecendo onde custa pouco, em vez de na prefeitura — mas aparece.

**O CEP do destinatário é o único campo com lacuna de layout.** `xLgr · nro · xBairro · xMun · UF` são
obrigatórios em `enderEmit` **e** em `enderDest` na NF-e 4.00, e o parser do pacote fiscal extrai os
seis desde sempre — as colunas de `nfe_addresses` nasceram no `CREATE TABLE`, antes de qualquer nota
desta instalação. `CEP`, porém, é obrigatório só em `enderEmit`: em `enderDest` é `0-1`. Tomador
destinatário com CEP omitido pelo emitente cai no bloqueio, e cai **por documento** — as outras notas
do grupo seguem.
