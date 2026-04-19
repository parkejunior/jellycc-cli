# 🎬 JellyCC CLI - Jellyfin Codec & Integrity Checker

Uma ferramenta de linha de comando (CLI) construída para analisar, diagnosticar e converter arquivos de mídia para máxima compatibilidade com o ecossistema Jellyfin (Direct Play).

Este utilitário não apenas cruza as informações da mídia com uma matriz de compatibilidade de clientes (Chrome, Roku, Safari, Android, etc.), mas também realiza varreduras de integridade e oferece um sistema avançado para mesclar arquivos (remuxing).

## 🚀 Funcionalidades

- **Múltiplos Comandos (`check` e `merge`):** Arquitetura modular que permite analisar um único arquivo ou mesclar faixas de dois arquivos distintos.
- **Remuxing Interativo (`merge`):** Junte a melhor imagem de um arquivo com as dublagens e legendas de outro. O "Juiz Visual" inteligente avalia automaticamente a resolução, codec e bitrate para eleger a melhor base de vídeo.
- **Motor de Qualidade Dinâmica:** O transcoding deixou de ser engessado. O script adota a regra _Visually Lossless_ (CRF 18 / Preset Slow) para conversões de vídeo e calcula bitrates de áudio dinamicamente pelo número de canais (ex: garantindo bitrates maiores para EAC3 5.1 e econômicos para AAC Estéreo).
- **Quick Scan (Instantâneo):** Analisa o cabeçalho do container com `ffprobe` para identificar arquivos mortos ou severamente corrompidos antes de gastar processamento.
- **Deep Scan (Opcional):** Decodifica a mídia inteira com `ffmpeg` (exibindo barra de progresso) para caçar artefatos, falhas no bitstream e problemas de sincronia (A/V sync).
- **Matriz de Compatibilidade:** Cruza as faixas de vídeo e áudio com o arquivo `jellyfin-codec-support.yaml` para exibir um relatório visual de suporte por cliente.
- **Interface Interativa:** Utiliza o `@clack/prompts` para uma navegação de terminal fluida, incluindo menus de multisseleção de faixas.

## 🛠️ Pré-requisitos

- **[Bun](https://bun.sh/)** (Runtime JavaScript)
- **FFmpeg & FFprobe** (Instalados globalmente no sistema)

## 📦 Instalação

Para instalar a ferramenta globalmente no seu sistema e poder usá-la a partir de qualquer diretório através do comando `jellycc`, utilize o script de instalação incluso.

> [!IMPORTANT]
> Certifique-se de que o **FFmpeg** e o **FFprobe** estejam instalados no seu sistema de forma global, pois o JellyCC depende estritamente deles para realizar as análises e conversões.

1. Clone o repositório.
2. Dê permissão de execução ao script (se necessário):
   ```bash
   chmod +x ./install.sh
   ```
3. Execute o script de instalação:
   ```bash
   ./install.sh
   ```

O script cuidará da conversão das configurações YAML para JSON, da compilação do binário usando o Bun e da instalação global do executável no seu sistema (geralmente em `~/.local/bin/`).

## 🎮 Como Usar

A CLI agora possui comandos específicos. _(A ferramenta aceita Drag & Drop de arquivos direto no terminal, removendo automaticamente as aspas simples/duplas)._

### 🔍 Analisar um Único Arquivo (`check`)

Avalia a mídia contra a matriz Jellyfin e sugere comandos de conversão ideais. O `check` é o comando padrão, então a palavra pode ser omitida.

```bash
jellycc check /caminho/para/o/filme.mkv
# Ou de forma simplificada:
jellycc /caminho/para/o/filme.mkv
```

Para iniciar com a varredura profunda (Integridade) ativada:

```bash
jellycc --deep-scan /caminho/para/o/filme.mkv
```

### 🧬 Mesclar Arquivos (`merge`)

Ideal para juntar um vídeo de alta qualidade (ex: release HEVC gringo) com o áudio dublado de um arquivo antigo.

```bash
jellycc merge
```

O menu pedirá o caminho dos dois arquivos e abrirá a seleção interativa de quais faixas de áudio e legendas você deseja herdar de cada um para o `.mkv` definitivo.

## ⚙️ Configuração

O arquivo `fallback_rules.yaml` atua como a sua "fonte da verdade" para os **alvos** de conversão (ex: preferir o container `.mkv`, garantir target de vídeo `h264_8bit`, e transformar WMA em `EAC3`).

A codificação final do FFmpeg não é mais engessada no YAML; o motor embutido (`ffmpeg.ts`) calcula sozinho o melhor Encoder, Preset, CRF e Bitrate no momento da execução para garantir qualidade de nível entusiasta sem inflar o tamanho do arquivo final.
