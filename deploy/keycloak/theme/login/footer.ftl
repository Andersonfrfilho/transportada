<#--
  Copyright (c) 2026 Ada Technology. MIT License.

  O `base` já traz um `footer.ftl`, e é o que o `template.ftl` importa — só que o macro dele é vazio.
  Sobrescrever o arquivo aqui faz o rodapé existir em toda página do tema, inclusive nas herdadas do
  `base` (erro, sessão expirada, verificação de e-mail), sem tocar em nenhuma delas.
-->
<#--
  A marca da Ada Technology é cópia por valor de `ada-icon.png` do repositório `ada-technology`, só
  reduzida — o tema não importa código nosso, e menos ainda de outro repositório. Não use o
  `ada-icon-192.png`: aquele é ícone de PWA, opaco por definição, e o fundo branco dele vira um bloco
  aqui. `alt` vazio porque o nome está escrito ao lado: anunciar a imagem repetiria a palavra no
  leitor de tela.
-->
<#macro content>
    <footer class="colophon">
        <p>
            <img class="colophon-mark" src="${url.resourcesPath}/img/ada-technology.png" alt="" />
            <span>${msg("transportadaColophon", .now?string('yyyy'))}</span>
        </p>
    </footer>
</#macro>
