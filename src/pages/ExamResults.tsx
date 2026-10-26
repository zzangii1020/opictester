import { useState } from 'react';
import { useStore } from '../state/AppStore';
import { navigate } from '../hooks/useHashRoute';
import { questionTypeLabels } from '../engine/questionBank';
import { formatDuration } from '../lib/metrics';
import { resultStats } from '../lib/resultStats';
import { buildItems } from '../lib/evaluation';
import { AnswerFeedback } from '../components/AnswerFeedback';
import { AiEvaluationPanel } from '../components/AiEvaluationPanel';
import { ConfirmDialog, formatDate, Notice, PageHeader } from '../components/common';
import type { ExamResult, QuestionType } from '../types';

function Delta({ now, prev, unit = '', format }: { now: number | null; prev: number | null; unit?: string; format?: (v: number) => string }) {
  if (now === null || prev === null) return <span className="muted">-</span>;
  const diff = now - prev;
  const f = format ?? ((v: number) => `${Math.round(v)}${unit}`);
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  return <span className={`delta ${cls}`}>{diff > 0 ? '▲' : diff < 0 ? '▼' : '='} {f(Math.abs(diff))}</span>;
}

/** Rule-based study suggestions (no AI). */
function recommendations(r: ExamResult): { text: string; practiceType?: QuestionType }[] {
  const recs: { text: string; practiceType?: QuestionType }[] = [];
  const unanswered = r.questions.filter((q) => !r.answers[q.id]);
  const short = r.questions.filter((q) => r.answers[q.id] && r.answers[q.id].durationMs < 45000);
  const byType = (qs: typeof r.questions) => [...new Set(qs.map((q) => q.type))];
  for (const t of byType(unanswered).slice(0, 2)) recs.push({ text: `답변하지 못한 “${questionTypeLabels[t]}” 유형을 돌발 훈련에서 연습하세요.`, practiceType: t });
  for (const t of byType(short).slice(0, 2)) recs.push({ text: `“${questionTypeLabels[t]}” 유형 답변이 짧았습니다. 1분 이상 말하는 연습을 해 보세요.`, practiceType: t });
  if (!r.questions.some((q) => q.source === 'surprise' && r.answers[q.id])) recs.push({ text: 'Survey 밖 돌발 주제에 대한 답변이 부족합니다. 돌발 질문 훈련을 이용하세요.' });
  if (recs.length === 0) recs.push({ text: '모든 문항에 충분히 답변했습니다. 난이도를 한 단계 올리거나 AI 피드백의 개선 표현을 다음 시험에서 사용해 보세요.' });
  return recs.slice(0, 4);
}

export function ExamResults({ id }: { id: string }) {
  const { results, saveResult, deleteResult } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const result = results.find((r) => r.id === id);

  if (!result) {
    return (
      <div className="narrow">
        <PageHeader title="결과를 찾을 수 없습니다" back={{ label: '학습 기록', href: '/history' }} />
        <p className="muted">이 브라우저에 저장된 결과가 없습니다. 결과는 응시한 브라우저에만 저장됩니다.</p>
      </div>
    );
  }

  const stats = resultStats(result);
  const ordered = [...results].sort((a, b) => a.finishedAt - b.finishedAt);
  const prev = ordered[ordered.findIndex((r) => r.id === id) - 1];
  const prevStats = prev ? resultStats(prev) : null;
  const evaluation = result.evaluation;

  const updateTranscript = (questionId: string, text: string) => {
    const a = result.answers[questionId];
    if (!a) return;
    saveResult({
      ...result,
      answers: { ...result.answers, [questionId]: { ...a, transcript: text, transcriptSource: text ? 'manual' : 'none' } },
    });
  };

  const ruleImprovements = (() => {
    const tips: string[] = [];
    if (stats.answered < stats.total) tips.push(`${stats.total - stats.answered}개 문항에 답변하지 않았습니다. 모르는 주제라도 아는 경험과 연결해 답변을 시도하세요.`);
    if (stats.avgDurationMs && stats.avgDurationMs < 60000) tips.push(`평균 답변 시간이 ${formatDuration(stats.avgDurationMs)}입니다. 도입–구체적 예시–마무리 구조로 1~2분을 채워 보세요.`);
    if (stats.avgWords !== null && stats.avgWords < 80) tips.push(`평균 ${stats.avgWords}단어로 답변했습니다. 장소·사람·시간·느낌을 덧붙여 내용을 늘리세요.`);
    if (stats.avgWords === null) tips.push('전사 텍스트가 없어 내용 기반 분석을 할 수 없습니다. 음성 인식을 켜거나 답변 텍스트를 직접 입력해 보세요.');
    return tips.length ? tips : ['기본 지표상 답변량은 충분합니다. 표현의 정확성과 다양성은 AI 평가로 확인하세요.'];
  })();

  return (
    <div className="results">
      <PageHeader
        title="시험 결과"
        subtitle={`${formatDate(result.finishedAt)} · 난이도 ${result.level}${result.adjustedLevel && result.adjustedLevel !== result.level ? ` → ${result.adjustedLevel}` : ''} · 목표 ${result.targetGrade}`}
        back={{ label: '학습 기록', href: '/history' }}
      />

      <div className="stat-grid">
        <div className="stat"><span className="stat-label">총 문제 수</span><span className="stat-value">{stats.total}</span></div>
        <div className="stat"><span className="stat-label">답변 완료</span><span className="stat-value">{stats.answered}</span></div>
        <div className="stat"><span className="stat-label">전체 녹음 시간</span><span className="stat-value">{formatDuration(stats.recordingMs)}</span></div>
        <div className="stat"><span className="stat-label">시험 경과 시간</span><span className="stat-value">{formatDuration(result.elapsedMs)}</span></div>
      </div>

      <section className="card">
        <h2>이전 시험과 비교</h2>
        {prev && prevStats ? (
          <table className="compare">
            <thead><tr><th>항목</th><th>이번</th><th>이전 ({formatDate(prev.finishedAt)})</th><th>변화</th></tr></thead>
            <tbody>
              <tr><td>답변 완료</td><td>{stats.answered}/{stats.total}</td><td>{prevStats.answered}/{prevStats.total}</td><td><Delta now={stats.answered} prev={prevStats.answered} unit="문항" /></td></tr>
              <tr><td>평균 답변 시간</td><td>{formatDuration(stats.avgDurationMs)}</td><td>{formatDuration(prevStats.avgDurationMs)}</td><td><Delta now={stats.avgDurationMs} prev={prevStats.avgDurationMs} format={formatDuration} /></td></tr>
              <tr><td>평균 단어 수</td><td>{stats.avgWords ?? '-'}</td><td>{prevStats.avgWords ?? '-'}</td><td><Delta now={stats.avgWords} prev={prevStats.avgWords} unit="단어" /></td></tr>
              <tr><td>평균 단어/분</td><td>{stats.avgWpm ?? '-'}</td><td>{prevStats.avgWpm ?? '-'}</td><td><Delta now={stats.avgWpm} prev={prevStats.avgWpm} /></td></tr>
              <tr><td>AI 추정 수준</td><td>{evaluation?.estimatedLevel ?? '-'}</td><td>{prev.evaluation?.estimatedLevel ?? '-'}</td><td /></tr>
            </tbody>
          </table>
        ) : (
          <p className="muted">비교할 이전 시험이 없습니다. 다음 시험부터 변화가 표시됩니다.</p>
        )}
      </section>

      <AiEvaluationPanel
        items={buildItems(result.questions, result.answers)}
        level={result.adjustedLevel ?? result.level}
        targetGrade={result.targetGrade}
        evaluation={evaluation}
        onEvaluated={(ev) => saveResult({ ...result, evaluation: ev })}
      />

      <div className="two-col">
        <section className="card">
          <h2>주요 개선점</h2>
          {evaluation ? (
            <ul className="plain-list">
              {[...evaluation.criteria].filter((c) => c.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 3).map((c) => (
                <li key={c.key}><b>{c.label}</b> ({c.score}/5): {c.tip || c.comment}</li>
              ))}
            </ul>
          ) : (
            <>
              <p className="small muted">AI 평가 전이므로 녹음 시간·단어 수 기반 규칙으로 산출했습니다.</p>
              <ul className="plain-list">{ruleImprovements.map((t) => <li key={t}>{t}</li>)}</ul>
            </>
          )}
        </section>
        <section className="card">
          <h2>다음 학습 추천</h2>
          <ul className="plain-list">
            {recommendations(result).map((r) => (
              <li key={r.text}>
                {r.text}{' '}
                <a className="link-btn" href={`#/practice${r.practiceType ? `?type=${r.practiceType}` : ''}`}>연습하기 →</a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h2>문제별 답변 및 피드백</h2>
        <p className="small muted">문항을 눌러 녹음 재생, 전사 텍스트, 문법·표현 피드백을 확인하세요. 전사 텍스트는 직접 수정할 수 있으며 AI 평가에 반영됩니다.</p>
        {!evaluation && <Notice tone="info">문법 오류·어색한 표현·개선된 답변 예시는 AI 평가를 받은 뒤 표시됩니다.</Notice>}
        <div className="answer-list">
          {result.questions.map((q, i) => (
            <AnswerFeedback
              key={q.id}
              index={i}
              question={q}
              answer={result.answers[q.id]}
              feedback={evaluation?.perQuestion.find((f) => f.questionId === q.id)}
              onTranscriptChange={(text) => updateTranscript(q.id, text)}
            />
          ))}
        </div>
      </section>

      <div className="row between wrap gap">
        <a className="btn btn-primary" href="#/survey?flow=exam">다시 응시하기</a>
        <button className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)}>이 결과 삭제</button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="이 결과를 삭제할까요?"
        confirmLabel="삭제"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteResult(result.id).then(() => navigate('/history', true));
        }}
      >
        결과 정보와 이 브라우저에 저장된 녹음 파일이 모두 삭제됩니다.
      </ConfirmDialog>
    </div>
  );
}
