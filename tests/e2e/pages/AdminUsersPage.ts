import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { expectMessage } from '../helpers/wait.js';
import type { RoleKey } from '../auth/credentials.js';

/**
 * Labels are the visible `<el-option label="...">` text from
 * AdminUsersView.vue (lines 103-107 / 126-130). They are not the role
 * keys; note the admin role's label is "Admin", not "Administrator".
 * If the labels change in the view, change them here in lockstep.
 */
const ROLE_OPTION_TEXT: Record<RoleKey, string> = {
  admin: 'Admin',
  assessor: 'Assessor',
  assessee: 'Assessee',
  standards_manager: 'Standards Manager',
  standards_approver: 'Standards Approver',
};

/**
 * Click an Element Plus el-select control by its parent form-item.
 *
 * el-select renders a readonly input that is covered by an
 * .el-select__placeholder overlay div. Clicking the input directly
 * fails with "intercepts pointer events" — the correct target is the
 * .el-select__wrapper or the form-item container itself.
 *
 * The dropdown options are rendered into a teleported portal, not
 * inside the dialog, so the caller must use `page.getByRole('option', ...)`
 * (page-scoped) rather than scoping to the dialog.
 */
async function openElSelectByLabel(
  dialog: Locator,
  labelPattern: RegExp,
): Promise<void> {
  const formItem = dialog
    .locator('.el-form-item')
    .filter({
      has: dialog.page().locator('.el-form-item__label').filter({ hasText: labelPattern }),
    })
    .first();
  await formItem.locator('.el-select__wrapper, .el-select').first().click();
}

export class AdminUsersPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: /create user|new user|add user/i }).first();
    this.tableRows = page.locator('.el-table__row');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/user-management?tab=users');
    await expect(this.page).toHaveURL(/admin\/user-management/);
  }

  async createUser(opts: {
    username: string;
    email: string;
    displayName: string;
    password: string;
    role: RoleKey;
  }): Promise<void> {
    await this.createButton.click();
    const dialog = this.page.locator('.el-dialog').filter({
      has: this.page.getByRole('heading', { name: /create user|new user|add user/i }),
    });
    await dialog.waitFor({ state: 'visible' });

    await dialog.getByLabel('Username', { exact: true }).fill(opts.username);
    await dialog.getByLabel('Email', { exact: true }).fill(opts.email);
    await dialog.getByLabel(/^display name$|^full name$/i).fill(opts.displayName);
    await dialog.getByLabel('Password', { exact: true }).fill(opts.password);
    await dialog.getByLabel(/^confirm password$/i).fill(opts.password);

    await openElSelectByLabel(dialog, /^role$/i);
    await this.page
      .getByRole('option', { name: ROLE_OPTION_TEXT[opts.role], exact: true })
      .first()
      .click();

    await dialog.getByRole('button', { name: /^create$|^save$/i }).last().click();
    await expectMessage(this.page, /user.+created|created|success/i);
  }

  async editUserRole(username: string, newRole: RoleKey): Promise<void> {
    // Reload the page to clear any leftover toast/overlay/dialog
    // state from the previous step in the test. handleSave fires
    // fetchUsers() but does not return a promise we can await; if
    // the test proceeded too fast, the row's action buttons could
    // be occluded by an animating overlay. A hard reload gives us
    // deterministic post-create state.
    await this.goto();
    const row = this.tableRows.filter({ hasText: username }).first();
    await row.waitFor({ state: 'visible', timeout: 15_000 });

    const editButton = row.locator('button.icon-btn--primary').first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    // The edit dialog reuses the create dialog component but with
    // its title set to `t('common.edit')` which resolves to "Edit"
    // (not "Edit User"). The username input is also disabled in
    // editing mode, which is a useful discriminator.
    const dialog = this.page.locator('.el-dialog').filter({
      has: this.page.getByRole('heading', { name: /^edit$|edit user/i }),
    });
    await dialog.waitFor({ state: 'visible' });
    await openElSelectByLabel(dialog, /^role$/i);
    await this.page
      .getByRole('option', { name: ROLE_OPTION_TEXT[newRole], exact: true })
      .first()
      .click();
    await dialog.getByRole('button', { name: /^save$|^update$/i }).last().click();
    await expectMessage(this.page, /updated|success/i);
  }

  async expectUserRow(username: string): Promise<Locator> {
    const row = this.tableRows.filter({ hasText: username }).first();
    await expect(row).toBeVisible();
    return row;
  }
}
