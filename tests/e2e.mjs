// End-to-end check of the full mock-test flow in Chromium with a fake microphone.
// Usage: npm run build && node tests/e2e.mjs [screenshotDir]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startFakeAnthropic } from './fake-anthropic.mjs';

// Uses the machine's preinstalled Playwright (resolved via require so NODE_PATH applies).
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 8799;
const FAKE_API_PORT = 9911;
const BASE = `http://localhost:${PORT}`;
const shots = process.argv[2] ?? 'test-results';
mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const fakeApi = startFakeAnthropic(FAKE_API_PORT);
const server = spawn('node', ['server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: `http://localhost:${FAKE_API_PORT}` },
  stdio: 'inherit',
});
await new Promise((r) => setTimeout(r, 1200));

// Headless Chromium has no TTS voices; make speech finish quickly so the test isn't timing-bound.
const ttsStub = () => {
  const synth = window.speechSynthesis;
  synth.speak = (u) => setTimeout(() => u.onend?.(new Event('end')), 300);
  synth.cancel = () => {};
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function newPage(contextOptions = {}) {
  const context = await browser.newContext({ permissions: ['microphone'], ...contextOptions });
  await context.addInitScript(ttsStub);
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return { context, page };
}

async function answerCurrent(page, ms = 1500) {
  const rec = page.getByRole('button', { name: /● (녹음 시작|다시 녹음)/ });
  await rec.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /● 녹음 시작/.test(b.textContent) && !b.disabled), null, { timeout: 15000 });
  await rec.click();
  await page.getByText('녹음 중 · 답변하고 있습니다').waitFor();
  const nextDisabled = await page.getByRole('button', { name: /다음 문제|시험 종료/ }).isDisabled();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: '■ 녹음 종료' }).click();
  await page.getByText('✓ 답변이 저장되었습니다').waitFor();
  return nextDisabled;
}

async function questionNumber(page) {
  const text = await page.locator('.exam-count').innerText();
  const m = text.match(/Question\s+(\d+)\s+of\s+(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

try {
  const { page } = await newPage();

  // 1. Home
  await page.goto(BASE);
  check('홈 화면에 실전 모의고사 시작 버튼', await page.getByRole('button', { name: '실전 모의고사 시작' }).isVisible());
  await page.getByRole('radio', { name: 'IH' }).click();
  await page.screenshot({ path: `${shots}/01-home.png`, fullPage: true });

  // 2. Survey wizard
  await page.getByRole('button', { name: '실전 모의고사 시작' }).click();
  await page.getByRole('heading', { name: '현재 귀하는 어느 분야에 종사하고 계십니까?' }).waitFor();
  await page.getByRole('button', { name: '다음' }).click();
  check('Survey 필수 항목 검증', await page.getByText('항목을 하나 선택해 주세요.').isVisible());
  await page.getByRole('radio', { name: '사업 / 회사' }).click();
  await page.getByRole('heading', { name: '현재 학생이십니까?' }).waitFor();
  await page.getByRole('button', { name: '이전' }).click();
  check('Survey 이전 단계로 돌아가기', await page.getByRole('radio', { name: '사업 / 회사' }).getAttribute('aria-checked') === 'true');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('radio', { name: '아니요' }).click();
  await page.getByRole('heading', { name: '최근 어떤 강의를 수강했습니까?' }).waitFor();
  check('학생 여부에 따른 조건부 단계 표시', true);
  await page.getByRole('radio', { name: '수강 후 5년 이상 지남' }).click();
  await page.getByRole('radio', { name: /가족/ }).click();
  await page.getByRole('heading', { name: /여가 활동/ }).waitFor();
  for (const o of ['영화 보기', '공원 가기', '카페 / 커피 전문점 가기']) await page.getByRole('checkbox', { name: o }).click();
  await page.screenshot({ path: `${shots}/02-survey-multi.png`, fullPage: true });
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('checkbox', { name: '음악 감상하기' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('checkbox', { name: '걷기' }).click();
  await page.getByRole('checkbox', { name: '운동을 전혀 하지 않음' }).click();
  check('운동 안 함 선택 시 다른 운동 해제(배타 선택)', (await page.getByRole('checkbox', { name: '걷기' }).getAttribute('aria-checked')) === 'false');
  await page.getByRole('checkbox', { name: '걷기' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('checkbox', { name: '국내 여행' }).click();
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('heading', { name: '선택한 내용을 확인하세요' }).waitFor();
  check('Survey 요약 표시', await page.getByText('영화 보기, 공원 가기, 카페 / 커피 전문점 가기').isVisible());
  await page.screenshot({ path: `${shots}/03-survey-summary.png`, fullPage: true });
  await page.getByRole('button', { name: '저장하고 난이도 선택으로' }).click();

  // 3. Difficulty
  await page.getByRole('heading', { name: '난이도 선택 (Self-Assessment)' }).waitFor();
  await page.getByRole('radio', { name: /^5 난이도 5/ }).click();
  check('난이도 선택 시 문항 수 표시', await page.getByText('15문항').first().isVisible());
  await page.getByRole('button', { name: '다음: 시험 안내' }).click();

  // 4. Instructions + mic test
  await page.getByRole('heading', { name: '시험 안내' }).waitFor();
  check('시험 시작 전 설정 확인(난이도 반영)', await page.getByText('5단계 · 15문항').isVisible());
  await page.getByRole('button', { name: /마이크 테스트/ }).click();
  await page.locator('.mic-check audio').waitFor({ timeout: 10000 });
  check('마이크 권한 요청 및 테스트 녹음', true);
  await page.screenshot({ path: `${shots}/04-instructions.png`, fullPage: true });
  await page.getByRole('button', { name: '본 시험 시작' }).click();

  // 5. Exam session 1
  await page.locator('.exam-count').waitFor();
  const [, total] = await questionNumber(page);
  check('난이도 5 → 총 15문항', total === 15, `total=${total}`);
  const firstQ = await page.locator('.question-text').innerText();
  check('첫 문항은 자기소개', /yourself/i.test(firstQ), firstQ.slice(0, 60));
  let nextBlockedWhileRecording = true;
  for (let i = 1; i <= 7; i++) {
    const [n] = await questionNumber(page);
    if (n !== i) check(`문항 순서 ${i}`, false, `got ${n}`);
    nextBlockedWhileRecording &&= await answerCurrent(page);
    if (i === 2) await page.screenshot({ path: `${shots}/05-exam-answered.png`, fullPage: true });
    await page.getByRole('button', { name: '다음 문제 →' }).click();
  }
  check('녹음 중에는 다음 문제 버튼 비활성', nextBlockedWhileRecording);
  check('문항 1→7 순서대로 표시', true);

  // Difficulty readjustment
  await page.getByRole('heading', { name: '이후 질문의 난이도를 선택하세요' }).waitFor();
  await page.screenshot({ path: `${shots}/06-adjust.png`, fullPage: true });
  await page.getByRole('button', { name: /어려운 질문/ }).click();
  const [n8] = await questionNumber(page);
  check('난이도 재조정 후 8번 문항', n8 === 8);
  await answerCurrent(page);

  // Reload mid-exam → progress restored
  await page.reload();
  await page.locator('.exam-count').waitFor();
  const [nAfterReload] = await questionNumber(page);
  check('새로고침 후 진행 상태 복구', nAfterReload === 8 && (await page.getByText('✓ 답변이 저장되었습니다').isVisible()));
  await page.getByRole('button', { name: '다음 문제 →' }).click();

  // Leave and resume from home
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByRole('button', { name: '저장하고 나가기' }).click();
  await page.getByRole('button', { name: '이어서 응시하기' }).click();
  const [nResume] = await questionNumber(page);
  check('나가기 후 홈에서 이어서 응시', nResume === 9);

  for (let i = 9; i <= 15; i++) {
    if (i === 10) {
      // Skip one question to exercise the unanswered path.
      await page.getByRole('button', { name: '다음 문제 →' }).click();
      await page.getByRole('button', { name: '답변 없이 다음 문제' }).click();
      continue;
    }
    await answerCurrent(page, 1000);
    if (i < 15) await page.getByRole('button', { name: '다음 문제 →' }).click();
  }
  await page.getByRole('button', { name: '시험 종료' }).click();
  await page.getByRole('button', { name: '시험 종료하고 결과 보기' }).click();

  // 6. Results
  await page.getByRole('heading', { name: '시험 결과' }).waitFor();
  const stats = await page.locator('.stat-value').allInnerTexts();
  check('결과: 총 문제 수 15 / 답변 14', stats[0] === '15' && stats[1] === '14', stats.join(' | '));
  check('AI 미평가 상태에서 평가 버튼만 노출 (가짜 평가 없음)', !(await page.locator('.eval-summary').count()));
  await page.locator('.answer-head').first().click();
  const audio = page.locator('.answer-card.open audio');
  await audio.waitFor();
  const played = await audio.evaluate(async (el) => {
    el.muted = true;
    await el.play();
    await new Promise((r) => setTimeout(r, 700));
    const t = el.currentTime;
    el.pause();
    return t;
  });
  check('녹음한 답변 재생', played > 0.2, `currentTime=${played.toFixed(2)}`);
  await page.locator('.answer-card.open').getByRole('button', { name: '직접 입력' }).click();
  await page.locator('.answer-card.open textarea').fill('Hi, my name is Minji. I goed to the park yesterday and I very much like walking there because it is quiet.');
  await page.locator('.answer-card.open').getByRole('button', { name: '저장' }).click();
  check('전사 텍스트 직접 입력 및 자동 지표', await page.getByText('자동 텍스트 지표').isVisible());
  await page.screenshot({ path: `${shots}/07-results.png`, fullPage: true });

  await page.getByRole('button', { name: 'AI 평가 받기' }).click();
  check('AI 평가 전 전송 동의 창', await page.getByRole('heading', { name: '답변 텍스트 전송 동의' }).isVisible());
  await page.getByRole('button', { name: '동의하고 평가 받기' }).click();
  await page.locator('.eval-summary').waitFor({ timeout: 15000 });
  const req = fakeApi.state.lastRequest;
  check('평가 요청: 모델·폴백·구조화 출력', req.model === 'claude-opus-5-5' && req.fallbacks === 'default' && req.output_config?.format?.type === 'json_schema' && /server-side-fallback-2026-07-01/.test(fakeApi.state.lastHeaders['anthropic-beta'] ?? ''));
  check('평가 요청에 음성 데이터 없음 (텍스트만)', !/audio|blob|base64/i.test(JSON.stringify(req.messages)) && req.messages[0].content.includes('I goed'));
  check('유창성 평가 불가 표시 (직접 입력 텍스트)', await page.getByText('평가 불가').isVisible());
  await page.locator('.answer-head').first().click();
  await page.locator('.answer-head').first().click();
  check('문항별 문법·표현 피드백 표시', await page.getByText('I went').first().isVisible());
  await page.screenshot({ path: `${shots}/08-results-ai.png`, fullPage: true });

  // 7. History
  await page.goto(`${BASE}/#/history`);
  check('학습 기록에 시험 결과 표시', (await page.locator('.history-table tbody tr').count()) === 1);

  // 8. Survey persisted → second exam with a changed survey and level 2
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: '실전 모의고사 시작' }).click();
  await page.getByText('이전에 저장한 Survey 설정을 불러왔습니다').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('재응시 시 이전 Survey 불러오기', await page.getByText('이전에 저장한 Survey 설정을 불러왔습니다').isVisible());
  await page.locator('.summary-row', { hasText: '여가 활동' }).getByRole('button', { name: '수정' }).click();
  for (const o of ['영화 보기', '공원 가기', '카페 / 커피 전문점 가기']) await page.getByRole('checkbox', { name: o }).click();
  await page.getByRole('checkbox', { name: '쇼핑하기' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '저장하고 난이도 선택으로' }).click();
  await page.getByRole('radio', { name: /^2 난이도 2/ }).click();
  await page.getByRole('button', { name: '다음: 시험 안내' }).click();
  await page.getByRole('button', { name: '본 시험 시작' }).click();
  await page.locator('.exam-count').waitFor();
  const [, total2] = await questionNumber(page);
  check('난이도 2 → 총 12문항', total2 === 12);
  const allowed = ['쇼핑하기', '음악 감상하기', '걷기', '국내 여행', '거주지', '자기소개'];
  const labels = [];
  for (let i = 1; i <= 7; i++) {
    labels.push(i === 1 ? '자기소개' : await page.locator('.q-meta .dim').innerText());
    await page.getByRole('button', { name: '다음 문제 →' }).click();
    await page.getByRole('button', { name: '답변 없이 다음 문제' }).click();
  }
  check('변경한 Survey가 출제에 반영', labels.every((l) => allowed.some((a) => l.startsWith(a))), labels.join(', '));
  await page.getByRole('button', { name: /비슷한 질문/ }).click();
  for (let i = 8; i <= 12; i++) {
    await page.getByRole('button', { name: /다음 문제 →|시험 종료/ }).click();
    await page.getByRole('button', { name: /답변 없이/ }).click();
  }
  await page.getByRole('heading', { name: '시험 결과' }).waitFor();
  check('이전 시험과 비교 표 표시', await page.locator('table.compare').isVisible());

  // 9. Surprise practice
  await page.goto(`${BASE}/#/practice?type=comparison`);
  await page.getByRole('heading', { name: '돌발 질문 훈련' }).waitFor();
  await page.locator('label.field', { hasText: '질문 후 준비 시간' }).locator('select').selectOption('0');
  await page.getByRole('button', { name: '훈련 시작' }).click();
  await page.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
  check('돌발 질문: 질문 후 자동 녹음 시작', true, await page.locator('.practice-card .question-text').innerText().then((t) => t.slice(0, 60)));
  check('돌발 질문: 유형 필터(비교)', await page.locator('.practice-card .chip').first().innerText() === '비교');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '■ 녹음 종료' }).click();
  await page.locator('.practice-card .answer-card audio').waitFor({ timeout: 10000 });
  check('돌발 질문: 답변 저장 및 피드백 영역', true);
  await page.screenshot({ path: `${shots}/09-practice.png`, fullPage: true });
  const q1 = await page.locator('.practice-card .question-text').innerText();
  await page.getByRole('button', { name: '다음 돌발 질문 →' }).click();
  await page.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
  const q2 = await page.locator('.practice-card .question-text').innerText();
  check('돌발 질문: 다음 질문 출제', q1 !== q2);
  await page.getByRole('button', { name: '■ 녹음 종료' }).click();
  await page.locator('.practice-card .answer-card audio').waitFor({ timeout: 10000 });

  // Time limit
  await page.getByRole('button', { name: '설정 변경' }).click();
  await page.locator('label.field', { hasText: '질문 유형' }).locator('select').selectOption('any');
  await page.locator('label.field', { hasText: '답변 시간 제한' }).locator('select').selectOption('45');
  await page.getByRole('button', { name: '훈련 시작' }).click();
  await page.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
  check('돌발 질문: 제한 시간 표시', await page.locator('.rec-timer').innerText().then((t) => t.includes('0:45')));
  await page.getByRole('button', { name: '■ 녹음 종료' }).click();
  await page.locator('.practice-card .answer-card audio').waitFor({ timeout: 10000 });
  await page.goto(`${BASE}/#/history`);
  check('학습 기록에 연습 기록 표시', (await page.locator('.practice-list li').count()) >= 3);

  // 10. Mic permission denied → clear message and retry
  const { context: deniedCtx, page: denied } = await newPage({ permissions: [] });
  await denied.goto(BASE);
  await denied.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await denied.goto(`${BASE}/#/practice`);
  await denied.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await denied.locator('label.field', { hasText: '질문 후 준비 시간' }).locator('select').selectOption('0');
  await denied.getByRole('button', { name: '훈련 시작' }).click();
  await denied.getByText('마이크 권한이 거부되었습니다').waitFor({ timeout: 10000 });
  check('마이크 권한 거부 시 원인 안내 및 다시 시도 버튼', await denied.getByRole('button', { name: '다시 시도' }).isVisible());
  await deniedCtx.close();

  // 10b. iPhone failure modes reproduced in Chromium
  {
    // Speech recognition that aborts instantly (what iOS does while the recorder holds the mic).
    const { context: c1, page: p1 } = await newPage();
    await c1.addInitScript(() => {
      window.__recStarts = 0;
      class AbortingRecognition {
        start() { window.__recStarts++; setTimeout(() => { this.onerror?.({ error: 'aborted' }); this.onend?.(); }, 5); }
        stop() { setTimeout(() => this.onend?.(), 5); }
        abort() {}
      }
      window.webkitSpeechRecognition = AbortingRecognition;
      window.SpeechRecognition = AbortingRecognition;
      localStorage.setItem('opic-mock.settings.v1', JSON.stringify({ prefs: { sttEnabled: true } }));
    });
    await p1.goto(`${BASE}/#/practice`);
    await p1.locator('label.field', { hasText: '질문 후 준비 시간' }).locator('select').selectOption('0');
    await p1.getByRole('button', { name: '훈련 시작' }).click();
    await p1.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
    await p1.waitForTimeout(3000);
    const starts = await p1.evaluate(() => window.__recStarts);
    const t0 = Date.now();
    await p1.getByRole('button', { name: '■ 녹음 종료' }).click({ timeout: 3000 });
    await p1.locator('.practice-card .answer-card audio').waitFor({ timeout: 6000 });
    check('iOS 재현: 음성 인식 즉시 중단 시 재시작 루프 없음', starts <= 4, `starts=${starts}`);
    check('iOS 재현: 그 상태에서도 녹음 종료 정상', Date.now() - t0 < 6000, `${Date.now() - t0}ms`);
    check('iOS 재현: 음성 인식 중단 안내', await p1.getByText('음성 인식이 계속 중단되어').isVisible());
    await c1.close();

    // MediaRecorder that never fires onstop.
    const { context: c2, page: p2 } = await newPage();
    await c2.addInitScript(() => {
      const realStop = MediaRecorder.prototype.stop;
      MediaRecorder.prototype.stop = function () {
        this.requestData();
        const self = this;
        setTimeout(() => { self.onstop = null; realStop.call(self); }, 0);
      };
      Object.defineProperty(MediaRecorder.prototype, 'onstop', { set() {}, get() { return null; }, configurable: true });
    });
    await p2.goto(`${BASE}/#/practice`);
    await p2.locator('label.field', { hasText: '질문 후 준비 시간' }).locator('select').selectOption('0');
    await p2.getByRole('button', { name: '훈련 시작' }).click();
    await p2.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
    await p2.waitForTimeout(1500);
    const t1 = Date.now();
    await p2.getByRole('button', { name: '■ 녹음 종료' }).click();
    await p2.locator('.practice-card .answer-card audio').waitFor({ timeout: 8000 });
    check('iOS 재현: onstop 미발생 시에도 녹음 저장', true, `${Date.now() - t1}ms`);
    await c2.close();

    // iPhone user agent + speech recognition enabled → recording only, with a notice.
    const { context: c3, page: p3 } = await newPage({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    await c3.addInitScript(() => localStorage.setItem('opic-mock.settings.v1', JSON.stringify({ prefs: { sttEnabled: true } })));
    await p3.goto(`${BASE}/#/practice`);
    await p3.locator('label.field', { hasText: '질문 후 준비 시간' }).locator('select').selectOption('0');
    await p3.getByRole('button', { name: '훈련 시작' }).click();
    await p3.getByText('녹음 중 · 답변하고 있습니다').waitFor({ timeout: 10000 });
    check('iPhone: 녹음 중 음성 인식 비활성 안내', await p3.getByText('iPhone·iPad에서는 녹음 중 음성 인식을').isVisible());
    await p3.waitForTimeout(1000);
    await p3.getByRole('button', { name: '■ 녹음 종료' }).tap();
    await p3.locator('.practice-card .answer-card audio').waitFor({ timeout: 6000 });
    check('iPhone: 탭으로 녹음 종료', true);
    await c3.close();
  }

  // 11. Mobile viewport
  const { context: mobileCtx, page: mobile } = await newPage({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  const overflow = async (label) => {
    const w = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`모바일 가로 넘침 없음: ${label}`, w <= 0, `overflow=${w}px`);
  };
  await mobile.goto(BASE);
  await overflow('홈');
  await mobile.screenshot({ path: `${shots}/10-mobile-home.png`, fullPage: true });
  await mobile.getByRole('button', { name: '실전 모의고사 시작' }).click();
  await mobile.getByRole('radio', { name: '교사 / 교육자' }).click();
  await mobile.getByRole('radio', { name: '예' }).click();
  await mobile.getByRole('radio', { name: '어학 수업' }).click();
  await mobile.getByRole('radio', { name: '학교 기숙사' }).click();
  await mobile.getByRole('checkbox', { name: 'TV 시청하기' }).click();
  await mobile.getByRole('checkbox', { name: '쇼핑하기' }).click();
  await overflow('Survey');
  await mobile.screenshot({ path: `${shots}/11-mobile-survey.png`, fullPage: true });
  await mobile.getByRole('button', { name: '다음' }).click();
  await mobile.getByRole('checkbox', { name: '요리하기' }).click();
  await mobile.getByRole('button', { name: '다음' }).click();
  await mobile.getByRole('checkbox', { name: '수영' }).click();
  await mobile.getByRole('button', { name: '다음' }).click();
  await mobile.getByRole('checkbox', { name: '해외 여행' }).click();
  await mobile.getByRole('button', { name: '다음' }).click();
  await mobile.getByRole('button', { name: '저장하고 난이도 선택으로' }).click();
  await mobile.getByRole('radio', { name: /^3 난이도 3/ }).click();
  await overflow('난이도');
  await mobile.getByRole('button', { name: '다음: 시험 안내' }).click();
  await overflow('시험 안내');
  await mobile.getByRole('button', { name: '본 시험 시작' }).click();
  await answerCurrent(mobile);
  await overflow('시험 화면');
  await mobile.screenshot({ path: `${shots}/12-mobile-exam.png`, fullPage: true });
  await mobile.getByRole('button', { name: '나가기' }).click();
  await mobile.getByRole('button', { name: '여기서 시험 종료' }).click();
  await mobile.getByRole('heading', { name: '시험 결과' }).waitFor();
  await overflow('결과');
  await mobile.screenshot({ path: `${shots}/13-mobile-results.png`, fullPage: true });
  await mobile.goto(`${BASE}/#/guide`);
  await overflow('시험 안내 페이지');
  await mobileCtx.close();

  check('콘솔 오류 없음', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (err) {
  check('E2E 실행', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' ') : String(err));
} finally {
  await browser.close();
  server.kill();
  fakeApi.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
