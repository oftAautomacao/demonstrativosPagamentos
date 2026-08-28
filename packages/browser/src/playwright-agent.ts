import { chromium, type Browser, type Page } from 'playwright';

import type { BrowserAgent, DownloadedFile } from './types';

export class PlaywrightBrowserAgent implements BrowserAgent {
  private browser: Browser | null = null;

  private page: Page | null = null;

  private async ensurePage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    this.browser = await chromium.launch({ headless: true });
    const context = await this.browser.newContext({ acceptDownloads: true });
    this.page = await context.newPage();
    return this.page;
  }

  public async open(url: string): Promise<void> {
    const page = await this.ensurePage();
    await page.goto(url);
  }

  public async click(selector: string): Promise<void> {
    const page = await this.ensurePage();
    await page.click(selector);
  }

  public async fill(selector: string, value: string): Promise<void> {
    const page = await this.ensurePage();
    await page.fill(selector, value);
  }

  public async waitFor(selector: string): Promise<void> {
    const page = await this.ensurePage();
    await page.waitForSelector(selector);
  }

  public async textContent(selector: string): Promise<string | null> {
    const page = await this.ensurePage();
    return page.textContent(selector);
  }

  public async currentUrl(): Promise<string> {
    const page = await this.ensurePage();
    return page.url();
  }

  public async screenshot(): Promise<Buffer> {
    const page = await this.ensurePage();
    return page.screenshot();
  }

  public async download(trigger: () => Promise<void>): Promise<DownloadedFile> {
    const page = await this.ensurePage();
    const downloadPromise = page.waitForEvent('download');
    await trigger();
    const download = await downloadPromise;
    const stream = await download.createReadStream();

    if (!stream) {
      throw new Error('Nao foi possivel abrir o download realizado.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return {
      fileName: download.suggestedFilename(),
      content: Buffer.concat(chunks),
    };
  }

  public async close(): Promise<void> {
    await this.browser?.close();
    this.page = null;
    this.browser = null;
  }
}
