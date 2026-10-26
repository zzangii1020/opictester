import { useState } from 'react';
import examInfo from '../data/examInfo.json';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import { isSurveyComplete, surveyTopics } from '../engine/surveyData';
import { ConfirmDialog, formatDate, Notice } from '../components/common';
import type { TargetGrade } from '../types';
import { deleteAudioByPrefix } from '../lib/audioDb';
import { InstallPrompt } from '../components/InstallPrompt';

export function HomePage() {
  const { settings, updateSettings, activeExam, setActiveExam, results, practice } = useStore();
  const [confirmNew, setConfirmNew] = useState(false);
  const surveyDone = isSurveyComplete(settings.survey, settings.prefs.strictSurveyRule);
  const latest = results[0];
  const rec = examInfo.recommendedLevel[settings.targetGrade];

  const startFlow = () => {
    if (activeExam) {
      setConfirmNew(true);
      return;
    }
    navigate('/survey?flow=exam');
  };

  return (
    <div className="home">
      <section className="hero">
        <p className="eyebrow">OPIc 실전형 모의고사</p>
        <h1>Survey부터 녹음·결과 분석까지<br />실제 시험 흐름 그대로 연습하세요</h1>
        <p className="muted">
          사전 Survey → 난이도 선택 → 시험 안내 → 본 시험(음성 질문·답변 녹음) → 결과 확인 순서로 진행됩니다.
          이 서비스는 공식 OPIc 시험이나 시행 기관과 관련이 없는 독립적인 연습용 서비스입니다.
        </p>

        {activeExam && (
          <Notice tone="info" title="진행 중인 시험이 있습니다">
            <p>
              {formatDate(activeExam.startedAt)} 시작 · {Object.keys(activeExam.answers).length}/{activeExam.totalQuestions}문항 답변
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/exam')}>이어서 응시하기</button>
          </Notice>
        )}

        <button className="btn btn-primary btn-xl" onClick={startFlow}>
          실전 모의고사 시작
        </button>
        <p className="small muted">약 20~40분 소요 · 마이크가 필요합니다 · {surveyDone ? '이전 Survey 설정을 불러와 확인합니다' : 'Survey부터 시작합니다'}</p>
      </section>

      <InstallPrompt />

      <section className="card target-card">
        <div className="row between wrap">
          <div>
            <h2>목표 등급</h2>
            <p className="small muted">목표에 맞는 난이도 추천과 결과 비교에 사용됩니다.</p>
          </div>
          <div className="seg" role="radiogroup" aria-label="목표 등급">
            {(examInfo.targetGrades as TargetGrade[]).map((g) => (
              <button
                key={g}
                role="radio"
                aria-checked={settings.targetGrade === g}
                className={`seg-btn ${settings.targetGrade === g ? 'active' : ''}`}
                onClick={() => updateSettings({ targetGrade: g })}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <p className="small">
          참고 난이도: <b>{rec[0]}~{rec[1]}단계</b> <span className="muted">— {examInfo.recommendedLevelNote}</span>
        </p>
      </section>

      <div className="tile-grid">
        <a className="tile" href="#/survey">
          <span className="tile-icon" aria-hidden="true">📝</span>
          <span className="tile-title">Survey 설정</span>
          <span className="tile-desc">{surveyDone && settings.survey ? `${surveyTopics(settings.survey).length}개 주제 선택됨` : '아직 설정하지 않음'}</span>
        </a>
        <a className="tile" href="#/difficulty">
          <span className="tile-icon" aria-hidden="true">🎚️</span>
          <span className="tile-title">난이도 설정</span>
          <span className="tile-desc">{settings.level ? `현재 난이도 ${settings.level}` : '아직 선택하지 않음'}</span>
        </a>
        <a className="tile" href={latest ? `#/results/${latest.id}` : '#/history'}>
          <span className="tile-icon" aria-hidden="true">📊</span>
          <span className="tile-title">이전 시험 결과</span>
          <span className="tile-desc">{latest ? formatDate(latest.finishedAt) : '응시 기록 없음'}</span>
        </a>
        <a className="tile" href="#/history">
          <span className="tile-icon" aria-hidden="true">📚</span>
          <span className="tile-title">학습 기록</span>
          <span className="tile-desc">시험 {results.length}회 · 돌발 연습 {practice.length}회</span>
        </a>
        <a className="tile" href="#/practice">
          <span className="tile-icon" aria-hidden="true">⚡</span>
          <span className="tile-title">돌발 질문 훈련</span>
          <span className="tile-desc">무작위 질문에 즉시 답변하기</span>
        </a>
        <a className="tile" href="#/guide">
          <span className="tile-icon" aria-hidden="true">ℹ️</span>
          <span className="tile-title">시험 안내</span>
          <span className="tile-desc">진행 방식 · 공식 정보와 모의고사 설정 구분</span>
        </a>
      </div>

      <ConfirmDialog
        open={confirmNew}
        title="새 시험을 시작할까요?"
        confirmLabel="진행 중인 시험 버리고 새로 시작"
        danger
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => {
          if (activeExam) void deleteAudioByPrefix(`${activeExam.id}:`).catch(() => undefined);
          setActiveExam(null);
          setConfirmNew(false);
          navigate('/survey?flow=exam');
        }}
      >
        진행 중인 시험의 진행 상태가 삭제됩니다. 이어서 보려면 취소 후 “이어서 응시하기”를 누르세요.
      </ConfirmDialog>
    </div>
  );
}
