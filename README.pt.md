<div align="center">
  <h1 align="center">JellyCC CLI</h1>
</div>
<p align="center">
  Uma CLI inteligente que diagnostica, audita, repara, padroniza e otimiza sua mídia para garantir <i>Direct Play</i> no Jellyfin.
</p>

<p align="center">
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white" /></a> 
  <a href="https://bomb.sh/"><img src="https://img.shields.io/badge/Bombshell-ff00d0?style=flat&logo=diaspora&logoColor=white" /></a> 
  <a href="https://ffmpeg.org/"><img src="https://img.shields.io/badge/FFmpeg-007808?style=flat&logo=ffmpeg&logoColor=white" /></a>
  <a href="https://codecov.io/github/parkejunior/jellycc-cli"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/parkejunior/jellycc-cli?style=flat&logo=codecov&labelColor=172a3a&color=b2ff9e&label=Coverage" /></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> |
  <a href="README.pt.md">🇧🇷 Português (Brasil)</a>
</p>

<div align="center">
  <img src="docs/assets/images/screenshot.png" alt="JellyCC CLI Screenshot" width="800" />
</div>

## ✨ Funcionalidades

- 🔍 **Análise de Compatibilidade** — Matriz de compatibilidade com Direct Play por cliente Jellyfin (Chrome, Firefox, Android TV, etc.).
- 🚀 **Limpeza (Remux)** — Reencapsula para MKV sem recodificar, preservando qualidade original.
- 🔄 **Conversão (Transcode)** — Converte para codecs Direct Play (H.264 8-bit / AAC, EAC3 ou FLAC) com regras de fallback configuráveis.
- 🔧 **Reparo Forçado** — Corrige arquivos com timestamps corrompidos via pipeline intermediário (`.w64`/`.mp4`).
- 🔬 **Quick Scan + Deep Scan** — Verifica integridade do container e analisa quadro a quadro em busca de artefatos e erros.
- 🔬 **Myopic Scan** — Deep Scan restrito às faixas selecionadas.
- 🎛️ **Seleção de Faixas** — Escolha quais streams de vídeo, áudio e legenda manter no arquivo final.
- 🎶 **Smart Spectrum Sync** — Alinha automaticamente faixas de áudio de origens diferentes, usando correlação matemática de ondas sonoras.
- ⏱️ **Ajuste de Sincronia / Corte Final** — Define offset temporal e corte final para evitar problemas de lip-sync.
- 🔀 **Mesclagem de Arquivos** — Une faixas de dois arquivos em um único MKV, com sync automático/manual e Modo Estrito.
- 🏷️ **Edição de Tags** — Edita idioma (ex: `por`, `eng`, `jpn`) e título de cada faixa.
- 🌐 **Internacionalização** — Interface em Inglês (en-US) e Português do Brasil (pt-BR).
- ⚠️ **Detecção de Lixo Embutido** — Detecta e remove capas/thumbnails e legendas PGS que forçam transcoding.

## 🛠️ Pré-requisitos

- **[FFmpeg & FFprobe](https://www.ffmpeg.org/download.html)** (Instalados globalmente no sistema)

## 📦 Instalação

> [!IMPORTANT]
> Certifique-se de que o **FFmpeg** e o **FFprobe** estejam instalados no seu sistema de forma global, pois o JellyCC depende estritamente deles para realizar as análises e conversões.

Execute o script de instalação:
```bash
curl -fsSL https://raw.githubusercontent.com/parkejunior/jellycc-cli/main/install.sh | bash
```
## 🚀 Uso

### Analise e limpeza

Para analisar um arquivo de vídeo, execute o comando:
```bash
jellycc
```
Ou se preferir, você pode abrir o arquivo diretamente no terminal:

```bash
jellycc check [caminho/do/arquivo]
# ou
jellycc [caminho/do/arquivo]
```

Se você quiser executar a análise completa, inclua o parâmetro `--deep-scan`:
```bash
jellycc check [caminho/do/arquivo] --deep-scan
```

### Merclagem

Para mesclar vários arquivos em um único MKV, execute o comando:
```bash
jellycc merge
```

### Configuração

Caso queira alterar o idioma da interface ou criar um arquivo de configuração `rules.json`, execute o comando:
```bash
jellycc config
```

> [!TIP]
> Arraste e solte o arquivo de vídeo direto no terminal para preencher o caminho automaticamente.

> [!NOTE]
> O resultado é salvo na mesma pasta da mídia original com os sufixos `.jellycc.mkv` ou `.jellycc_merged.mkv`.

## ☰ Menu Interativo

Após a análise de um arquivo, um menu interativo é exibido com as seguintes opções:

- 🚀 **Limpeza (Remux)** — Reencapsula sem recodificar.
- 🔄 **Conversão** — Converte codecs incompatíveis para *Direct Play*
- 🔧 **Reparo Forçado** — Recodificação via pipeline intermediário para arquivos com timestamps corrompidos.
- 🎛️ **Modificar faixas** — Seleciona quais streams de vídeo, áudio e legenda manter.
- ⏱️ **Ajustar Sincronia / Corte Final** — Define offset temporal e corte final.
- 🔍 **Deep Scan** — Análise quadro a quadro de todas as faixas.
- 🔬 **Myopic Scan** — Deep Scan apenas nas faixas selecionadas.
- 🏷️ **Editar Tags** — Edita idioma e título de cada faixa.

## ⚙️ Configuração

Você pode ver a lista completa de configurações na [documentação de configuração](docs/CONFIGURATION.pt.md).

## ⚖️ Licença

JellyCC é licenciado sob os termos da [MIT + Commons Clause](LICENSE).