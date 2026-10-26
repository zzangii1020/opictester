import { useEffect, useState } from 'react';
import type { AiEvaluation, TargetGrade } from '../types';
import { fetchAiStatus, requestEvaluation, type AiStatus, type EvaluationItem } from '../lib/evaluation';
import { ConfirmDialog, Notice } from './common';

interface Props {
  items: EvaluationItem[];
  level: number;
  targetGrade: TargetGrade;
  evaluation: AiEvaluation | null;
  onEvaluated: (evaluation: AiEvaluation) => void;
}

export function AiEvaluationPanel({ items, level, targetGrade, evaluation, onEvaluated }: Props) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAiStatus().then(setStatus);
  }, []);

  const withText = items.filter((i) => i.transcript.length > 0);

  const run = async () => {
    setConsentOpen(false);
    setLoading(true);
    setError(null);
    try {
      onEvaluated(await requestEvaluation(withText, level, targetGrade));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 평가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>AI 답변 평가</h2>
      <Notice tone="warn">
        AI 평가는 <b>학습용 추정치</b>입니다. 공식 OPIc 성적이 아니며, 실제 시험의 비공개 채점 기준을 재현하지 않습니다.
      </Notice>

      {evaluation ? (
        <EvaluationSummary evaluation={evaluation} />
      ) : status === null ? (
        <p className="muted">평가 서버 상태 확인 중…</p>
      ) : !status.available ? (
        <Notice tone="info" title="AI 평가 미연결 상태">
          <p>{status.reason ?? 'AI 평가 서버가 설정되지 않았습니다.'}</p>
          <p className="small">
            녹음·재생·전사·자동 텍스트 지표는 AI 없이도 모두 사용할 수 있습니다. AI 평가를 쓰려면 서버 환경변수 <code>ANTHROPIC_API_KEY</code>를 설정하고 <code>npm run server</code>(개발) 또는 <code>npm start</code>(배포)로 평가 서버를 실행하세요. API 키는 서버에만 두며 프런트엔드 코드에는 포함되지 않습니다.
          </p>
        </Notice>
      ) : withText.length === 0 ? (
        <Notice tone="info" title="평가할 답변 텍스트가 없습니다">
          AI 평가는 답변의 전사 텍스트를 기반으로 합니다. 시험 안내 화면에서 음성 인식을 켜거나, 아래 문항별 카드에서 “직접 입력”으로 답변 내용을 입력해 주세요.
        </Notice>
      ) : (
        <>
          <p className="small muted">
            전사 텍스트가 있는 {withText.length}개 답변을 평가합니다. ({status.model})
            {withText.length < items.length && ` 텍스트가 없는 ${items.length - withText.length}개 답변은 제외됩니다.`}
          </p>
          <button className="btn btn-primary" disabled={loading} onClick={() => setConsentOpen(true)}>
            {loading ? 'AI가 답변을 분석하는 중… (최대 1~2분)' : 'AI 평가 받기'}
          </button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <ConfirmDialog
        open={consentOpen}
        title="답변 텍스트 전송 동의"
        confirmLabel="동의하고 평가 받기"
        onConfirm={() => void run()}
        onCancel={() => setConsentOpen(false)}
      >
        <ul className="consent-list">
          <li><b>전송 내용:</b> 질문 문장, 답변 전사 텍스트, 답변 시간(초), 선택 난이도·목표 등급. <b>음성 파일은 전송하지 않습니다.</b></li>
          <li><b>전송 경로:</b> 이 앱의 평가 서버 → Anthropic Claude API.</li>
          <li><b>목적:</b> 답변 평가 및 학습 피드백 생성에만 사용합니다.</li>
          <li><b>보관:</b> 평가 서버는 내용을 저장하지 않습니다. 결과는 이 브라우저에만 저장되며 기록 화면에서 삭제할 수 있습니다. API 제공자의 데이터 처리는 Anthropic 정책을 따릅니다.</li>
        </ul>
      </ConfirmDialog>
    </section>
  );
}

export function EvaluationSummary({ evaluation }: { evaluation: AiEvaluation }) {
  return (
    <div className="eval-summary">
      <div className="eval-head">
        <div>
          <div className="small muted">AI 추정 수준 (학습용)</div>
          <div className="eval-level">{evaluation.estimatedLevel}</div>
        </div>
        <p>{evaluation.summary}</p>
      </div>
      <table className="criteria">
        <thead>
          <tr><th>평가 항목</th><th>점수</th><th>코멘트 / 개선 방법</th></tr>
        </thead>
        <tbody>
          {evaluation.criteria.map((c) => (
            <tr key={c.key}>
              <td>{c.label}</td>
              <td>
                {c.score === null ? <span className="muted small">평가 불가</span> : (
                  <span className="score"><span className="score-bar"><span style={{ width: `${(c.score / 5) * 100}%` }} /></span>{c.score}/5</span>
                )}
              </td>
              <td>
                <div>{c.comment}</div>
                {c.tip && <div className="small tip">💡 {c.tip}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">유창성 판단 근거: {evaluation.fluencyBasis}</p>
      <h3>6. 다음 시험에서 실천할 행동</h3>
      <ol className="action-list">
        {evaluation.actionItems.map((a) => <li key={a}>{a}</li>)}
      </ol>
      <p className="small muted">평가 모델: {evaluation.model} · {new Date(evaluation.createdAt).toLocaleString('ko-KR')}</p>
    </div>
  );
}
