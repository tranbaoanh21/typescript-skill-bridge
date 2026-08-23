import { expect, test } from '@playwright/test';

test('guest discovers a real project across responsive breakpoints', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: /Don’t wait for experience. Build it./i }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HCMUT SkillBridge Demo' })).toBeVisible();

  if ((page.viewportSize()?.width ?? 1_440) <= 1_000) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  }

  await page.getByRole('link', { exact: true, name: 'HCMUT SkillBridge Demo' }).click();
  await expect(
    page.getByRole('heading', { name: 'HCMUT SkillBridge Demo', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in to apply' })).toBeVisible();
});

test('owner and applicant complete the collaboration workflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The full mutation workflow runs once.');
  test.setTimeout(90_000);

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const ownerEmail = `e2e-owner-${runId}@example.com`;
  const applicantEmail = `e2e-applicant-${runId}@example.com`;
  const password = 'SkillBridge-e2e-password!';
  const title = `E2E Collaboration ${runId}`;
  const taskTitle = `Ship E2E proof ${runId}`;

  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Display name' }).fill('E2E Project Owner');
  await page.getByRole('textbox', { name: 'Email' }).fill(ownerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project title' }).fill(title);
  await page
    .getByRole('textbox', { name: 'Project brief' })
    .fill(
      'A deterministic browser journey that proves student project collaboration from invitation through delivery.',
    );
  await page.getByRole('spinbutton', { name: 'Team capacity' }).fill('3');
  await page
    .getByRole('combobox', { name: 'Primary skill signal' })
    .selectOption({ label: 'React' });
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Manage project' }).click();
  const managementUrl = page.url();
  await expect(page.getByText('RECRUITING', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Join the bridge' })).toBeVisible();
  await page.goto('/register');
  await page.getByRole('textbox', { name: 'Display name' }).fill('E2E Student Applicant');
  await page.getByRole('textbox', { name: 'Email' }).fill(applicantEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { exact: true, name: title }).click();
  await page
    .getByRole('textbox', { name: 'Cover letter' })
    .fill(
      'I can own the React discovery experience, test it carefully, and document the trade-offs for the team.',
    );
  await page.getByRole('button', { name: 'Send application' }).click();
  await expect(page.getByText('Application sent')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('link', { name: 'Join the bridge' })).toBeVisible();
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(ownerEmail);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await page.goto(managementUrl);

  const candidate = page
    .locator('.candidate-list article')
    .filter({ hasText: 'E2E Student Applicant' });
  await expect(candidate).toBeVisible();
  await candidate.getByRole('button', { name: 'Accept' }).click();
  await expect(candidate.getByText('ACCEPTED', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Open delivery board' }).click();
  await page.getByRole('button', { name: /New task/i }).click();
  await page.getByRole('textbox', { name: 'Task title' }).fill(taskTitle);
  await page.getByRole('button', { name: 'Add to board' }).click();
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
  await page.getByRole('button', { name: `Move ${taskTitle} to IN_PROGRESS` }).click();
  await expect(page.getByRole('button', { name: `Move ${taskTitle} to REVIEW` })).toBeVisible();

  const teamMessage = `Realtime decision ${runId}`;
  await page.getByRole('textbox', { name: 'Team message' }).fill(teamMessage);
  await page.getByRole('button', { name: 'Send team message' }).click();
  await expect(page.getByLabel('Team chat').getByText(teamMessage)).toBeVisible();
});
