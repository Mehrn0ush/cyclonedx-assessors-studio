import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { expectMessage } from '../helpers/wait.js';

export class AssessmentsPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly tableRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /create|new assessment/i }).first();
    this.searchInput = page.getByPlaceholder(/search/i).first();
    this.tableRows = page.locator('.el-table__row');
  }

  async goto(): Promise<void> {
    await this.page.goto('/assessments');
    await expect(this.page).toHaveURL(/\/assessments$/);
  }

  async openCreateDialog(): Promise<Locator> {
    await this.createButton.click();
    const dialog = this.page.locator('.el-dialog').filter({ visible: true }).first();
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  /**
   * Create an assessment via the dialog. All locators are scoped to
   * the dialog so the underlying list table (which also has columns
   * named "Title", "Project", etc.) cannot match.
   */
  async createAssessment(opts: {
    title: string;
    description?: string;
    entityName?: string;
    projectName?: string;
    standardLabel: string | RegExp;
  }): Promise<void> {
    const dialog = await this.openCreateDialog();

    await dialog.getByRole('textbox', { name: /title/i }).first().fill(opts.title);
    if (opts.description) {
      await dialog.getByRole('textbox', { name: /description/i }).first().fill(opts.description);
    }

    // Element Plus el-select inputs are readonly and intercepted by a
    // placeholder overlay; click the wrapper, not the input.
    const clickSelect = async (labelPattern: RegExp) => {
      const formItem = dialog
        .locator('.el-form-item')
        .filter({
          has: dialog.page().locator('.el-form-item__label').filter({ hasText: labelPattern }),
        })
        .first();
      await formItem.locator('.el-select__wrapper, .el-select').first().click();
    };

    // Open an el-select dropdown, wait for the previous one (if any)
    // to finish animating out, then click the named option. Element
    // Plus keeps each dropdown's <ul> in the DOM after close and only
    // updates `display: none` on the next tick. Selecting by
    // `:visible.first()` can grab the stale project dropdown while
    // the standard dropdown is animating in, producing a "not
    // stable" or "not visible" timeout. Take `.last()` so we always
    // act on the most recently opened panel.
    const pickOption = async (name: string | RegExp) => {
      const panel = this.page.locator('.el-select-dropdown:visible').last();
      await panel.waitFor({ state: 'visible' });
      await panel.getByRole('option', { name }).first().click();
    };

    if (opts.entityName) {
      await clickSelect(/assessment target/i);
      await pickOption(opts.entityName);
    }
    if (opts.projectName) {
      await clickSelect(/^project$/i);
      await pickOption(opts.projectName);
    }

    await clickSelect(/^standard$/i);
    await pickOption(opts.standardLabel);

    await dialog.getByRole('button', { name: /^create$/i }).last().click();
    await expectMessage(this.page, /assessment.+created|created/i);
  }

  async openAssessment(title: string): Promise<void> {
    await this.page.getByRole('link', { name: title }).first().click();
    await this.page.waitForURL(/\/assessments\/[0-9a-f-]+/);
  }
}

export class AssessmentDetailPage {
  readonly page: Page;
  readonly startButton: Locator;
  readonly completeButton: Locator;
  readonly archiveButton: Locator;
  readonly reopenButton: Locator;
  readonly stateBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startButton = page.getByRole('button', { name: /start assessment/i });
    this.completeButton = page.getByRole('button', { name: /complete assessment|complete$/i });
    this.archiveButton = page.getByRole('button', { name: /archive/i });
    this.reopenButton = page.getByRole('button', { name: /reopen/i });
    this.stateBadge = page.locator('[data-test="state-badge"], .state-badge').first();
  }

  /**
   * Start an assessment.
   *
   * The frontend opens an ElMessageBox.confirm modal before posting,
   * which is intentional UX — Start transitions the assessment to
   * in_progress and loads requirements, both irreversible. The test
   * must confirm the modal for the API call to fire.
   *
   * We assert the network response is 2xx rather than waiting for the
   * success toast: toasts auto-dismiss after ~3s and the assertion
   * races with that timer, producing flaky failures that look like
   * regressions but are clock-driven. The state badge assertion that
   * follows is the source of truth for "did Start actually work".
   */
  async start(): Promise<void> {
    const startResponse = this.page.waitForResponse(
      (r) => /\/api\/v1\/assessments\/[^/]+\/start$/.test(r.url()) && r.request().method() === 'POST',
    );
    await this.startButton.click();

    // Confirm the modal. Element Plus renders ElMessageBox into a
    // detached overlay; the button class is .el-message-box__btns >
    // .el-button--primary. Using getByRole('button', { name: /confirm/i })
    // is i18n-fragile, so we match the OK button by its primary class.
    const confirmModal = this.page.locator('.el-message-box').filter({ hasText: /start/i });
    await confirmModal.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmModal.locator('.el-button--primary').click();

    const resp = await startResponse;
    expect(resp.status(), `POST /start returned ${resp.status()}`).toBeLessThan(300);
  }

  async expectState(state: string | RegExp): Promise<void> {
    await expect(this.stateBadge).toHaveText(state);
  }
}
