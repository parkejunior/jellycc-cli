import { execSync } from 'child_process';
import { spinner, cancel } from '@clack/prompts';
import pc from 'picocolors';
import { t } from './i18n.ts';

export function runQuickScan(videoPath: string) {
  const qsSpinner = spinner();
  qsSpinner.start(t('scanQuickStart'));
  try {
    execSync(`ffprobe -v error -show_entries format -of default=noprint_wrappers=1 "${videoPath}"`, { stdio: 'pipe' });
    qsSpinner.stop(pc.green(t('scanQuickPass')));
  } catch (err) {
    qsSpinner.stop(pc.red(t('scanQuickFail')));
    cancel(t('scanCorrupted'));
    process.exit(1);
  }
}

export function getMediaInfo(videoPath: string) {
  const s = spinner();
  s.start(t('scanAnalyze'));

  let probeData;
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    probeData = JSON.parse(result);
  } catch (err) {
    s.stop(pc.red(t('scanAnalyzeErr')));
    process.exit(1);
  }
  s.stop(t('scanAnalyzeDone'));
  return probeData;
}