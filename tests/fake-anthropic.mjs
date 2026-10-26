// Minimal stand-in for the Anthropic Messages API, used only by the E2E test so the
// evaluation pipeline can be exercised without a real API key. Records the last request.
import { createServer } from 'node:http';

export function startFakeAnthropic(port) {
  const state = { lastRequest: null, lastHeaders: null };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    state.lastRequest = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    state.lastHeaders = req.headers;
    const answers = JSON.parse(state.lastRequest.messages[0].content.split('\n\n')[1]).answers;
    const body = {
      estimatedLevel: 'IM2',
      summary: '테스트용 가짜 응답입니다.',
      criteria: ['relevance', 'organization', 'detail', 'tense', 'grammar', 'vocabulary', 'naturalness', 'fluency', 'length']
        .map((key, i) => ({ key, score: key === 'fluency' ? 0 : (i % 5) + 1, comment: `${key} 코멘트`, tip: `${key} 팁` })),
      perQuestion: answers.map((a) => ({
        questionId: a.questionId,
        relevance: '질문에 맞게 답했습니다.',
        grammarErrors: [{ original: 'I goed', correction: 'I went', explanation: '불규칙 과거형' }],
        awkwardExpressions: [{ original: 'very much like', better: 'really like', explanation: '어순' }],
        improvedAnswer: 'I really enjoy going to the park near my home.',
      })),
      actionItems: ['과거 시제 점검', '연결어 사용'],
      fluencyBasis: '직접 입력된 텍스트라 유창성은 평가하지 않았습니다.',
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_fake', type: 'message', role: 'assistant', model: state.lastRequest.model,
      content: [{ type: 'text', text: JSON.stringify(body) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
  server.listen(port);
  return { state, close: () => server.close() };
}
