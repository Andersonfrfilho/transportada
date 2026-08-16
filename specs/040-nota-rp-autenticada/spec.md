# 040 — A Nota RP autenticada de verdade

## Problema

A spec 039 destravou o boot do trilho de NFS-e e o `cron-nfse` roda em produção desde 15/08, com
ciclos limpos. O que ela não podia revelar — porque a conta não tem nota — é que **nenhuma chamada
nossa à Nota RP está autenticada**.

O cliente v2 manda `Authorization: Bearer <token>`. A Nota RP não lê esse cabeçalho. Ela exige dois:

```
X-AUTH-USER-TOKEN: <token da conta>
X-AUTH-IM:         <inscrição municipal da empresa>
```

O token identifica a conta; a inscrição municipal identifica **qual empresa dentro dela**. Nós não
mandamos nenhum dos dois.

Isso sobreviveu meses porque a rota que o trilho exercita não distingue. `GET /notas/` responde 200
com envelope vazio para token válido, token inventado e requisição sem cabeçalho nenhum:

```
real        http=200  {"draw":0,"data":[],"recordsFiltered":0,"recordsTotal":0}
inválido    http=200  {"draw":0,"data":[],"recordsFiltered":0,"recordsTotal":0}
sem header  http=200
```

A rota que distingue é `/dados-cadastrais`, e ela expõe o problema inteiro:

```
real        http=200  {"success":true,"ultima_consulta":"15/08/2026 09:58","cadastro":null}
inválido    http=401  {"success":false,"message":"Token inválido."}
```

O `cadastro: null` no caminho válido não é detalhe: é a ausência de `X-AUTH-IM` respondendo. O token
é bom, e ainda assim o provedor não sabe de que empresa se fala.

Há um terceiro defeito, que só aparece na emissão: `CallbackUrl` é **obrigatório** na v2 e é enviado
por nós **condicionalmente** (`callbackUrl === undefined ? {} : …`). Em produção
`NFSE_CALLBACK_BASE_URL` não está definida na `api`, então a rota de retorno nem é registrada e o
campo nunca vai. A primeira emissão real seria recusada.

Somando: o trilho sobe, roda, loga ciclo limpo e não emitiria nota nenhuma. Os três defeitos são
invisíveis à suíte atual porque ela dubla o HTTP.

## Objetivo

1. Toda chamada à Nota RP vai com os dois cabeçalhos que o provedor exige.
2. Não é possível selar credencial sem inscrição municipal — o dado que falta é recusado na entrada,
   não descoberto na emissão.
3. `CallbackUrl` é obrigatório no nosso lado também, porque é obrigatório no do provedor.
4. Existe um teste que falha se o cabeçalho errado voltar, e uma sondagem que distingue credencial
   boa de ruim.

## Decisões

**Os dois cabeçalhos, nas duas cópias.** `worker-transportada/.../nota-rp-v2.client.ts` e
`cron-transportada/.../nota-rp-v2.client.ts` são cópias por valor documentadas no `CLAUDE.md`. A
troca é **uma task só** — meio caminho produz um app que emite e outro que não consegue consultar, e
o que falha é o que reconcilia.

**`X-Auth-CNPJ` fica de fora.** O `NotaRpNfseProvider` do pacote fiscal manda esse terceiro
cabeçalho, mas ele **não aparece na documentação da v2**. Sem material da v3 em mãos não dá para
dizer se é exigência de lá ou campo ignorado. Mandar cabeçalho que o contrato documentado não pede é
palpite; a sondagem do critério 6 é que decide, e só então ele entra.

**A inscrição municipal passa a ser obrigatória.** Hoje `municipalRegistration` tem
`.default('')` no `saveCredentialSchema`, o que deixa selar uma credencial que não pode funcionar.
Vira campo exigido, com migração para as linhas existentes — que hoje são zero em produção, e é por
isso que a hora de fazer isso é agora.

**`CallbackUrl` deixa de ser opcional no gateway.** A emissão sem URL de retorno não é um modo
degradado: é uma chamada que o provedor recusa. O tipo passa a exigir o campo, e
`NFSE_CALLBACK_BASE_URL` entra na produção da `api`.

**A autenticação do postback continua sendo o token opaco no caminho.** A Nota RP oferece
`X-Signature` (HMAC-SHA256 do corpo, segredo de 16 a 64 caracteres configurado no painel), e ela é
melhor: prova origem, e não só posse da URL. Mas trocar o mecanismo é mudança de superfície pública
com rotação de segredo, e não é pré-requisito para emitir. Fica registrado como dívida no
`docs/SECURITY.md`, junto do rate limit que já está lá.

## Fora de escopo

- Emitir a primeira nota. Continua sendo operação, com nota única conferida no portal (ADR-0035).
- Migrar para o `NotaRpNfseProvider` do pacote. Ele é v3-only, e a v3 não atende o município — é o
  motivo registrado na ADR-0029, e continua valendo.
- Verificar `X-Signature`. Decidido acima; vira item datado no `docs/SECURITY.md`.
- O teto de `Discriminacao`. Segue 2000 até haver medida com credencial real.

## Critérios de aceite

1. O cliente do `worker` monta `X-AUTH-USER-TOKEN` e `X-AUTH-IM` e **não** monta `authorization`.
2. O mesmo no cliente do `cron`, e `nota-rp-parity.contract.ts` cobre os cabeçalhos além da tradução
   de resposta — hoje ele guarda só o vocabulário.
3. Um teste falha se a string `Bearer` reaparecer em qualquer um dos dois clientes.
4. `saveCredentialSchema` recusa corpo sem `municipalRegistration`, e a coluna é `not null`, com
   migration versionada e `rollback.sql` ao lado.
5. O tipo de emissão exige `callbackUrl`; construir a chamada sem ele não compila.
6. Sondagem contra `/dados-cadastrais` com a credencial real devolve `success:true` **com `cadastro`
   preenchido** — é o que prova que o `X-AUTH-IM` chegou —, e a mesma chamada com token inválido
   devolve 401. As duas saídas vão para o `evidence.md`, sem o token.
7. `NFSE_CALLBACK_BASE_URL` declarada na `api` de produção, e a rota de retorno registrada.

## Riscos

**A sondagem do critério 6 é contra a conta real, em produção.** É leitura de cadastro, não emissão —
não gera documento fiscal nem custo. Mas é a conta do cliente, e o token não pode aparecer em log,
terminal ou CI.

**A obrigatoriedade da inscrição municipal é mudança de contrato de escrita.** Em produção não há
linha selada, então a migração é barata hoje e cara depois. Se houver linha em qualquer outro
ambiente, ela precisa de valor antes do `not null`.

**O controle negativo é parte do teste, não enfeite.** Foi exatamente a sua ausência que deixou o
cabeçalho errado passar. Verificação nova nesta integração sem a chamada equivalente com credencial
inválida falhando de forma visivelmente diferente não é verificação.
