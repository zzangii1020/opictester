import { useState } from 'react';
import { useStore } from '../state/AppStore';
import { questionTypeLabels } from '../engine/questionBank';
import { formatDuration } from '../lib/metrics';
import { AudioPlayback } from '../components/AudioPlayback';
import { ConfirmDialog, formatDate, Notice, PageHeader } from '../components/common';
import { resultStats } from '../lib/resultStats';

export function ProgressHistory() {
  const { results, practice, deletePractice, clearAll, storageWarning } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const [openPractice, setOpenPractice] = useState<string | null>(null);

  const totalRecording = results.reduce((s, r) => s + resultStats(r).recordingMs, 0) + practice.reduce((s, p) => s + (p.answer?.durationMs ?? 0), 0);

  return (
    <div>
      <PageHeader title="학습 기록" subtitle="이전 시험 결과와 돌발 질문 연습 기록" back={{ label: '홈', href: '/' }} />

      <Notice tone="info" title="저장 위치 안내">
        모든 기록과 녹음 파일은 <b>현재 사용 중인 이 브라우저</b>(localStorage·IndexedDB)에만 저장됩니다. 다른 기기나 브라우저와 동기화되지 않으며, 브라우저 데이터를 삭제하면 함께 사라집니다. 여러 기기에서 기록을 공유하려면 별도의 계정·백엔드 저장소가 필요합니다.
      </Notice>
      {storageWarning && <Notice tone="error">{storageWarning}</Notice>}

      <div className="stat-grid">
        <div className="stat"><span className="stat-label">모의고사 응시</span><span className="stat-value">{results.length}회</span></div>
        <div className="stat"><span className="stat-label">돌발 연습</span><span className="stat-value">{practice.length}회</span></div>
        <div className="stat"><span className="stat-label">누적 녹음 시간</span><span className="stat-value">{formatDuration(totalRecording)}</span></div>
        <div className="stat"><span className="stat-label">최근 AI 추정</span><span className="stat-value">{results.find((r) => r.evaluation)?.evaluation?.estimatedLevel ?? '-'}</span></div>
      </div>

      <section className="card">
        <h2>모의고사 결과</h2>
        {results.length === 0 ? (
          <p className="muted">아직 응시한 모의고사가 없습니다. <a href="#/survey?flow=exam">실전 모의고사 시작하기</a></p>
        ) : (
          <div className="table-wrap">
            <table className="history-table">
              <thead>
                <tr><th>응시일</th><th>난이도</th><th>답변</th><th>녹음 시간</th><th>평균 단어</th><th>AI 추정</th><th /></tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const s = resultStats(r);
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.finishedAt)}</td>
                      <td>{r.level}{r.adjustedLevel && r.adjustedLevel !== r.level ? `→${r.adjustedLevel}` : ''}</td>
                      <td>{s.answered}/{s.total}</td>
                      <td>{formatDuration(s.recordingMs)}</td>
                      <td>{s.avgWords ?? '-'}</td>
                      <td>{r.evaluation?.estimatedLevel ?? '-'}</td>
                      <td><a href={`#/results/${r.id}`}>보기</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>돌발 질문 연습</h2>
        {practice.length === 0 ? (
          <p className="muted">연습 기록이 없습니다. <a href="#/practice">돌발 질문 훈련 시작하기</a></p>
        ) : (
          <ul className="practice-list">
            {practice.map((p) => (
              <li key={p.id}>
                <button className="practice-row" onClick={() => setOpenPractice(openPractice === p.id ? null : p.id)} aria-expanded={openPractice === p.id}>
                  <span className="chip">{questionTypeLabels[p.question.type]}</span>
                  <span className="practice-q" lang="en">{p.question.text}</span>
                  <span className="small muted">{formatDate(p.createdAt)} · {p.answer ? formatDuration(p.answer.durationMs) : '미응답'}</span>
                </button>
                {openPractice === p.id && (
                  <div className="practice-detail">
                    {p.answer ? <AudioPlayback audioKey={p.answer.audioKey} /> : null}
                    {p.answer?.transcript && <p className="transcript" lang="en">{p.answer.transcript}</p>}
                    {p.evaluation && <p className="small"><b>AI 요약:</b> {p.evaluation.summary}</p>}
                    <button className="btn btn-sm btn-danger-outline" onClick={() => void deletePractice(p.id)}>삭제</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>데이터 관리</h2>
        <p className="small muted">Survey·난이도 설정, 진행 중인 시험, 모든 결과와 녹음 파일을 이 브라우저에서 삭제합니다.</p>
        <button className="btn btn-danger-outline" onClick={() => setConfirmClear(true)}>모든 데이터 삭제</button>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="모든 데이터를 삭제할까요?"
        confirmLabel="모두 삭제"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void clearAll();
        }}
      >
        삭제한 기록과 녹음 파일은 복구할 수 없습니다.
      </ConfirmDialog>
    </div>
  );
}
