import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { PAGE_CONTENT_HEIGHT } from './one-page.js';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

function resumedBin(): string {
  const main = fileURLToPath(import.meta.resolve('resumed'));
  return join(dirname(dirname(main)), 'bin', 'resumed.js');
}

export function renderHtml(
  resumePath: string,
  htmlPath: string,
  theme: string,
): void {
  const result = spawnSync(
    process.execPath,
    [resumedBin(), 'render', resumePath, '-o', htmlPath, '-t', theme],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  if (result.error || result.status !== 0 || !existsSync(htmlPath)) {
    const detail =
      result.error?.message ||
      result.stderr?.trim() ||
      `exited with status ${result.status}`;
    throw new Error(`Could not render resume HTML: ${detail}`);
  }
}

export function renderPdf(
  resumePath: string,
  pdfPath: string,
  theme: string,
): void {
  const result = spawnSync(
    process.execPath,
    [
      resumedBin(),
      'export',
      resumePath,
      '-o',
      pdfPath,
      '-t',
      theme,
      '--puppeteer-arg=--no-sandbox',
    ],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 180_000,
    },
  );
  if (result.error || result.status !== 0 || !existsSync(pdfPath)) {
    const detail =
      result.error?.message ||
      result.stderr?.trim() ||
      `exited with status ${result.status}`;
    throw new Error(`Could not render resume PDF: ${detail}`);
  }
}

export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const pdf = await PDFDocument.load(readFileSync(pdfPath), {
    ignoreEncryption: true,
  });
  return pdf.getPageCount();
}

export interface PageMeasurer {
  measure(htmlPath: string): Promise<number>;
  close(): Promise<void>;
}

export async function createPageMeasurer(): Promise<PageMeasurer> {
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return {
    async measure(htmlPath: string): Promise<number> {
      const page = await browser.newPage();
      try {
        await page.emulateMediaType('print');
        await page.setViewport({
          width: 720,
          height: PAGE_CONTENT_HEIGHT,
          deviceScaleFactor: 1,
        });
        await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
        return await page.evaluate(() => {
          const resume =
            document.querySelector('#resume') ?? document.body;
          return resume.getBoundingClientRect().height;
        });
      } finally {
        await page.close();
      }
    },
    async close(): Promise<void> {
      await browser.close();
    },
  };
}
