import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = page.getByLabel(/username/i);
    this.password = page.getByLabel(/password/i);
    this.submit = page.getByRole('button', { name: /sign in|log in|login/i });
    this.error = page.locator('[role="alert"], .el-message--error').first();
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }

  async expectLoggedIn(): Promise<void> {
    await this.page.waitForURL((url) => !/\/login$/.test(url.pathname), { timeout: 15_000 });
    await expect(this.page).toHaveURL(/\/(dashboard|admin|onboarding|setup\?|assessments|entities|projects)/);
  }

  async expectStillOnLoginWithError(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
