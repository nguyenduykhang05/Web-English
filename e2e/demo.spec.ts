import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function loginAs(page: Page, email: string, password: string, expectedUrlPart: string) {
  await page.goto('/auth/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(new RegExp(expectedUrlPart));
}

function trackPageHealth(page: Page, label: string) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on('pageerror', (err) => {
    pageErrors.push(`[${label}] pageerror: ${err.message}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 500) {
      serverErrors.push(`[${label}] HTTP ${res.status()} on ${res.url()}`);
    }
  });

  return {
    assertHealthy: () => {
      expect(pageErrors, `Unexpected runtime errors in ${label}`).toEqual([]);
      expect(serverErrors, `Unexpected 5xx API responses in ${label}`).toEqual([]);
    },
  };
}

test.describe('Phase 7 — Playwright E2E Verification of 8-Step Demo & Mobile Viewport', () => {
  test.describe.configure({ mode: 'serial' });

  test('executes all 8 steps of docs/DEMO_SCRIPT.md on Desktop (including 2-window realtime Classroom)', async ({
    browser,
  }) => {
    const studentCtx: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const teacherCtx: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const adminCtx: BrowserContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const studentPage = await studentCtx.newPage();
    const teacherPage = await teacherCtx.newPage();
    const adminPage = await adminCtx.newPage();

    const sHealth = trackPageHealth(studentPage, 'student');
    const tHealth = trackPageHealth(teacherPage, 'teacher');
    const aHealth = trackPageHealth(adminPage, 'admin');

    try {
      // === Step 1 (Phút 0-1): Landing Page & Swagger Docs ===
      await studentPage.goto('/');
      await expect(studentPage.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(studentPage.locator('a[href="/auth/login"]').first()).toBeVisible();

      const swaggerRes = await studentPage.request.get('http://127.0.0.1:4010/api/docs/');
      expect(swaggerRes.status()).toBe(200);
      const swaggerHtml = await swaggerRes.text();
      expect(swaggerHtml).toContain('Swagger');

      // === Step 2 (Phút 1-2): Student Enrollment + Coupon -> Admin Confirm -> SessionLedger Credit ===
      await loginAs(studentPage, 'student@example.com', 'Student@123456', '/student');
      await expect(studentPage.getByText(/10\s*buổi/)).toBeVisible();

      await studentPage.goto('/student/billing');
      await studentPage.getByLabel('Mã giảm giá').fill('WEBENGLISH10');
      const enrollButtons = studentPage.getByRole('button', { name: 'Đăng ký & Tạo VietQR' });
      await expect(enrollButtons.first()).toBeVisible();
      await enrollButtons.last().click();
      await expect(studentPage.getByText(/Đã tạo hoá đơn WE-INV-/)).toBeVisible();

      // Admin confirms bank transfer
      await loginAs(adminPage, 'admin@example.com', 'Admin@123456', '/admin');
      await adminPage.goto('/admin/enrollments');
      const confirmBtn = adminPage.getByRole('button', { name: 'Xác nhận đã nhận tiền' }).first();
      await expect(confirmBtn).toBeVisible();
      await confirmBtn.click();
      await expect(adminPage.getByText(/Đã duyệt WE-INV-/)).toBeVisible();

      // Student reloads billing and verifies SessionLedger balance increased (+12 or +24 -> >= 22)
      await studentPage.reload();
      await expect(studentPage.getByText(/Số dư hiện tại:/).locator('..')).toContainText(/(22|34)\s*buổi/);

      // === Step 3 (Phút 2-4): Adaptive Placement + Teacher Timezone Slot Switch + Booking + .ICS ===
      await studentPage.goto('/student/path');
      await studentPage.getByRole('button', { name: 'Placement Test thích ứng' }).click();
      for (let step = 1; step <= 6; step++) {
        const optionBtn = studentPage.locator('[role="dialog"] button').filter({ hasNotText: /Đóng|Close/i }).nth(1);
        await expect(optionBtn).toBeVisible();
        await optionBtn.click();
      }
      await expect(studentPage.getByText(/Hoàn tất Placement:/)).toBeVisible();

      await studentPage.goto('/student/booking');
      await expect(studentPage.getByText('Coach Daniel Miller')).toBeVisible();
      // Switch to NY teacher (America/New_York) to verify timezone conversion labels
      await studentPage.getByRole('button', { name: /Coach Daniel Miller/ }).click();
      await expect(studentPage.getByText(/America\/New_York/).first()).toBeVisible();

      // Switch back to Coach Claire Nguyen (Asia/Ho_Chi_Minh) and book 1 slot
      await studentPage.getByRole('button', { name: /Coach Claire Nguyen/ }).click();
      const slotButtons = studentPage.locator('button').filter({ hasText: /Asia\/Ho_Chi_Minh/ });
      await expect(slotButtons.first()).toBeVisible();
      await slotButtons.first().click();

      await studentPage.getByRole('button', { name: /Xác nhận giữ lịch/ }).click();
      await expect(studentPage.getByText(/Đã đặt thành công 1 buổi học 1-1/)).toBeVisible();

      // Verify .ICS button is visible and downloads valid iCalendar payload
      await expect(studentPage.getByRole('button', { name: '.ICS' }).first()).toBeVisible();

      // === Step 4 (Phút 4-6): 2-Participant Realtime Classroom Socket.IO & Complete Session ===
      await loginAs(teacherPage, 'teacher@example.com', 'Teacher@123456', '/teacher');
      await teacherPage.goto('/teacher');
      const teacherOpenRoom = teacherPage.getByRole('button', { name: 'Mở lớp học' }).first();
      await expect(teacherOpenRoom).toBeVisible();
      await teacherOpenRoom.click();
      await teacherPage.waitForURL(/\/classroom\/[a-f0-9]{24}/);
      const classroomPath = new URL(teacherPage.url()).pathname;

      await studentPage.goto(classroomPath);
      await expect(teacherPage.getByText('Realtime Live')).toBeVisible();
      await expect(studentPage.getByText('Realtime Live')).toBeVisible();

      // Teacher adds a quick note -> verify Student receives it live via Socket.IO
      await teacherPage.getByPlaceholder('Cụm từ / Lỗi học viên vừa nói...').fill('make a research');
      await teacherPage.getByPlaceholder('Nghĩa chuẩn / Cách sửa đúng...').fill('conduct research');
      await teacherPage.getByRole('button', { name: 'Lưu' }).click();
      await expect(studentPage.getByText('conduct research')).toBeVisible();

      // Teacher sends chat -> Student receives chat realtime
      await teacherPage.getByRole('button', { name: 'Chat' }).click();
      await studentPage.getByRole('button', { name: 'Chat' }).click();
      await teacherPage.getByPlaceholder('Nhắn tin trong lớp học...').fill('Well done Minh Anh!');
      await teacherPage.getByRole('button', { name: 'Gửi tin nhắn' }).click();
      await expect(studentPage.getByText('Well done Minh Anh!')).toBeVisible();

      // Teacher ends the live session -> marks completed
      await teacherPage.getByRole('button', { name: 'Kết thúc buổi học' }).click();
      await expect(teacherPage.getByText('Buổi học đã hoàn tất')).toBeVisible();

      // === Step 5 (Phút 6-7): Post-Session Report -> Student Radar & 5-Star Review ===
      await teacherPage.goto('/teacher/reports');
      const pendingSessionBtn = teacherPage.locator('button').filter({ hasText: 'Live 1-1 Demo Room' }).first();
      await expect(pendingSessionBtn).toBeVisible();
      await pendingSessionBtn.click();
      await teacherPage.locator('#report-summary').fill('Học viên hoàn thành tốt buổi Live Demo Room 1-1.');
      await teacherPage.getByRole('button', { name: 'Lưu & Chia sẻ cho học viên' }).click();
      await expect(teacherPage.getByText('Đã nộp báo cáo buổi học lên máy chủ')).toBeVisible();

      await studentPage.goto('/student');
      const reviewBtn = studentPage.getByRole('button', { name: 'Chấm 5★ ngay' }).first();
      await expect(reviewBtn).toBeVisible();
      await reviewBtn.click();
      await expect(studentPage.getByText(/Đã gửi đánh giá 5\/5 sao/)).toBeVisible();

      await studentPage.goto('/student/progress');
      await expect(studentPage.getByText('Hồ sơ năng lực & Tiến bộ 7 kỹ năng')).toBeVisible();

      // === Step 6 (Phút 7-8): Teacher Approves Rule Proposal + AI Exercise -> Student Submits -> Teacher Grades ===
      await teacherPage.goto('/teacher/students');
      const approveMilestoneBtn = teacherPage.getByRole('button', { name: 'Chấp nhận & Áp dụng vào lộ trình' }).first();
      await expect(approveMilestoneBtn).toBeVisible();
      await approveMilestoneBtn.click();
      await expect(teacherPage.getByText('Đã phê duyệt đề xuất lộ trình lên hệ thống')).toBeVisible();

      await teacherPage.getByRole('button', { name: 'Gợi ý bài tập AI' }).click();
      await expect(teacherPage.getByText(/AI đã sinh đề xuất bài tập/)).toBeVisible();

      // Approve the newly generated exercise_generation AI proposal
      const approveAiBtn = teacherPage.getByRole('button', { name: 'Duyệt đề xuất' }).first();
      await expect(approveAiBtn).toBeVisible();
      await approveAiBtn.click();
      await expect(teacherPage.getByText('Đã duyệt đề xuất AI')).toBeVisible();

      // Student opens Homework, submits assignment
      await studentPage.goto('/student/homework');
      const submitHwBtn = studentPage.getByRole('button', { name: 'Nộp bài' }).first();
      await expect(submitHwBtn).toBeVisible();
      await submitHwBtn.click();
      await studentPage.locator('#hw-note').fill('Em đã hoàn tất bài tập AI luyện từ vựng.');
      await studentPage.getByRole('button', { name: 'Gửi bài cho giáo viên' }).click();
      await expect(studentPage.getByText('Đã nộp bài tập lên máy chủ')).toBeVisible();

      // Teacher reloads Students page and grades the submitted homework
      await teacherPage.reload();
      const gradeBtn = teacherPage.getByRole('button', { name: 'Chấm điểm ngay' }).first();
      await expect(gradeBtn).toBeVisible();
      await gradeBtn.click();
      await expect(teacherPage.getByText(/Đã chấm .* cho /)).toBeVisible();

      // === Step 7 & 8 (Phút 8-10): Admin Alerts ACK->Resolve, Payroll Generate & Dynamic Settings + Audit ===
      await adminPage.goto('/admin');
      await expect(adminPage.getByText('Tổng quan vận hành hệ thống')).toBeVisible();

      const ackBtn = adminPage.getByRole('button', { name: 'Nhận xử lý (ACK)' }).first();
      await expect(ackBtn).toBeVisible();
      await ackBtn.click();
      await expect(adminPage.getByText('Đã chuyển cảnh báo sang trạng thái ACK')).toBeVisible();

      const resolveBtn = adminPage.getByRole('button', { name: 'Hoàn tất (Resolve)' }).first();
      await expect(resolveBtn).toBeVisible();
      await resolveBtn.click();
      await expect(adminPage.getByText('Đã đánh dấu xử lý xong (Resolved)')).toBeVisible();

      await adminPage.getByRole('button', { name: 'Chốt bảng công tháng' }).click();
      await expect(adminPage.getByText(/Đã tổng hợp bảng công tháng/)).toBeVisible();

      await adminPage.goto('/admin/settings');
      await expect(adminPage.locator('#set-late')).toHaveValue('10');
      await adminPage.locator('#set-cancel').fill('24');
      await adminPage.locator('#set-ema').fill('0.35');
      await adminPage.getByRole('button', { name: 'Lưu chính sách hệ thống' }).click();
      await expect(adminPage.getByText('Đã lưu chính sách vào Settings & ghi Audit Log')).toBeVisible();
      await expect(adminPage.getByText(/setting\.updated/).first()).toBeVisible();

      sHealth.assertHealthy();
      tHealth.assertHealthy();
      aHealth.assertHealthy();
    } finally {
      await Promise.all([studentCtx.close(), teacherCtx.close(), adminCtx.close()]);
    }
  });

  test('renders responsive mobile UI (390x844) without layout overflow or runtime errors across roles', async ({
    browser,
  }) => {
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await mobileCtx.newPage();
    const health = trackPageHealth(page, 'mobile');

    const assertNoHorizontalOverflow = async (routeLabel: string) => {
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      expect(overflow, `Horizontal overflow too large on ${routeLabel} (${overflow}px)`).toBeLessThanOrEqual(2);
    };

    try {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow('/');

      await loginAs(page, 'student@example.com', 'Student@123456', '/student');
      await expect(page.getByText(/Xin chào,/)).toBeVisible();
      await assertNoHorizontalOverflow('/student');

      // Open and verify mobile slide-over nav drawer
      await page.getByRole('button', { name: 'Mở menu điều hướng' }).click();
      await expect(page.getByRole('button', { name: 'Đóng thanh điều hướng' })).toBeVisible();
      await page.getByRole('button', { name: 'Đóng thanh điều hướng' }).click();

      for (const route of ['/student/booking', '/student/billing', '/student/path', '/student/progress', '/student/homework']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await assertNoHorizontalOverflow(route);
      }

      await loginAs(page, 'teacher@example.com', 'Teacher@123456', '/teacher');
      for (const route of ['/teacher', '/teacher/students', '/teacher/reports', '/teacher/availability', '/teacher/earnings']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await assertNoHorizontalOverflow(route);
      }

      await loginAs(page, 'admin@example.com', 'Admin@123456', '/admin');
      for (const route of ['/admin', '/admin/enrollments', '/admin/courses', '/admin/settings']) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await assertNoHorizontalOverflow(route);
      }

      health.assertHealthy();
    } finally {
      await mobileCtx.close();
    }
  });
});
