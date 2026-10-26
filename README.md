# OPIc 실전형 모의고사

Survey → 난이도 선택 → 시험 안내 → 본 시험(음성 질문·답변 녹음) → 결과 분석까지, 실제 OPIc 시험 흐름을 재현한 웹 기반 영어 말하기 모의고사입니다.
**공식 OPIc 시험·시행 기관과 무관한 독립 연습 서비스**이며, 공식 로고·화면·문제은행을 사용하지 않습니다. 모든 문항은 독자적으로 작성했습니다.

## 실행

```bash
npm install
npm run dev          # 프런트엔드 (http://localhost:5173)
npm run server       # (선택) AI 평가 서버 :8787 — Vite가 /api를 프록시
npm start            # 빌드 후 단일 서버로 앱 + API 제공 (http://localhost:8787)
npm run test:e2e     # 빌드 후 실행: Chromium 가짜 마이크로 전체 흐름 E2E 검증
```

- Node 22.18 이상 필요(서버는 `node server/index.ts`로 TypeScript를 직접 실행).
- 마이크는 **HTTPS 또는 localhost**에서만 동작합니다.

### AI 평가 (선택)

서버 환경변수에 API 키를 설정하면 활성화됩니다. 키는 서버에만 있고 프런트엔드 번들에는 포함되지 않습니다.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run server
```

- 사용 모델: `claude-opus-5-5` (구조화 JSON 출력, 거절 시 서버측 폴백 `fallbacks: "default"` 사용)
- 전송 데이터: 질문 문장, 답변 **전사 텍스트**, 답변 시간, 난이도·목표 등급. **음성 파일은 전송하지 않습니다.** 사용자 동의 창을 거친 뒤에만 전송합니다.
- 서버는 요청 내용을 저장·로그하지 않습니다.
- 키가 없으면 결과 화면에 "AI 평가 미연결" 상태가 표시되고, 녹음·재생·전사·자동 텍스트 지표는 그대로 사용할 수 있습니다. 가짜 평가를 보여주지 않습니다.

## 구조

```
src/
  data/            코드와 분리된 데이터 (JSON) — 문항 추가·수정은 여기서
    survey.json            Background Survey 단계·선택지
    questionTemplates.json Survey 주제용 범용 질문 템플릿
    topicQuestions.json    주제별 전용 질문
    roleplays.json         롤플레이 세트
    surpriseTopics.json    돌발 주제 (분리수거, 대중교통, 기술 변화, 환경 문제 등)
    examInfo.json          시험 정보 + 출처 구분(공개 자료 / 수험 자료 / 자체 설정)
  engine/          출제 로직 (UI와 분리)
    surveyData.ts   Survey 검증·주제 추출
    questionBank.ts 문항 선택
    examEngine.ts   시험 구성(시드 기반 재현), 진행 상태 reducer
    practice.ts     돌발 질문 생성
  lib/             녹음(MediaRecorder), IndexedDB, 음성 합성/인식, 텍스트 지표, 평가 API 클라이언트
  hooks/ state/    해시 라우팅, 답변 녹음 훅, 전역 저장소(localStorage)
  components/ pages/  QuestionPlayer, AudioRecorder, AnswerFeedback, HomePage, SurveyWizard,
                      DifficultySelector, ExamInstructions, ExamSession, ExamResults,
                      ProgressHistory, SurprisePractice, GuidePage
server/index.ts    AI 평가 API + 빌드 결과 정적 서빙
tests/e2e.mjs      Playwright E2E (가짜 Anthropic API로 평가 경로까지 검증)
```

## 정보 출처 구분

앱의 "시험 안내" 화면에 항목별로 표시됩니다.

| 구분 | 예시 |
|---|---|
| 공개 자료로 확인 (ACTFL OPIc Familiarization Guide 등) | Survey 응답이 출제 주제 풀을 결정, Self-Assessment가 시험 형태를 결정, 자기소개 워밍업, 약 20~40분 |
| 수험 자료 기준 (공식 원문 미확인) | Part 4 12개 이상 선택, 1~6단계 난이도, 중간 난이도 재조정 3지선다, 12~15문항, NL~AL 등급 |
| 모의고사 자체 설정 | 난이도 1~2: 12문항 / 3~6: 15문항, 7번 뒤 재조정, 문항 순서, 일시정지·다시 듣기 횟수·텍스트 표시, AI 평가 |

"12개 이상 선택" 규칙은 공식 원문으로 확인하지 못했기 때문에 기본으로 강제하지 않으며, Survey 요약 화면의 "엄격 모드"로 켤 수 있습니다.
모의고사 출제를 위해 Survey 주제가 최소 3개(거주지 포함) 필요하다는 조건은 이 앱의 자체 요구사항입니다.

## 데이터 저장

- 설정·진행 상태·결과: `localStorage` / 녹음 파일: `IndexedDB` — **현재 브라우저에만** 저장되며 다른 기기와 동기화되지 않습니다(동기화에는 별도 백엔드 필요).
- 학습 기록 화면에서 개별/전체 삭제할 수 있습니다.
- 브라우저 음성 인식(선택 기능)은 Chrome·Edge·Safari 등에서 음성을 브라우저 제조사 서버로 보낼 수 있어, 사용자가 켠 경우에만 동작합니다.
