---
name: verificar-o-fato-nao-o-sinal
description: Conferir a evidência independente antes de dar por publicado, testado ou coberto — o check verde deste repositório já mentiu de cinco formas diferentes
triggers:
  - depois de um deploy fechar verde
  - antes de dizer que algo está no ar, publicado ou coberto por teste
  - quando um gate passa e você não viu o efeito dele
  - ao publicar pacote npm pelo CI
  - ao acrescentar arquivo de teste, app, permissão ou origem externa
---

# Verificar o fato, não o sinal

Um sinal verde afirma que **um processo terminou**, nunca que **o efeito aconteceu**. Neste
repositório os dois já divergiram cinco vezes, cada uma por um mecanismo diferente, e nenhuma ficou
vermelha para avisar.

A regra é uma só: **quando um sinal afirmar sucesso, confira a evidência independente dele.**

## O que conferir, por tipo de afirmação

| A afirmação | A evidência independente | Como |
|---|---|---|
| "a landing está publicada" | o bundle servido no ar | baixar `/assets/index-*.js` do host e procurar uma string que **só** existe na versão nova |
| "a API subiu" | a resposta dela | `curl` numa rota real; `401` com envelope é sinal de vida, `000`/timeout não |
| "o pacote foi publicado" | o registro npm | `bun add <pacote>@<versão>` num diretório descartável e importar de verdade |
| "o teste cobre isso" | a lista declarada | o arquivo está em `scripts.test` do `package.json`? (contrato `test-registry`) |
| "a CSP está limpa" | o asset existir | a diretiva só mede algo se o recurso for **emitido**; confira `dist/assets/` |
| "o job protege X" | a condição parseada | ler o `if:` do YAML, não o comentário acima dele |

## O caso mais perigoso: gate satisfeito por ausência

**Um gate que passa porque não há nada para medir passa sempre.** Foi o que quase deixou a leitura de
PDF entrar sem prova: a CSP veio sem `unsafe-eval` e sem `blob:` num bundle onde **nada importava o
carregador**, então o pdf.js nunca era carregado e nenhuma diretiva era exercitada.

Antes de aceitar um gate verde, pergunte: *o que este gate teria medido se o recurso não existisse?*
Se a resposta for "o mesmo", ele não mediu nada.

O mesmo vale para: teste que não está na lista, app que não está no filtro, permissão que não está
na allowlist, origem que não está no `connect-src`.

## Casos reais desta base (2026-08-27)

1. **Marco de deploy avançando sem deploy.** `mark-deployed` empurrava `refs/deploy/<env>/<alvo>`
   mesmo com o job pulado, e o alvo ficava invisível ao filtro de diff **para sempre**. A landing
   ficou meses de commits atrás com todo run verde. Descoberto baixando o bundle do ar.
2. **CSP limpa sem medir nada** (acima).
3. **Publish verde, pacote 404.** O workflow do changesets fechou verde; o *packument* respondia 404
   por cache do registro. O endpoint da versão respondia 200 e a instalação funcionava — mas só
   instalar provou. Não confie no `dist-tags` para decidir isso.
4. **Teste no disco fora da lista.** `scripts.test` é uma linha com mais de 140 caminhos; quem a
   reescreve de uma cópia antiga derruba entradas. Pior: caminho declarado que **não existe** é
   ignorado em silêncio pelo `bun test`. Guardado hoje pelo contrato `test-registry`.
5. **`deploy-services` publicando com gate vermelho.** `always()` desligava a propagação do skip, e a
   guarda só recusava `failure`/`cancelled` — `skipped` passava. O comentário acima do `if:`
   descrevia a intenção certa; a condição fazia outra coisa.

## Critério de sucesso

- Toda afirmação de "está no ar / publicado / coberto" tem uma linha de evidência **fora** do
  pipeline que a produziu.
- Nenhum gate é aceito sem a pergunta "o que ele mediria se o recurso não existisse?".
- Divergência entre comentário e condição é resolvida lendo a condição.

## Armadilhas

- `wc -l` sobre saída filtrada pelo `rtk` conta linha mesmo quando o resultado é vazio — listar os
  nomes, não contar.
- Falha local por trabalho **não commitado** (pasta `??` no `git status`) **não** reproduz no CI: o
  checkout não a tem. Não confundir com defeito real.
- Falha de rede (`Failed to fetch` contra a Railway) pede **repetir**, não consertar. É a única
  categoria do dia cuja resposta certa não é mudar código.
- Asserção de texto sobre arquivo-fonte varre **comentário** junto: `not.toContain('blob:')` reprova
  por causa da prosa que explica que `blob:` seria errado. Filtre comentários antes de comparar.

## O que isto não cobre

Não substitui teste. É a checagem de que o teste, o gate e o deploy estão **olhando** para o que
dizem olhar.
