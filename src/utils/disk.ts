import { promises as fsPromises } from 'fs';
import { JellyError } from './errors.ts';
import { formatSize } from './formatters.ts';
import { t } from './i18n.ts';

/**
 * Checks if the directory has enough free disk space.
 * @param directoryPath Absolute path to the directory to check.
 * @param requiredBytes Required size in bytes.
 * @throws {JellyError} If disk space is insufficient or another error occurs.
 */
export async function checkFreeDiskSpace(directoryPath: string, requiredBytes: number): Promise<void> {
  try {
    const stats = await fsPromises.statfs(directoryPath);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < requiredBytes) {
      throw new JellyError(
        t('errorDiskSpace', formatSize(requiredBytes), formatSize(freeBytes)),
        'INSUFFICIENT_DISK_SPACE'
      );
    }
  } catch (error) {
    if (error instanceof JellyError) {
      throw error;
    }
    throw new JellyError(
      `Failed to verify disk space: ${(error as Error).message}`,
      'DISK_SPACE_CHECK_FAILED'
    );
  }
}
