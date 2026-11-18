import {
  escapeHtml,
  evidence,
  examTotal,
  icon,
  num,
  phoneLayout,
  scoreValue,
  state,
  tasks,
} from '../core.js';
import { trendView } from './trend.js';
import {
  disclosure,
  examComparison,
  mobilePageHeading,
  overviewStats,
  paperLossComparison,
  priorityCard,
  selector as examSelector,
  subjectTable,
  targetComparison,
} from './shared.js';

export function overviewView(exams, exam, previous) {
  if (phoneLayout()) return mobileOverview(exams, exam);
  return `<div class="section-head overview-controls">${examSelector(exams, exam)}</div>` + overviewStats(exam, previous) +
    `${overviewSpotlight(exam)}${priorityCard(exam, previous)}` +
    `<button class="link action-link overview-trend-link" data-action="show-trend">${icon('rise')}查看历次趋势 ${icon('right')}</button>` +
    `<details class="score-detail-wrap"><summary>查看本场各科明细</summary>${subjectTable(exam, previous)}</details>`;
}

export function mobileOverview(exams, exam, showHeading = true) {
  const total = examTotal(exam);
  const rank = (kind, label) => {
    const place = exam[`${kind}Rank`];
    const share = rankShare(exam, kind);
    return `<div><span>${label}</span><strong>${place ? `第 ${num(place)} 名` : '未录入'}</strong>${share ? `<small>${share}</small>` : ''}</div>`;
  };
  return `<div class="phone-overview">${showHeading ? mobilePageHeading('学习总览') : ''}
    <div class="context-toolbar">${examSelector(exams, exam, true)}</div>
    <section class="ios-group" aria-label="本场考试成绩">
      <button class="phone-score" data-action="score-detail" aria-haspopup="dialog" aria-controls="score-dialog">
        <span><span class="phone-score-label">${total?.partialMock ? '已录小计' : '本场总分'}</span><strong>${scoreValue(total)}</strong>${total ? ` <small>/ ${num(total.max)} 分</small>` : ''}</span>
        <span class="ios-row-end">科目明细 <span class="row-chevron" aria-hidden="true">›</span></span>
      </button>
      <div class="phone-ranks">${rank('class', '班级排名')}${rank('grade', '年级排名')}</div>
    </section>
    <div class="phone-links ios-group" aria-label="考试操作">
      <button class="ios-row row-action" data-view="analysis"><strong>成绩分析</strong><span class="ios-row-end">趋势与对照 <span class="row-chevron" aria-hidden="true">›</span></span></button>
      <button class="ios-row row-action" data-review="${escapeHtml(exam.id)}"><strong>复盘本场</strong><span class="ios-row-end">题目与错因 <span class="row-chevron" aria-hidden="true">›</span></span></button>
    </div></div>`;
}

function rankShare(exam, kind) {
  const rank = exam[`${kind}Rank`];
  const count = exam[`${kind}Count`];
  if (!Number.isInteger(rank) || !Number.isInteger(count) || rank < 1 || rank > count) return '';
  const share = (100 * rank) / count;
  return share < 0.05 ? '前 0.1% 以内' : `前 ${num(Math.round(share * 10) / 10)}%`;
}

export function overviewSpotlight(exam) {
  const items = evidence().filter((item) => item.examId === exam.id);
  const taskCount = tasks().filter((task) => !task.result).length;
  return `<article class="spotlight"><div><span class="subpage-label">${icon('target')}考后复盘</span><h3>${escapeHtml(exam.name)}</h3><p>${items.length ? `已记录 ${items.length} 道题的复盘证据` : '选几道值得回看的题，记录扣分和错因'}${taskCount ? ` · ${taskCount} 项行动待复测` : ''}</p></div><div class="inline-actions"><button class="link action-link" data-action="show-analysis">${icon('chart')}成绩分析</button><button class="link action-link" data-review="${exam.id}">${icon('refresh')}复盘本场</button></div></article>`;
}

export function analysisView(exams, exam, previous) {
  const sections = [['current', '本场分析'], ['comparison', '成绩对照'], ['trend', '历次趋势']];
  let panel;
  if (state.analysisSection === 'trend') {
    panel = trendView(exams, exam);
  } else if (state.analysisSection === 'comparison') {
    panel = phoneLayout() ? examComparison(exams, exam) : `<article class="card">${examComparison(exams, exam)}</article>`;
  } else {
    panel = `<div class="ios-group">
      ${disclosure('targets', '目标对照', targetComparison(exam))}
      ${disclosure('ranks', '本场排名与目标', overviewStats(exam, previous))}
      ${disclosure('losses', '卷面失分', paperLossComparison(exam))}
      ${disclosure('priority', '本次复盘重点', priorityCard(exam, previous))}
      ${disclosure('scores', '各科成绩明细', subjectTable(exam, previous))}
    </div>`;
  }
  return `<div class="analysis-page"><header class="compact-page-head">
    <div class="compact-page-head-row"><h2>成绩分析</h2><button class="link" type="button" data-view="overview" aria-label="返回学习总览"><span aria-hidden="true">‹</span>学习总览</button></div>
    ${state.analysisSection === 'trend' ? '' : examSelector(exams, exam, true)}
    </header>
    <div class="analysis-tabs" role="group" aria-label="成绩分析栏目">
      ${sections.map(([id, label]) => `<button type="button" data-analysis-section="${id}" aria-pressed="${state.analysisSection === id}">${label}</button>`).join('')}
    </div>
    <div class="analysis-section">${panel}</div></div>`;
}
