import {
  dateLabel,
  escapeHtml,
  evidence,
  examTotal,
  icon,
  last,
  num,
  phoneLayout,
  sameGroup,
  scoreValue,
  state,
  target,
  tasks,
} from '../core.js';
import { chart, rangeSelect, stability } from '../charts.js';
import {
  disclosure,
  examComparison,
  mobilePageHeading,
  overviewStats,
  paperLossComparison,
  priorityCard,
  sectionHead as head,
  selector as examSelector,
  subjectTable,
  targetComparison,
} from './shared.js';

export function overviewView(exams, exam, previous) {
  if (phoneLayout()) return mobileOverview(exams, exam);
  return `<div class="section-head overview-controls">${examSelector(exams, exam)}</div>` + overviewStats(exam, previous) +
    `${overviewSpotlight(exam)}<div class="dashboard-grid">${trendCard(exams, exam)}${priorityCard(exam, previous)}</div>` +
    analysisCard(exams, exam) +
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
    <section class="ios-group" aria-label="本场考试成绩">
      <div class="phone-exam-picker">${examSelector(exams, exam, true)}</div>
      <button class="phone-score" data-action="score-detail" aria-haspopup="dialog" aria-controls="score-dialog">
        <span><span class="phone-score-label">${total?.partialMock ? '已录小计' : '本场总分'}</span><strong>${scoreValue(total)}</strong>${total ? ` <small>/ ${num(total.max)} 分</small>` : ''}</span>
        <span class="ios-row-end">科目明细 <span class="row-chevron" aria-hidden="true">›</span></span>
      </button>
      <div class="phone-ranks">${rank('class', '班级排名')}${rank('grade', '年级排名')}</div>
    </section>
    <div class="phone-links ios-group" aria-label="考试操作">
      <button class="ios-row" data-view="analysis"><span>成绩分析</span><span class="ios-row-end">趋势、目标与失分 <span class="row-chevron" aria-hidden="true">›</span></span></button>
      <button class="ios-row" data-review="${escapeHtml(exam.id)}"><span>复盘本场</span><span class="ios-row-end">题目与错因 <span class="row-chevron" aria-hidden="true">›</span></span></button>
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
  return `<article class="spotlight"><div><span class="subpage-label">${icon('target')}考后复盘</span><h3>${escapeHtml(exam.name)}</h3><p>${items.length ? `已记录 ${items.length} 道题的复盘证据` : '选几道值得回看的题，记录扣分和错因'}${taskCount ? ` · ${taskCount} 项行动待复测` : ''}</p></div><div class="inline-actions"><button class="link action-link" data-action="show-analysis">${icon('chart')}成绩对照</button><button class="link action-link" data-review="${exam.id}">${icon('refresh')}复盘本场</button></div></article>`;
}

export function trendCard(exams, exam) {
  const compact = phoneLayout();
  const metrics = [['grade', '年级排名', '年级'], ['class', '班级排名', '班级'], ['total', '总分得分率', '总分率']];
  const tabs = `<div class="segments" role="group" aria-label="趋势指标">${metrics.map(([key, label, shortLabel]) => `<button data-metric="${key}" aria-label="${label}" aria-pressed="${state.metric === key}">${compact ? shortLabel : label}</button>`).join('')}</div>`;
  const kind = state.metric;
  let values;
  let unit;
  let lowerBetter;
  let note;
  if (kind === 'total') {
    const signature = examTotal(exam)?.signature;
    values = exams.map((record) => {
      const total = examTotal(record);
      return signature && total?.signature === signature && sameGroup(exam, record) ? (100 * total.score) / total.max : null;
    });
    unit = '%';
    lowerBetter = false;
    note = '只对比计分口径相同的场次。模拟中考录齐后纳入总分趋势。';
  } else {
    const ranked = exams.filter((record) => record[`${kind}Rank`] && sameGroup(exam, record));
    const counts = new Set(ranked.map((record) => record[`${kind}Count`]).filter(Boolean));
    const useShare = counts.size > 1;
    values = exams.map((record) => {
      const rank = record[`${kind}Rank`];
      const count = record[`${kind}Count`];
      if (!rank || !sameGroup(exam, record) || (useShare && !count)) return null;
      return useShare ? (100 * rank) / count : rank;
    });
    unit = useShare ? '%' : '名';
    lowerBetter = true;
    note = useShare ? '同范围参考人数有变化，改用名次 ÷ 参考人数。占比越小越靠前。' : '折线越高，名次越靠前。参考范围不同的场次留空。';
  }
  const tools = `<div class="chart-tools">${tabs}${rangeSelect(exams)}</div>`;
  const heading = compact ? tools : `<div class="card-heading chart-heading"><div><h3>${icon('rise')}历次考试趋势</h3><p>共 ${exams.length} 场考试 · 点击节点查看该场</p></div>${tools}</div>`;
  return `<article class="card trend-card">${heading}${chart(exams, values, exam.id, unit, lowerBetter)}${stability(values, exams.indexOf(exam), lowerBetter)}${kind === 'grade' ? targetStability(exams, exam) : ''}<p class="plot-note">${note}</p></article>`;
}

function targetStability(exams, exam) {
  const stageTarget = target();
  if (!stageTarget || !exam.gradeCount || !exam.scope) return '';
  const recent = exams.slice(0, exams.indexOf(exam) + 1)
    .filter((record) => sameGroup(exam, record) && record.gradeCount === exam.gradeCount && record.gradeRank).slice(-5);
  if (recent.length < 2) return '';
  const ranks = recent.map((record) => record.gradeRank).sort((a, b) => a - b);
  const meets = ranks.filter((rank) => rank <= stageTarget).length;
  const center = (ranks[Math.floor((ranks.length - 1) / 2)] + ranks[Math.ceil((ranks.length - 1) / 2)]) / 2;
  return `<p class="stability"><span class="badge brand">排名稳定性</span> 同范围近 ${ranks.length} 场有 <strong>${meets} 场达到前 ${num(stageTarget)} 名</strong> · 名次 ${num(ranks[0])}–${num(last(ranks))} · 中位 ${num(center)}</p>`;
}

export function analysisCard(exams, exam) {
  const tabs = { recent: '近 5 场', targets: '目标对照', losses: '卷面失分' };
  return `<article class="card analysis-card" id="analysis-card"><div class="card-heading"><div><h3>${icon('book')}成绩对照</h3>${phoneLayout() ? '' : '<p>看各科表现，再选择值得复盘的题目。</p>'}</div><span class="badge brand">${dateLabel(exam.date)} 截至本场</span></div>
    <div class="analysis-tabs" role="group" aria-label="成绩对照方式">${Object.entries(tabs).map(([id, label]) => `<button data-analysis-tab="${id}" aria-pressed="${state.analysisTab === id}">${label}</button>`).join('')}</div>
    <div class="analysis-panel">${state.analysisTab === 'targets' ? targetComparison(exam) : state.analysisTab === 'losses' ? paperLossComparison(exam) : examComparison(exams, exam)}</div></article>`;
}

export function analysisView(exams, exam, previous) {
  const sections = [['comparison', '成绩对照'], ['trend', '历次趋势'], ['current', '本场分析']];
  let panel;
  if (state.analysisSection === 'trend') {
    panel = trendCard(exams, exam);
  } else if (state.analysisSection === 'current') {
    panel = `<div class="ios-group">
      ${disclosure('ranks', '本场排名与阶段目标', overviewStats(exam, previous))}
      ${disclosure('targets', '目标对照', targetComparison(exam))}
      ${disclosure('losses', '卷面失分', paperLossComparison(exam))}
      ${disclosure('priority', '本次复盘重点', priorityCard(exam, previous))}
      ${disclosure('scores', '各科成绩明细', subjectTable(exam, previous))}
    </div>`;
  } else {
    panel = `<article class="card">${examComparison(exams, exam)}</article>`;
  }
  return `<div class="phone-analysis"><header class="compact-page-head">
    <div class="compact-page-head-row"><h2>成绩分析</h2><button class="link" type="button" data-view="overview" aria-label="返回学习总览"><span aria-hidden="true">‹</span>学习总览</button></div>
    ${examSelector(exams, exam, true)}
    </header>
    <div class="analysis-tabs" role="group" aria-label="成绩分析栏目">
      ${sections.map(([id, label]) => `<button type="button" data-analysis-section="${id}" aria-pressed="${state.analysisSection === id}">${label}</button>`).join('')}
    </div>
    <div class="analysis-section">${panel}</div></div>`;
}
