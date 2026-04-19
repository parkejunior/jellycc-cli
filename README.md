# 🎬 JellyCC CLI - Jellyfin Codec & Integrity Checker

Uma ferramenta de linha de comando (CLI) construída para analisar, diagnosticar e converter arquivos de mídia para máxima compatibilidade com o ecossistema Jellyfin (Direct Play).

Este utilitário não apenas cruza as informações da mídia com uma matriz de compatibilidade de clientes (Chrome, Roku, Safari, Android, etc.), mas também realiza varreduras de integridade para evitar que arquivos corrompidos quebrem a reprodução no servidor.

## 🚀 Funcionalidades

- **Quick Scan (Instantâneo):** Analisa o cabeçalho do container com `ffprobe` para identificar arquivos mortos ou severamente corrompidos antes de gastar processamento.
- **Deep Scan (Opcional):** Decodifica a mídia inteira com `ffmpeg` (exibindo barra de progresso) para caçar artefatos, falhas no bitstream e problemas de sincronia (A/V sync).
- **Matriz de Compatibilidade:** Cruza as faixas de vídeo e áudio com o arquivo `Jellyfin Codec Support.yaml` para exibir um relatório visual de suporte por cliente.
- **Smart Transcoding:** Baseado no `fallback_rules.yaml`, sugere e executa comandos do FFmpeg inteligentemente (ex: copiando o vídeo e legendas intactas, e recodificando apenas um áudio DTS incompatível para EAC3).
- **Interface Interativa:** Utiliza o `@clack/prompts` para uma navegação de terminal fluida e moderna.

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

O script cuidará da conversão das configurações, da compilação do binário usando o Bun e da instalação global do executável no seu sistema.

## 🎮 Como Usar

Após a instalação, você pode iniciar a ferramenta de forma iterativa:

```bash
jellycc
```

_(A ferramenta aceita Drag & Drop de arquivos direto no terminal, removendo automaticamente as aspas simples/duplas inseridas pelo sistema)._

Ou passar os argumentos diretamente:

```bash
jellycc /caminho/para/o/filme.mkv
```

Para iniciar com a varredura profunda ativada:

```bash
jellycc --deep-scan /caminho/para/o/filme.mkv
```

## ⚙️ Configuração

As regras de conversão podem ser totalmente ajustadas no arquivo `fallback_rules.yaml`. O padrão atual prioriza manter o container `.mkv`, garantir vídeo `h264_8bit` e converter áudios sem suporte universal para `EAC3` (surround), `FLAC` (lossless) ou `AAC` (estéreo fallback).
