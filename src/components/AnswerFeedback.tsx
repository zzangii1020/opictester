import { useState } from 'react';
import type { AnswerRecord, Question, QuestionFeedback } from '../types';
import { questionTypeLabels } from '../engine/questionBank';
import { analyzeText, formatDuration, metricHints } from '../lib/metrics';
import { AudioPlayback } from './AudioPlayback';

interface Props {
  index: number;
  question: Question;
  answer?: AnswerRecord;
  feedback?: QuestionFeedback;
  onTranscriptChange?: (text: string) => void;
  defaultOpen?: boolean;
}

export function AnswerFeedback({ index, question, answer, feedback, onTranscriptChange, defaultOpen }: Props) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(answer?.transcript ?? '');
  const metrics = answer && answer.transcript ? analyzeText(answer.transcript, answer.durationMs) : null;

  return (
    <article className={`answer-card ${open ? 'open' : ''}`}>
      <button className="answer-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="q-num">Q{index + 1}</span>
        <span className="answer-head-main">
          <span className="chips">
            <span className="chip">{questionTypeLabels[question.type]}</span>
            {question.topicLabel !== questionTypeLabels[question.type] && <span className="chip chip-soft">{question.topicLabel}</span>}
          </span>
          <span className="answer-head-text" lang="en">{question.text}</span>
        </span>
        <span className={`answer-state ${answer ? 'ok' : 'none'}`}>{answer ? formatDuration(answer.durationMs) : '미응답'}</span>
      </button>

      {open && (
        <div className="answer-body">
          {!answer ? (
            <p className="muted">이 문항은 답변을 녹음하지 않았습니다.</p>
          ) : (
            <>
              <AudioPlayback audioKey={answer.audioKey} />

              <h4>1. 원문 답변 (전사)</h4>
              {editing ? (
                <div className="transcript-edit">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} lang="en" placeholder="녹음을 들으며 실제로 말한 내용을 영어로 입력하세요." />
                  <div className="row gap">
                    <button className="btn btn-primary btn-sm" onClick={() => { onTranscriptChange?.(draft.trim()); setEditing(false); }}>저장</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(answer.transcript); setEditing(false); }}>취소</button>
                  </div>
                </div>
              ) : (
                <>
                  {answer.transcript ? (
                    <p className="transcript" lang="en">{answer.transcript}</p>
                  ) : (
                    <p className="muted">전사 텍스트가 없습니다. 음성 인식을 사용하지 않았거나 인식된 내용이 없습니다.</p>
                  )}
                  <p className="small muted">
                    출처: {answer.transcriptSource === 'speech' ? '브라우저 음성 인식 (오인식이 있을 수 있음)' : answer.transcriptSource === 'manual' ? '직접 입력' : '없음'}
                    {onTranscriptChange && (
                      <button className="link-btn" onClick={() => { setDraft(answer.transcript); setEditing(true); }}>
                        {answer.transcript ? '수정' : '직접 입력'}
                      </button>
                    )}
                  </p>
                </>
              )}

              {metrics && (
                <div className="metrics-box">
                  <h4>자동 텍스트 지표 <span className="badge badge-mock">규칙 기반 · AI 평가 아님</span></h4>
                  <ul className="metric-list">
                    <li><b>{metrics.wordCount}</b> 단어</li>
                    <li><b>{metrics.sentenceCount}</b> 문장</li>
                    <li><b>{metrics.wordsPerMinute ?? '-'}</b> 단어/분{answer.transcriptSource === 'manual' ? ' (입력 기준 추정)' : ''}</li>
                    <li>어휘 다양도 <b>{Math.round(metrics.uniqueWordRatio * 100)}%</b></li>
                    <li>과거 표현 <b>{metrics.pastMarkers}</b> · 미래 <b>{metrics.futureMarkers}</b> · 완료 <b>{metrics.perfectMarkers}</b></li>
                    <li>연결어 <b>{metrics.connectorCount}</b> · 군말 <b>{metrics.fillerCount}</b></li>
                  </ul>
                  <ul className="hint-list">
                    {metricHints(metrics, answer.durationMs).map((h) => <li key={h}>{h}</li>)}
                  </ul>
                </div>
              )}

              {feedback ? (
                <div className="ai-feedback">
                  <h4>AI 피드백 <span className="badge badge-mock">학습용 추정</span></h4>
                  {feedback.relevance && <p><b>질문 적절성:</b> {feedback.relevance}</p>}
                  <h5>2. 문법 오류</h5>
                  {feedback.grammarErrors.length ? (
                    <ul className="fix-list">
                      {feedback.grammarErrors.map((g, i) => (
                        <li key={i}><s lang="en">{g.original}</s> → <b lang="en">{g.correction}</b><span className="small muted"> {g.explanation}</span></li>
                      ))}
                    </ul>
                  ) : <p className="small muted">발견된 문법 오류가 없습니다.</p>}
                  <h5>3·4. 어색한 표현 → 자연스러운 표현</h5>
                  {feedback.awkwardExpressions.length ? (
                    <ul className="fix-list">
                      {feedback.awkwardExpressions.map((g, i) => (
                        <li key={i}><span lang="en">“{g.original}”</span> → <b lang="en">“{g.better}”</b><span className="small muted"> {g.explanation}</span></li>
                      ))}
                    </ul>
                  ) : <p className="small muted">특별히 어색한 표현이 없습니다.</p>}
                  <h5>5. 개선된 답변 예시</h5>
                  <p className="improved" lang="en">{feedback.improvedAnswer}</p>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </article>
  );
}
