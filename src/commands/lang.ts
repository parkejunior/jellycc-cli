import { select, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { setLanguage, availableLanguages } from '../utils/i18n.ts';

// Um dicionário visual para os idiomas ficarem bonitos no menu
const displayNames: Record<string, string> = {
  'pt-BR': '🇧🇷 Português (Brasil)',
  'en-US': '🇺🇸 English (US)'
};

export async function langCommand() {
  const options = availableLanguages.map(lang => ({
    label: displayNames[lang] || lang,
    value: lang
  }));

  const selectedLang = await select({
    message: '🌐 Selecione o idioma de sua preferência / Select your preferred language:',
    options: options
  });

  if (isCancel(selectedLang)) {
    cancel('Operação cancelada / Operation cancelled.');
    process.exit(0);
  }

  try {
    // Salva a preferência no ~/.jellycc.json
    setLanguage(selectedLang as string);
    
    // Mensagem bilíngue para garantir que o usuário entenda o sucesso
    outro(pc.green(`✔ Idioma alterado com sucesso! / Language changed successfully!`));
  } catch (err) {
    cancel(pc.red('✖ Erro ao salvar a configuração de idioma / Error saving language config.'));
    process.exit(1);
  }
}