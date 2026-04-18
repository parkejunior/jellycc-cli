# 🎬 Jellyfin Codec & Integrity Checker

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

Clone o repositório e instale as dependências:

```bash
bun install
```

Certifique-se de que os arquivos de configuração (`Jellyfin Codec Support.yaml` e `fallback_rules.yaml`) estejam na raiz do projeto.

## 🎮 Como Usar

Você pode iniciar a ferramenta de forma iterativa:
```bash
bun run index.js
```
*(A ferramenta aceita Drag & Drop de arquivos direto no terminal, removendo automaticamente as aspas simples/duplas inseridas pelo sistema).*

Ou passar os argumentos diretamente:
```bash
bun run index.js /caminho/para/o/filme.mkv
```

Para iniciar com a varredura profunda ativada:
```bash
bun run index.js --deep-scan /caminho/para/o/filme.mkv
```

## ⚙️ Configuração

As regras de conversão podem ser totalmente ajustadas no arquivo `fallback_rules.yaml`. O padrão atual prioriza manter o container `.mkv`, garantir vídeo `h264_8bit` e converter áudios sem suporte universal para `EAC3` (surround), `FLAC` (lossless) ou `AAC` (estéreo fallback).