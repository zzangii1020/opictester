import { useHashRoute } from './hooks/useHashRoute';
import { AppStoreProvider } from './state/AppStore';
import { HomePage } from './pages/HomePage';
import { SurveyWizard } from './pages/SurveyWizard';
import { DifficultySelector } from './pages/DifficultySelector';
import { ExamInstructions } from './pages/ExamInstructions';
import { ExamSession } from './pages/ExamSession';
import { ExamResults } from './pages/ExamResults';
import { ProgressHistory } from './pages/ProgressHistory';
import { SurprisePractice } from './pages/SurprisePractice';
import { GuidePage } from './pages/GuidePage';

function Routes() {
  const { path, params } = useHashRoute();
  const flow = params.get('flow') === 'exam';

  if (path === '/exam') return <ExamSession />;

  let page;
  if (path === '/survey') page = <SurveyWizard key={`survey-${flow}`} flow={flow} />;
  else if (path === '/difficulty') page = <DifficultySelector flow={flow} />;
  else if (path === '/exam/setup') page = <ExamInstructions />;
  else if (path.startsWith('/results/')) page = <ExamResults id={decodeURIComponent(path.slice('/results/'.length))} />;
  else if (path === '/history') page = <ProgressHistory />;
  else if (path === '/practice') page = <SurprisePractice key={params.get('type') ?? 'any'} initialType={params.get('type')} />;
  else if (path === '/guide') page = <GuidePage />;
  else page = <HomePage />;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">🎙</span>
          <span>OPIc 실전형 모의고사</span>
        </a>
        <nav className="topnav" aria-label="주 메뉴">
          <a href="#/practice" className={path === '/practice' ? 'active' : ''}>돌발 훈련</a>
          <a href="#/history" className={path === '/history' ? 'active' : ''}>학습 기록</a>
          <a href="#/guide" className={path === '/guide' ? 'active' : ''}>시험 안내</a>
        </nav>
      </header>
      <main className="container">{page}</main>
      <footer className="footer">
        공식 OPIc 시험과 무관한 독립 연습 서비스입니다 · AI 평가는 학습용 추정치이며 공식 성적이 아닙니다 · 기록은 이 브라우저에만 저장됩니다
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppStoreProvider>
      <Routes />
    </AppStoreProvider>
  );
}
