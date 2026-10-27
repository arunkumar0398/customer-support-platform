import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';

const outputDirectory = resolve(process.cwd(), 'evidence/checkpoints/screenshots/TK-29');

export async function captureCheckpointScreenshot(page: Page, filename: string) {
  mkdirSync(outputDirectory, { recursive: true });
  await page.screenshot({ path: join(outputDirectory, filename), fullPage: true });
}
