import { test, expect, storageStateFor } from '../../fixtures/index.js';
import type { APIRequestContext } from '@playwright/test';
import { AdminUsersPage } from '../../pages/AdminUsersPage.js';
import {
  strongPassword,
  uniqueDisplayName,
  uniqueEmail,
  uniqueUsername,
} from '../../helpers/data.js';
import type { RoleKey } from '../../auth/credentials.js';

/**
 * Find a user by exact username, paging through /api/v1/users until
 * found or the result set is exhausted. Avoids the local-PGlite
 * pagination flake where new users get pushed onto a later page as
 * test artifacts accumulate across runs.
 */
async function findUserByUsername(
  api: APIRequestContext,
  username: string,
): Promise<{ id: string; username: string; role: RoleKey } | null> {
  const limit = 100;
  let offset = 0;
  for (;;) {
    const r = await api.get(`/api/v1/users?limit=${limit}&offset=${offset}`);
    const body = await r.json();
    const found = (body.data as Array<{ id: string; username: string; role: RoleKey }>).find(
      (u) => u.username === username,
    );
    if (found) return found;
    if (body.data.length < limit) return null;
    offset += limit;
    if (offset > body.pagination.total) return null;
  }
}

/**
 * User management coverage with explicit regression for issue #20.
 * Every test in this file runs as admin via storage state injection.
 */
test.describe('Admin user management @regression', () => {
  test.use({ storageState: storageStateFor('admin') });

  const roles: RoleKey[] = ['admin', 'assessor', 'assessee', 'standards_manager', 'standards_approver'];

  for (const role of roles) {
    test(`admin can create a user with role=${role} (issue #20)`, async ({ page, apiAs }) => {
      const users = new AdminUsersPage(page);
      await users.goto();
      const username = uniqueUsername(`role_${role}`);
      await users.createUser({
        username,
        email: uniqueEmail(`role_${role}`),
        displayName: uniqueDisplayName(`Role ${role}`),
        password: strongPassword(),
        role,
      });

      // Verify via the API rather than table row visibility. The
      // /users list endpoint has no orderBy, so newly created rows
      // appear at the end (insertion order). When the local PGlite
      // DB has accumulated state across runs, the new user falls
      // off the default page and the table-row locator can no
      // longer find it. The API check below pages until the user is
      // found, which is robust regardless of how many users exist.
      const api = await apiAs('admin');
      const found = await findUserByUsername(api, username);
      expect(found, `user ${username} not found via /users API`).toBeTruthy();
      expect(found!.role).toBe(role);
    });
  }

  test('admin can edit a user role from assessee to standards_manager', async ({ page, apiAs }) => {
    const users = new AdminUsersPage(page);
    await users.goto();
    const username = uniqueUsername('promote');
    await users.createUser({
      username,
      email: uniqueEmail('promote'),
      displayName: uniqueDisplayName('Promote'),
      password: strongPassword(),
      role: 'assessee',
    });

    // Look up the user by username via API to get a stable id that
    // the editUserRole UI flow can drive against. Avoids the table
    // pagination problem the row-based locators hit when the local
    // PGlite has accumulated many users across runs.
    const api = await apiAs('admin');
    const created = await findUserByUsername(api, username);
    expect(created, `created user ${username} not found via API`).toBeTruthy();
    expect(created!.role).toBe('assessee');

    await users.editUserRole(username, 'standards_manager');

    const updated = await findUserByUsername(api, username);
    expect(updated!.role).toBe('standards_manager');
  });

  test('duplicate username on create returns the existing-username message', async ({
    page,
    apiAs,
  }) => {
    const api = await apiAs('admin');
    const username = uniqueUsername('dup');
    const created = await api.post('/api/v1/users', {
      data: {
        username,
        email: uniqueEmail('dup'),
        displayName: 'First',
        password: strongPassword(),
        role: 'assessor',
      },
    });
    expect(created.status()).toBe(201);

    const users = new AdminUsersPage(page);
    await users.goto();
    // Open the dialog and fill in fields targeting the same field-by-
    // field locators the POM uses, so this test stays in lockstep with
    // the el-select / confirm-password fixes. Submit and assert the
    // error toast — the POM's createUser asserts the success toast,
    // which we deliberately do NOT want here.
    await users.createButton.click();
    const dialog = page.locator('.el-dialog').filter({
      has: page.getByRole('heading', { name: /create user|new user|add user/i }),
    });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByLabel('Username', { exact: true }).fill(username);
    await dialog.getByLabel('Email', { exact: true }).fill(uniqueEmail('dup2'));
    await dialog.getByLabel(/^display name$|^full name$/i).fill('Second');
    const pwd = strongPassword();
    await dialog.getByLabel('Password', { exact: true }).fill(pwd);
    await dialog.getByLabel(/^confirm password$/i).fill(pwd);
    const roleFormItem = dialog
      .locator('.el-form-item')
      .filter({
        has: page.locator('.el-form-item__label').filter({ hasText: /^role$/i }),
      })
      .first();
    await roleFormItem.locator('.el-select__wrapper, .el-select').first().click();
    await page.getByRole('option', { name: 'Assessor', exact: true }).first().click();
    await dialog.getByRole('button', { name: /^create$|^save$/i }).last().click();

    await expect(page.locator('.el-message').filter({ hasText: /exists|conflict|409/i }).first())
      .toBeVisible({ timeout: 10_000 });
  });
});
