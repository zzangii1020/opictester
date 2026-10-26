import examInfo from '../data/examInfo.json';
import { practiceTypes, questionTypeLabels } from '../engine/questionBank';
import { PageHeader, StatusBadge } from '../components/common';

type Status = keyof typeof examInfo.statusLabels;

const typeDescriptions: Record<string, string> = {
  description: '장소·사람·사물을 구체적으로 묘사합니다.',
  routine: '평소 하는 일과 습관을 순서대로 설명합니다.',
  pastExperience: '처음 시작한 계기나 과거 경험을 과거 시제로 이야기합니다.',
  memorable: '기억에 남는 특정 사건을 시간 순서대로 풀어냅니다.',
  comparison: '두 대상 또는 과거와 현재를 비교합니다.',
  problemSolving: '주어진 문제 상황을 설명하고 대안을 제시합니다.',
  roleplayCall: '전화·대화 상황을 연기하며 필요한 정보를 묻습니다.',
  askQuestions: '상대에게 3~4개의 질문을 합니다.',
  issue: '사회적 변화나 이슈에 대한 의견을 근거와 함께 말합니다.',
};

export function GuidePage() {
  const sourceOf = (id: string) => examInfo.sources.find((s) => s.id === id);
  return (
    <div className="narrow">
      <PageHeader title="시험 안내" subtitle="이 모의고사의 진행 방식과, 공식 정보·수험 자료·자체 설정의 구분" back={{ label: '홈', href: '/' }} />

      <section className="card">
        <h2>이 서비스에 대하여</h2>
        <p>
          ‘OPIc 실전형 모의고사’는 OPIc 시험 준비를 돕기 위한 <b>독립적인 연습 서비스</b>입니다. 공식 시행 기관(ACTFL, 국내 시행사)과 관련이 없으며,
          공식 로고·화면 디자인·문제은행을 사용하지 않습니다. 모든 질문은 실제 시험에 나오는 <i>유형</i>을 참고해 독자적으로 작성했고, 실제 출제 문항이 아닙니다.
        </p>
      </section>

      <section className="card">
        <h2>진행 순서</h2>
        <ol className="flow-list">
          <li><b>Background Survey</b> — 직업·학업·거주·여가·취미·운동·휴가를 단계별로 선택합니다.</li>
          <li><b>난이도 선택 (Self-Assessment)</b> — 1~6단계 중 자신의 수준을 고릅니다.</li>
          <li><b>시험 안내·장치 확인</b> — 설정 확인, 마이크·음성 테스트.</li>
          <li><b>본 시험</b> — 음성 질문 → 답변 녹음 → 다음 문제. 7번 문항 뒤 난이도 재조정.</li>
          <li><b>결과</b> — 녹음 재생, 전사, 자동 지표, (선택) AI 피드백, 이전 시험과 비교.</li>
        </ol>
      </section>

      <section className="card">
        <h2>정보 출처 구분</h2>
        <p className="small muted">
          확인일 {examInfo.checkedAt}. 공식 사이트(opic.or.kr)는 개발 환경에서 직접 열람하지 못해, 공개 영문 자료와 국내 수험 자료로 교차 확인했습니다. 응시 전 최신 공식 안내를 반드시 확인하세요.
        </p>
        <div className="table-wrap">
          <table className="facts">
            <thead><tr><th>항목</th><th>내용</th><th>구분</th></tr></thead>
            <tbody>
              {examInfo.facts.map((f) => {
                const src = sourceOf(f.source);
                return (
                  <tr key={f.topic}>
                    <td>{f.topic}</td>
                    <td>
                      {f.statement}
                      {src && (
                        <div className="small muted">
                          출처: {src.url ? <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a> : src.label}
                        </div>
                      )}
                    </td>
                    <td><StatusBadge status={f.status as Status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>모의고사 출제 유형</h2>
        <p className="small muted">아래 유형은 모의고사에서 활용하는 출제 유형이며, 공식 시험의 고정된 문제 순서를 뜻하지 않습니다.</p>
        <dl className="type-list">
          {practiceTypes.map((t) => (
            <div key={t}>
              <dt>{questionTypeLabels[t]}</dt>
              <dd>{typeDescriptions[t]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2>개인정보와 데이터</h2>
        <ul className="plain-list">
          <li>녹음 파일은 이 브라우저의 IndexedDB에만 저장되며 서버로 전송되지 않습니다.</li>
          <li>브라우저 음성 인식(선택)을 켜면, 브라우저 제조사의 서버로 음성이 전송될 수 있습니다.</li>
          <li>AI 평가(선택)를 요청하면 동의 후 <b>답변 텍스트만</b> 평가 서버를 거쳐 Anthropic API로 전송됩니다. 서버는 내용을 저장하지 않습니다.</li>
          <li>기록은 학습 기록 화면에서 개별 또는 전체 삭제할 수 있습니다. 다른 기기와 동기화되지 않습니다.</li>
        </ul>
      </section>
    </div>
  );
}
