import { mkdirSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import type { Page } from '@playwright/test';

export async function captureCheckpointScreenshot(page: Page, filename: string) {
  const configuredDirectory = process.env.CHECKPOINT_SCREENSHOT_DIR?.trim();
  if (!configuredDirectory) return;

  const outputDirectory = resolve(configuredDirectory);
  const protectedDirectory = resolve(process.cwd(), 'evidence/checkpoints/screenshots/TK-29');
  const relativeToProtected = relative(protectedDirectory, outputDirectory);
  if (relativeToProtected === '' || (!relativeToProtected.startsWith('..') && !isAbsolute(relativeToProtected))) {
    throw new Error('CHECKPOINT_SCREENSHOT_DIR must not point inside the protected TK-29 screenshot directory.');
  }

  mkdirSync(outputDirectory, { recursive: true });
  await page.screenshot({ path: join(outputDirectory, filename), fullPage: true });
}
