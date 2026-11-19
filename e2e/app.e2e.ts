import { devices, expect, test, type Page } from '@playwright/test';
import { addDays, todayIn } from '../src/lib/deadlines/dates.ts';

/**
 * One steward's day, end to end, against the production build:
 * first-run setup → contract → case → timeline (online and offline) → handoff → close → library.
 */
test.describe.configure({ mode: 'serial' });

const today = todayIn('America/New_York');
let page: Page;
let caseUrl = '';

test.beforeAll(async ({ browser }) => {
	// The offline outbox lives in IndexedDB and works without the service worker; keeping the
	// worker out of this context makes network emulation deterministic. It has its own test below.
	page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
});

test.afterAll(async () => {
	await page.context().close();
});

test('first run walks you through setting up the local', async () => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await page.getByLabel('Local name').fill('Local 512');
	await page.getByLabel(/^Union/).fill('Allied Warehouse Workers');
	await page.getByLabel('Your name').fill('Sam Rivera');
	await page.getByLabel('Email').fill('sam@example.org');
	await page.getByLabel(/^Password/).fill('correct horse battery staple');
	await page.getByRole('button', { name: 'Create local and sign in' }).click();
	await expect(page).toHaveURL(/\/contracts\/new\?welcome=1/);
	await expect(page.getByText('Your local is set up.')).toBeVisible();
});

test('reads a contract and makes a person confirm every deadline', async () => {
	await page.getByRole('button', { name: 'Try the sample contract' }).click();
	await expect(page.getByLabel('Contract name')).toHaveValue(/Northgate/);
	await page.getByRole('button', { name: 'Read contract' }).click();
	await expect(page).toHaveURL(/\/contracts\/[0-9a-f-]{36}\?new=1/);
	await expect(page.locator('.intro')).toContainText(
		/Found 8 grievance deadlines, 10 holidays and 15 articles/
	);

	const activate = page.getByRole('button', { name: 'Activate contract' });
	await expect(activate).toBeDisabled();
	await expect(page.locator('mark').first()).toHaveText('ten (10) working days');

	const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
	await expect(confirm).toHaveCount(8);
	for (let left = 7; left >= 0; left--) {
		await confirm.first().click();
		await expect(confirm).toHaveCount(left);
	}
	await expect(page.getByText('Every step is confirmed')).toBeVisible();
	await activate.click();
	await expect(page.locator('.page-header .badge')).toHaveText('Active');
});

test('opens a case and starts the clock from the incident date', async () => {
	await page.getByRole('link', { name: 'Open a case' }).click();
	await expect(page).toHaveURL(/\/cases\/new/);
	await page.getByLabel('Short title').fill('Overtime bypassed on night shift');
	await page.getByLabel('Grievant', { exact: true }).fill('Dana Ortiz');
	await page.getByLabel('Department or work area').fill('Receiving');
	await page.getByLabel('Date of the incident').fill(addDays(today, -2));
	await page
		.getByLabel('What happened')
		.fill('Saturday overtime went to two junior operators before Dana.');
	await expect(page.getByText(/is due/)).toBeVisible();
	await page.getByRole('checkbox', { name: /Art\. 6 Overtime/ }).check();
	await page.getByPlaceholder('Section and how it applies (optional)').fill('Section 6.2');
	await page.getByRole('button', { name: 'Open case and start the clock' }).click();

	await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}\?created=1/);
	caseUrl = new URL(page.url()).pathname;
	const clock = page.getByRole('region', { name: 'Deadline countdown' });
	await expect(clock).toContainText('File grievance with immediate supervisor');
	await expect(clock).toContainText('Union must act');
	await expect(clock).toContainText(/working days\s*left/i);
	await expect(page.getByText(/Case \d{4}-001 opened/)).toBeVisible();
});

test('adds a note and a witness statement in one tap each', async () => {
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	const note = page.getByRole('dialog', { name: 'Add a note' });
	await note.getByLabel('Note', { exact: true }).fill('Dana signed the voluntary list on Monday.');
	await note.getByRole('button', { name: 'Save to timeline' }).click();
	await expect(page.getByText('Dana signed the voluntary list on Monday.')).toBeVisible();

	await page.getByRole('button', { name: 'Witness', exact: true }).click();
	const witness = page.getByRole('dialog', { name: 'Witness statement' });
	await witness.getByLabel('Witness name').fill('Lee Park');
	await witness.getByLabel(/^Statement/).fill('I saw the supervisor skip the list.');
	await witness.getByRole('button', { name: 'Save to timeline' }).click();
	await expect(page.getByText('Witness: Lee Park')).toBeVisible();
});

test('keeps entries made offline and syncs them when the signal returns', async () => {
	await page.context().setOffline(true);
	await page.getByRole('button', { name: 'Note', exact: true }).click();
	const note = page.getByRole('dialog', { name: 'Add a note' });
	await note
		.getByLabel('Note', { exact: true })
		.fill('Written in the freezer aisle with no signal.');
	await note.getByRole('button', { name: 'Save to timeline' }).click();
	await expect(page.locator('.toast', { hasText: 'Saved on this device' })).toBeVisible();
	await expect(page.locator('.outbox-list').getByText('Waiting to sync')).toBeVisible();
	await expect(page.locator('.sidebar')).toContainText('Offline');

	await page.context().setOffline(false);
	await expect(page.locator('.outbox-list')).toHaveCount(0, { timeout: 25_000 });
	await expect(page.locator('.toast', { hasText: 'Synced 1 saved entry' })).toBeVisible();
	await expect(
		page.locator('.entries').getByText('Written in the freezer aisle with no signal.')
	).toBeVisible();
});

test('marking a step done starts the next clock; extensions override the deadline', async () => {
	await page.getByRole('button', { name: 'Mark done' }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Notes').fill('Handed to M. Klein at shift start.');
	await dialog.getByRole('button', { name: 'Save', exact: true }).click();
	const clock = page.getByRole('region', { name: 'Deadline countdown' });
	await expect(clock).toContainText("Supervisor's written answer");
	await expect(clock).toContainText('Management must act');

	await page.getByRole('button', { name: 'Extension' }).click();
	const ext = page.getByRole('dialog');
	await ext.getByLabel('New deadline').fill(addDays(today, 21));
	await ext.getByLabel('Agreed with / how').fill('HR asked for more time, agreed by email.');
	await ext.getByRole('button', { name: 'Save extension' }).click();
	await expect(clock).toContainText('Extended by agreement');
	await expect(page.getByText('Step 1: deadline extended by agreement')).toBeVisible();
});

test('admins can add stewards, and a case hands off with a packet', async () => {
	await page.goto('/settings');
	const add = page.locator('form', { has: page.getByRole('heading', { name: 'Add a steward' }) });
	await add.getByLabel('Name').fill('Alex Chen');
	await add.getByLabel('Email').fill('alex@example.org');
	await add.getByRole('button', { name: /Add and create a temporary password/ }).click();
	await expect(page.getByText(/Share this temporary password/)).toBeVisible();

	await page.goto(caseUrl);
	await page.getByRole('link', { name: 'Hand off' }).click();
	await page.getByLabel('Hand it to').selectOption({ label: 'Alex Chen' });
	await page.getByLabel(/^Handoff notes/).fill('Dana prefers texts after 6pm.');
	await page.getByRole('button', { name: /Hand off and open the packet/ }).click();
	await expect(page).toHaveURL(/\/packet\?handoff=1$/);
	await expect(page.getByText(/Case handed off to/)).toContainText('Alex Chen');
	await expect(page.locator('.status .notes')).toContainText('Dana prefers texts after 6pm.');
	await expect(page.locator('table')).toContainText('File grievance with immediate supervisor');

	const md = await page.request.get(`${caseUrl}/packet.md`);
	expect(md.ok()).toBe(true);
	const text = await md.text();
	expect(text).toContain('# Handoff packet — Case');
	expect(text).toContain('**Lee Park**');

	const json = await page.request.get(`${caseUrl}/export.json`);
	expect(((await json.json()) as { format: string }).format).toBe('stewardbook.case.v1');
});

test('closing a case adds it to the precedent library', async () => {
	await page.goto(caseUrl);
	await page.getByRole('button', { name: 'Close the case' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Close the case' });
	await dialog.getByLabel('Settled').check();
	await dialog
		.getByLabel(/^Resolution/)
		.fill('Four hours at time and one-half paid; supervisors retrained on the list.');
	await dialog.getByRole('button', { name: 'Close case' }).click();
	await expect(page.locator('.resolution')).toContainText('Settled');

	await page.goto('/library');
	await page.getByPlaceholder(/overtime bypass/).fill('retrained');
	await expect(
		page.getByRole('heading', { name: 'Overtime bypassed on night shift' })
	).toBeVisible();
	await expect(page.getByText('Art. 6 · Overtime').first()).toBeVisible();
});

test('serves a calendar feed and a health check', async () => {
	await page.goto('/settings');
	const feed = await page
		.locator('section', { hasText: 'Deadlines in your calendar' })
		.locator('.copy input')
		.inputValue();
	expect(feed).toMatch(/\/calendar\/[\w-]+\.ics$/);
	const ics = await page.request.get(feed);
	expect(ics.headers()['content-type']).toContain('text/calendar');
	expect(await ics.text()).toContain('BEGIN:VCALENDAR');

	const health = await page.request.get('/healthz');
	expect(await health.json()).toMatchObject({ status: 'ok', db: 'ok' });
});

test('installs a service worker that caches the app and opened pages', async ({ browser }) => {
	const ctx = await browser.newContext({ storageState: await page.context().storageState() });
	const p = await ctx.newPage();
	await p.goto(caseUrl);
	await p.evaluate(() => navigator.serviceWorker.ready);
	await p.reload();
	await expect.poll(() => p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await p.goto('/cases');
	const keys = await p.evaluate(() => caches.keys());
	expect(keys.some((k) => k.startsWith('app-'))).toBe(true);
	expect(keys).toContain('pages-v1');
	const manifest = await p.request.get('/manifest.webmanifest');
	expect(((await manifest.json()) as { name: string }).name).toBe('Stewardbook');
	await ctx.close();
});

test('works on a phone-sized screen', async ({ browser }) => {
	const phone = await browser.newContext({
		...devices['Pixel 7'],
		storageState: await page.context().storageState()
	});
	const p = await phone.newPage();
	await p.goto('/');
	await expect(p.getByRole('link', { name: 'New case' }).last()).toBeVisible();
	await expect(p.locator('.tabbar')).toBeVisible();
	await phone.close();
});

test('signs out, and rejects a wrong password', async () => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.getByLabel('Email').fill('sam@example.org');
	await page.getByLabel('Password').fill('not the password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toContainText('don’t match');
	await page.goto('/cases');
	await expect(page).toHaveURL(/\/login\?next=%2Fcases/);
});
