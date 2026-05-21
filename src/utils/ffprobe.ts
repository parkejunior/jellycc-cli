import { execSync } from 'child_process';
import { spinner } from '@clack/prompts';
import pc from 'picocolors';
import { t } from './i18n.ts';
import { JellyError, ValidationError } from './errors.ts';
import type { FFprobeData } from '../types/media';

export function runQuickScan(videoPath: string) {
  const qsSpinner = spinner();
  qsSpinner.start(t('scanQuickStart'));
  try {
    execSync(`ffprobe -v error -show_entries format -of default=noprint_wrappers=1 "${videoPath}"`, { stdio: 'pipe' });
    qsSpinner.stop(pc.green(t('scanQuickPass')));
  } catch (err) {
    qsSpinner.stop(pc.red(t('scanQuickFail')));
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      throw new JellyError(t('scanAnalyzeErr'), 'FFPROBE_NOT_FOUND');
    }
    throw new ValidationError(t('scanCorrupted'));
  }
}

export function getMediaInfo(videoPath: string): FFprobeData {
  const s = spinner();
  s.start(t('scanAnalyze'));

  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    const probeData = JSON.parse(result) as FFprobeData;
    s.stop(t('scanAnalyzeDone'));
    return probeData;
  } catch (err) {
    s.stop(pc.red(t('scanAnalyzeErr')));
    throw new JellyError(t('scanAnalyzeErr'), 'FFPROBE_JSON_ERROR');
  }
}
