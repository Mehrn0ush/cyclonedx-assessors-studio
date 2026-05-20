import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { expectMessage } from '../helpers/wait.js';

/**
 * Locators for the standards list view (/standards) and the
 * create-standard dialog. Detail-view interactions live in
 * StandardDetailPage. Most standards lifecycle tests drive the
 * API directly because the state machine is the thing under
 * test and toast/dialog locators add flake without adding
 * signal; this POM exists for the UI tests that verify a
 * standards_manager can see and create from the list.
 */
export class StandardsPage {
  readonly page: Page;
  readonly newStandardButton: Locator;
  readonly tableRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newStandardButton = page
      .getByRole('button', { name: /new standard|create standard/i })
      .first();
    this.tableRows = page.locator('.el-table__row');
  }

  async goto(): Promise<void> {
    await this.page.goto('/standards');
    await expect(this.page).toHaveURL(/\/standards/);
  }

  async createStandard(opts: {
    identifier: string;
    name: string;
    version?: string;
    description?: string;
  }): Promise<void> {
    await this.newStandardButton.click();
    const dialog = this.page.locator('.el-dialog').filter({
      has: this.page.getByRole('heading', { name: /new standard|create standard/i }),
    });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByLabel(/identifier/i).fill(opts.identifier);
    await dialog.getByLabel(/^name$/i).fill(opts.name);
    if (opts.version) {
      await dialog.getByLabel(/version/i).fill(opts.version);
    }
    if (opts.description) {
      await dialog.getByLabel(/description/i).fill(opts.description);
    }
    // The submit button currently reads "Create Draft" (see
    // standards.createDraft in the en-US bundle). Accept the older
    // "Create"/"Save" labels too so the POM stays compatible if the
    // copy changes.
    await dialog.getByRole('button', { name: /^create( draft)?$|^save$/i }).last().click();
    await expectMessage(this.page, /created|success/i);
  }
}
