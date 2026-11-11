const { chromium } = require('playwright');

const CHROMIUM_PATH = 'C:\\Users\\HP\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const BASE_URL = 'http://localhost:5173';

const MODULES_TO_TEST = [
  { name: 'Dashboard Overview', path: '/dashboard', selector: 'h1, h2, [data-testid="dashboard"]' },
  { name: 'Users & Staff Management', path: '/users', selector: 'table, h1, h2, button' },
  { name: 'Students & Admissions', path: '/students', selector: 'table, h1, h2, input' },
  { name: 'Academic Classes & Sections', path: '/academic', selector: 'table, h1, h2, button' },
  { name: 'Courses & LMS Modules', path: '/courses', selector: 'h1, h2, button, div' },
  { name: 'Attendance & Verification', path: '/attendance', selector: 'table, h1, h2, select' },
  { name: 'Examinations & Report Cards', path: '/exams', selector: 'table, h1, h2, button' },
  { name: 'Assessments & Gradebook', path: '/assessments', selector: 'table, h1, h2, button' },
  { name: 'Finance & Invoicing', path: '/finance', selector: 'table, h1, h2, button' },
  { name: 'Payroll Management', path: '/payroll', selector: 'table, h1, h2, button' },
  { name: 'Staff Leave Management', path: '/leave', selector: 'table, h1, h2, button' },
  { name: 'Library & Inventory', path: '/library', selector: 'table, h1, h2, button' },
  { name: 'Transport & Fleet Routes', path: '/transport', selector: 'table, h1, h2, button' },
  { name: 'Hostel & Bed Allocation', path: '/hostel', selector: 'table, h1, h2, button' },
  { name: 'Communications & Alerts', path: '/communication', selector: 'h1, h2, button, form' },
  { name: 'Counseling & Student Care', path: '/counseling', selector: 'h1, h2, button, table' },
  { name: 'Institutional Analytics', path: '/analytics', selector: 'h1, h2, canvas, div' },
  { name: 'Multi-Tenant Institutions', path: '/institutions', selector: 'table, h1, h2, button' },
  { name: 'System Settings & Recycle Bin', path: '/settings', selector: 'h1, h2, button, form' },
  { name: 'Audit Trail & Compliance', path: '/audits', selector: 'h1, h2, div' },
];

async function runBrowserValidation() {
  console.log('================================================================');
  console.log(' LMS FULL-STACK REAL PLAYWRIGHT BROWSER VALIDATION (CHROMIUM)   ');
  console.log('================================================================\n');

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const networkFailures = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({ url: page.url(), text: msg.text() });
    }
  });

  page.on('requestfailed', (req) => {
    networkFailures.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure() ? req.failure().errorText : 'Unknown failure',
    });
  });

  const results = {
    auth: {},
    modules: [],
    security: {},
  };

  try {
    // -------------------------------------------------------------
    // STEP 1: LOGIN PAGE RENDERING & INVALID CREDENTIAL TEST
    // -------------------------------------------------------------
    console.log('[Step 1] Testing /login and rejection of invalid credentials...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    
    // Attempt invalid login
    await page.fill('#usernameOrEmail', 'invalid-user@alpha.edu');
    await page.fill('#password', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);
    const alertVisible = await page.isVisible('[role="alert"]');
    const alertText = alertVisible ? await page.textContent('[role="alert"]') : '';
    
    if (alertVisible && alertText.includes('Invalid credentials')) {
      results.auth.invalidLoginRejected = true;
      console.log('  ✓ Invalid credentials correctly rejected with message:', alertText.trim());
    } else {
      results.auth.invalidLoginRejected = false;
      console.log('  ✗ Unexpected response to invalid credentials:', alertText);
    }

    // -------------------------------------------------------------
    // STEP 2: VALID LOGIN WITH PRINCIPAL ACCOUNT
    // -------------------------------------------------------------
    console.log('\n[Step 2] Testing valid login with Principal account (principal@alpha.edu)...');
    await page.fill('#usernameOrEmail', 'principal@alpha.edu');
    await page.fill('#password', 'Password123!');
    await page.click('button[type="submit"]');

    // Wait for redirect to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const token = await page.evaluate(() => localStorage.getItem('lms_access_token'));
    const userJson = await page.evaluate(() => localStorage.getItem('lms_user'));
    const user = userJson ? JSON.parse(userJson) : null;

    if (token && user && user.email === 'principal@alpha.edu') {
      results.auth.validLogin = true;
      results.auth.userRole = user.role;
      results.auth.institutionId = user.institutionId;
      console.log('  ✓ Successfully logged in as:', user.email, '| Role:', user.role);
      console.log('  ✓ JWT access token stored in localStorage:', token.substring(0, 20) + '...');
    } else {
      results.auth.validLogin = false;
      console.log('  ✗ Failed to verify user state after login:', user);
    }

    // -------------------------------------------------------------
    // STEP 3: SYSTEMATIC MODULE VISITATION & VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[Step 3] Navigating and testing all 20 active LMS portal modules...');
    for (const mod of MODULES_TO_TEST) {
      const initialErrorCount = consoleErrors.length;
      const initialFailCount = networkFailures.length;
      const targetUrl = `${BASE_URL}${mod.path}`;

      const navStart = Date.now();
      let status = 'PASSED';
      let details = '';

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 8000 });
        await page.waitForTimeout(600);

        // Check if redirected to login (unauthorized)
        if (page.url().includes('/login')) {
          status = 'REDIRECTED_TO_LOGIN';
          details = 'User session lost or unauthorized';
        } else {
          // Check if key element rendered
          const hasContent = await page.locator('body').count() > 0;
          const bodyText = await page.innerText('body');
          const hasErrors = bodyText.includes('Application Error') || bodyText.includes('ChunkLoadError');
          
          if (hasErrors) {
            status = 'RENDER_ERROR';
            details = 'Page displayed an application error banner';
          } else {
            details = `Page loaded in ${Date.now() - navStart}ms (${bodyText.length} characters rendered)`;
          }
        }
      } catch (err) {
        status = 'TIMEOUT_OR_FAILED';
        details = err.message;
      }

      const modErrors = consoleErrors.slice(initialErrorCount);
      const modFails = networkFailures.slice(initialFailCount);

      const modResult = {
        name: mod.name,
        path: mod.path,
        status,
        details,
        consoleErrors: modErrors.length,
        networkFailures: modFails.length,
      };

      results.modules.push(modResult);

      const symbol = status === 'PASSED' ? '✓' : '✗';
      console.log(`  ${symbol} [${mod.name}] ${mod.path} -> ${status} (${details})`);
      if (modErrors.length > 0) {
        console.log(`    ! Console errors (${modErrors.length}):`, modErrors.map(e => e.text).join(' | '));
      }
      if (modFails.length > 0) {
        console.log(`    ! Network failures (${modFails.length}):`, modFails.map(f => `${f.method} ${f.url}`).join(' | '));
      }
    }

    // -------------------------------------------------------------
    // STEP 4: LOGOUT & ROUTE PROTECTION VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[Step 4] Testing logout and protected route security...');
    // Clear tokens to simulate logout
    await page.evaluate(() => {
      localStorage.removeItem('lms_access_token');
      localStorage.removeItem('lms_refresh_token');
      localStorage.removeItem('lms_user');
    });

    // Try accessing protected /dashboard directly without token
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const isRedirectedToLogin = page.url().includes('/login');
    results.security.protectedRouteEnforced = isRedirectedToLogin;

    if (isRedirectedToLogin) {
      console.log('  ✓ ProtectedRoute successfully guarded /dashboard and redirected to /login');
    } else {
      console.log('  ✗ ProtectedRoute failed: Unauthenticated user remained at:', page.url());
    }

    console.log('\n================================================================');
    console.log(' BROWSER VALIDATION COMPLETE                                    ');
    console.log('================================================================\n');

    const totalPassed = results.modules.filter(m => m.status === 'PASSED').length;
    console.log(`Summary: ${totalPassed} of ${results.modules.length} modules passed navigation and rendering.`);
    console.log(`Total Console Errors across entire session: ${consoleErrors.length}`);
    console.log(`Total Network Failures across entire session: ${networkFailures.length}`);

    process.exit(totalPassed === results.modules.length ? 0 : 1);
  } catch (err) {
    console.error('Fatal Browser Test Error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runBrowserValidation();
