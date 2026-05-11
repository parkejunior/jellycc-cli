# Configuração do JellyCC

O JellyCC segue o padrão **XDG Base Directory**. Todos os arquivos de configuração ficam em:

```
~/.config/jellycc/
├── config.json       # Preferências do usuário (idioma)
└── rules.json        # Regras de conversão personalizadas (opcional)
```

## Comando `config`

O comando `config` gerencia todas as preferências da CLI. Sem argumentos, abre um menu interativo.

```bash
jellycc config
```

### Opções

| Flag | Descrição |
|---|---|
| `--init` | Gera um arquivo `rules.example.json` no diretório de configuração como ponto de partida para customização |
| `--lang <código>` | Define o idioma diretamente sem abrir o menu interativo |

```bash
# Gerar o template de regras
jellycc config --init

# Trocar idioma direto pela linha de comando
jellycc config --lang en-US
jellycc config --lang pt-BR
```


## `config.json`

Armazena as preferências do usuário. Gerenciado automaticamente pelo comando `config`.

```json
{
  "lang": "pt-BR"
}
```

### Campos

| Campo | Tipo | Valores aceitos | Descrição |
|---|---|---|---|
| `lang` | `string` | `pt-BR`, `en-US` | Idioma da interface da CLI |


## `rules.json`

Define os **alvos de conversão** do seu servidor. Este arquivo é **opcional** — sem ele, o JellyCC usa as regras padrão embutidas.

Para criar o seu a partir do template:

```bash
jellycc config --init
# Um arquivo rules.example.json será criado em ~/.config/jellycc/
# Renomeie-o para rules.json e edite conforme necessário
cp ~/.config/jellycc/rules.example.json ~/.config/jellycc/rules.json
```

### Estrutura completa

```json
{
  "container": "mkv",
  "video": {
    "target": "h264_8bit"
  },
  "audio": {
    "acceptable": [
      "aac",
      "eac3",
      "flac"
    ],
    "mappings": {
      "ac3":  { "target": "eac3" },
      "dts":  { "target": "eac3" },
      "alac": { "target": "flac" },
      "default": { "target": "aac" }
    }
  }
}
```

### `container`

Container de saída para todos os arquivos processados.

| Valor | Notas |
|---|---|
| `mkv` | **Padrão recomendado.** Suportado pela maioria dos clientes Jellyfin |
| `mp4` | Boa compatibilidade, mas limita legendas a formatos de texto simples |


### `video.target`

Codec de vídeo alvo. Arquivos já nesse formato são copiados sem *transcode*.

| Valor | Descrição |
|---|---|
| `h264_8bit` | **Padrão recomendado.** Máxima compatibilidade com todos os clientes |
| `h264_10bit` | HDR em H.264; compatibilidade mais limitada (ex: Firefox não suporta) |
| `hevc_8bit` | Maior compressão; requer hardware compatível no cliente |
| `hevc_10bit` | HDR em HEVC; suporte variável por dispositivo |

### `audio.acceptable`

Lista de codecs que o JellyCC considera **já ideais**. Faixas nesses formatos são sempre copiadas sem recodificação, independente do `mappings`.

Valores válidos: `aac`, `eac3`, `ac3`, `flac`, `mp3`, `opus`, `vorbis`, `alac`, `dts`

### `audio.mappings`

Define para qual codec converter quando o original **não está** na lista `acceptable`. A chave `default` serve como fallback para qualquer codec não mapeado explicitamente.

O bitrate de saída é calculado automaticamente: `112 kbps × número de canais`, respeitando o bitrate original da fonte e os limites do codec (`eac3` ≤ 768 kbps).

| Codec de entrada | Target recomendado | Motivo |
|---|---|---|
| `ac3` | `eac3` | Upgrade sem perdas perceptíveis, suporte amplo |
| `dts` | `eac3` | `dts` não tem Direct Play na maioria dos browsers |
| `alac` | `flac` | Ambos lossless; FLAC tem suporte mais amplo |
| `default` | `aac` | Maior compatibilidade universal |