import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Top navigation actions shared across authenticated pages.
 */
export class NavBar {
  readonly page: Page;
  readonly userMenu: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.userMenu = page.locator('[data-test="user-menu"], .user-menu, .nav-user').first();
    this.logoutButton = page.getByRole('menuitem', { name: /sign out|log out|logout/i }).first();
  }

  async goToDashboard(): Promise<void> {
    await this.page.getByRole('link', { name: /dashboard/i }).first().click();
  }

  async goToAssessments(): Promise<void> {
    await this.page.getByRole('link', { name: /assessments/i }).first().click();
  }

  async goToEntities(): Promise<void> {
    await this.page.getByRole('link', { name: /entities/i }).first().click();
  }

  async goToProjects(): Promise<void> {
    await this.page.getByRole('link', { name: /projects/i }).first().click();
  }

  async goToStandards(): Promise<void> {
    await this.page.getByRole('link', { name: /standards/i }).first().click();
  }

  async logout(): Promise<void> {
    if (await this.userMenu.isVisible()) {
      await this.userMenu.click();
    }
    await this.logoutButton.click();
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
