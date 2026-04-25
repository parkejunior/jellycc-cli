# 🗺️ Plano de Atualização: Inteligência e Alertas de Legendas

Este plano detalha a implementação de verificações de segurança para faixas de legenda. O script passará a detectar legendas baseadas em imagem (PGS/VobSub) que forçam o _burn-in_ (Transcoding de vídeo) no Jellyfin, alertando o usuário sobre o risco de gargalo no servidor.

## 🎯 Objetivos

1. Detectar dinamicamente codecs de legenda baseados em imagem (ex: `hdmv_pgs_subtitle`, `dvd_subtitle`).
2. Adicionar o bloco "💬 LEGENDAS" no resumo do `check.ts`, classificando as faixas como seguras (Direct Play) ou arriscadas (Burn-in).
3. Injetar avisos coloridos diretamente nas opções do multiselect no `merge.ts` para desencorajar a herança de legendas pesadas.

## 🛠️ Fase 1: Helpers de Legenda (`src/utils/formatters.ts`)

Criar uma função utilitária para identificar o tipo da legenda.

- [ ] **Criar a função `isImageSubtitle(codecName)`:**
  - Lógica: Retorna `true` se o `codecName` for igual a `'hdmv_pgs_subtitle'`, `'dvd_subtitle'` ou `'vobsub'`. Retorna `false` caso contrário.
- [ ] **Criar a função `formatSubtitleCodec(codecName)`:**
  - Lógica: Mapear nomes técnicos para nomes humanos. Exemplo: `hdmv_pgs_subtitle` ➔ `PGS`; `subrip` ➔ `SRT`; `dvd_subtitle` ➔ `VobSub`. Para outros, retornar `codecName.toUpperCase()`.

## 🧬 Fase 2: Painel de Alerta no `check.ts`

Adicionar a listagem de legendas no painel de "Ação Planejada", logo abaixo do resumo de áudio.

- [ ] Filtrar as trilhas: `const subStreams = probeData.streams.filter((st: any) => st.codec_type === 'subtitle');`
- [ ] Se `subStreams.length > 0`, adicionar a seção `modLines.push(pc.bold('💬 LEGENDAS'));`
- [ ] Criar um loop para iterar pelas legendas (`subStreams.forEach((sStream, index) => ...)`).
- [ ] **Lógica de Renderização:**
  - `const lang = sStream.tags?.language ? sStream.tags.language.toUpperCase() : 'UND';`
  - `const codec = formatSubtitleCodec(sStream.codec_name);`
  - Se `!isImageSubtitle(sStream.codec_name)`:
    - Exibir: `  Faixa X: ${pc.green(codec + ' ✔')} | Idioma: ${pc.dim(lang)} | Status: ${pc.green('Direct Play Seguro')}`
  - Se `isImageSubtitle(sStream.codec_name)`:
    - Exibir: `  Faixa X: ${pc.yellow(codec + ' ⚠')} | Idioma: ${pc.dim(lang)} | Status: ${pc.yellow('Risco de Burn-in (Transcoding)')}`
- [ ] Manter o argumento final `-c:s copy` intocado (pois o script apenas alerta, a decisão de manter o arquivo com a legenda é do usuário).

## 🎛️ Fase 3: Alertas no "Cardápio" do `merge.ts`

Ajudar o usuário a não selecionar as legendas ruins na hora de mesclar os arquivos.

- [ ] Importar `isImageSubtitle` e `formatSubtitleCodec` no `merge.ts`.
- [ ] No construtor `processStream`, localizar a condição `else if (s.codec_type === 'subtitle')`.
- [ ] Modificar a string `label` para injetar o aviso.
  - Exemplo:
  ```typescript
  let subStatus = "";
  if (isImageSubtitle(s.codec_name)) {
    subStatus = pc.yellow(
      " ⚠ Risco de Burn-in (Prefira buscar um SRT externo)",
    );
  } else {
    subStatus = pc.green(" ✔ Seguro");
  }
  const cleanCodec = formatSubtitleCodec(s.codec_name);
  label = `[${cleanCodec}] (${lang})${title}${subStatus}`;
  ```
