import {
  escapeHtml,
  evidence,
  examKinds,
  examScopes,
  icon,
  newestFirst,
  num,
  percent,
  phoneLayout,
  ratio,
  retestTypes,
  state,
  subjectName,
  subjects,
  tasks,
} from '../core.js';
import { chart, rangeSelect } from '../charts.js';
import { disclosure, mobilePageHeading, pageChoice, sectionHead, selector } from './shared.js';

export function subjectView(exams, exam) {
  const subject = subjects().find((item) => item.id === state.subject) || subjects()[0];
  const entry = exam.scores[subject.id];
  const pool = exams.filter((record) => record.id === exam.id
    || ((!state.subjectKindFilter || record.kind === state.subjectKindFilter)
      && (!state.subjectScopeFilter || record.scope === state.subjectScopeFilter)));
  const values = pool.map((record) => ratio(record.scores[subject.id]));
  const trendOpen = document.querySelector('.ability-trend-details')?.open;
  const pick = pageChoice('subject-select', '选择学科', subjects().map((item) => [item.id, item.name + (item.optional ? ' · 单独观察' : '')]), subject.id, 'subject-select');
  const filters = `<div class="filter-bar ability-filters">${pageChoice('subject-kind-filter', '考试类型', [['', '全部类型'], ...Object.entries(examKinds())], state.subjectKindFilter)}${pageChoice('subject-scope-filter', '参考范围', [['', '全部范围'], ...Object.entries(examScopes())], state.subjectScopeFilter)}${rangeSelect(pool)}</div>`;
  const pickers = `<div class="filter-bar ability-pickers">${pick}${selector(exams, exam, phoneLayout())}</div>`;
  const back = `<button class="link ability-back" type="button" data-action="show-analysis">‹ 成绩分析</button>`;
  const heading = phoneLayout()
    ? mobilePageHeading('能力分析', back, pickers)
    : sectionHead('能力分析', '从考试题目找复习重点，用复测观察练习后的表现。', `<div class="filter-bar ability-pickers">${back}${pick}${selector(exams, exam)}</div>`);
  const trend = `<div class="analysis-toolbar"><p>${escapeHtml(exam.name)} · ${entry ? `${num(entry.score)} / ${num(entry.max)} 分，得分率 ${percent(ratio(entry))}` : '未录入该科成绩'}</p>${filters}</div>
    ${chart(pool, values, exam.id, '%', false)}<p class="plot-note">不同考试难度可能不同，请结合试卷判断。${entry ? `复盘参考：${subject.action}` : ''}</p>`;
  if (phoneLayout()) {
    return heading + abilityMatrix(exams, exam) + `<div class="ios-group phone-links">
      ${disclosure('ability-retests', '练习与复测', abilityRetests())}${disclosure('ability-trend', `${subject.name}得分率趋势`, trend)}</div>`;
  }
  return heading + abilityMatrix(exams, exam) + abilityRetests() +
    `<details class="card overview-collapsible ability-trend-details" ${trendOpen ? 'open' : ''}><summary>查看${subject.name}得分率趋势</summary>${trend}</details>`;
}

export function abilityLabel(item) {
  return item[state.abilityGroup]?.normalize('NFKC').trim() || (state.abilityGroup === 'topic' ? '知识点待补充' : '技能待补充');
}

function abilityMatrix(exams, exam) {
  const recent = newestFirst(exams.slice(Math.max(0, exams.indexOf(exam) - 4), exams.indexOf(exam) + 1));
  const items = evidence().filter((item) => item.subject === state.subject && recent.some((record) => record.id === item.examId));
  const groups = new Map();
  for (const item of items) {
    const label = abilityLabel(item);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  const rows = [...groups].map(([label, questions]) => ({
    label,
    questions,
    lossExams: new Set(questions.filter((item) => item[state.abilityGroup]?.trim() && item.score < item.max).map((item) => item.examId)).size,
  })).sort((a, b) => b.lossExams - a.lossExams);
  const rowLabel = (row) => `<strong>${escapeHtml(row.label)}</strong>${row.lossExams > 0 ? `<span class="badge ${row.lossExams > 1 ? 'down' : ''}">${row.lossExams} 场记录到失分</span>` : ''}`;
  const cell = (row, record) => {
    const questions = row.questions.filter((item) => item.examId === record.id);
    if (!questions.length) return '<span class="ability-missing">未记录</span>';
    const score = questions.reduce((sum, item) => sum + item.score, 0);
    const max = questions.reduce((sum, item) => sum + item.max, 0);
    return `<button class="ability-cell ${score < max ? 'loss' : ''}" data-ability-exam="${escapeHtml(record.id)}" data-ability-label="${escapeHtml(row.label)}" aria-label="查看${escapeHtml(record.name)}的${escapeHtml(row.label)}题目"><strong>${num(score)} / ${num(max)} 分</strong><small><span>${questions.length} 题</span> <span>查看题目</span></small></button>`;
  };
  const repeated = rows.filter((row) => row.lossExams > 1).length;
  const sourceCount = new Set(items.map((item) => item.examId)).size;
  return `<article class="card matrix"><div class="card-heading ability-heading"><div><h3>${icon('book')}${subjectName(state.subject)} · 题目表现</h3><p>截至 ${exam.date} · 近 ${recent.length} 场考试</p></div>${pageChoice('ability-group', '分组方式', [['topic', '按知识点'], ['skill', '按技能']], state.abilityGroup)}</div>
    <div class="ability-meta"><p class="ability-summary">已录 <b>${items.length}</b> 题${sourceCount ? ` · 来自 <b>${sourceCount}</b> 场` : ''}${repeated ? ` · <b>${repeated}</b> 项多场失分` : ''}</p><p class="ability-legend"><span><i class="legend-dot loss" aria-hidden="true"></i>有失分</span><span><i class="legend-dot ok" aria-hidden="true"></i>满分</span></p></div>
    ${rows.length ? `<div class="table-wrap ability-desktop"><table class="ability-table"><thead><tr><th scope="col">${state.abilityGroup === 'topic' ? '知识点' : '技能'}</th>${recent.map((record) => `<th scope="col" class="${record.id === exam.id ? 'current-column' : ''}"><strong>${escapeHtml(record.name)}</strong><small>${String(record.date).slice(5).replace('-', '/')}</small></th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr><th scope="row">${rowLabel(row)}</th>${recent.map((record) => `<td>${cell(row, record)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="ability-mobile ios-group">${rows.map((row) => `<details class="ios-disclosure"><summary><span class="disclosure-label"><span class="ability-topic-label">${rowLabel(row)}</span><span class="row-chevron" aria-hidden="true">›</span></span></summary><div class="ability-topic-rows">${recent.map((record) => `<div class="ability-mobile-row"><span>${escapeHtml(record.name)} <small class="faint">${String(record.date).slice(5).replace('-', '/')}</small></span>${cell(row, record)}</div>`).join('')}</div></details>`).join('')}</div>` : '<div class="empty"><strong>这几场还没有该科的题目记录</strong><p>可以先记录几道有代表性的题，包括做对和失分的题。</p></div>'}
    <button class="link action-link" data-review="${escapeHtml(exam.id)}" data-review-subject="${state.subject}">${icon('refresh')}复盘本场${subjectName(state.subject)}</button></article>`;
}

function abilityRetests() {
  const items = new Map(evidence().filter((item) => item.subject === state.subject).map((item) => [item.id, item]));
  const linked = tasks().filter((task) => items.has(task.evidenceId));
  const date = (result) => result?.date || '';
  const ordered = [...linked].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  return `<article class="card ability-retests"><div class="card-heading"><div><h3>${icon('target')}练习与复测</h3><p>${subjectName(state.subject)}累计记录 · 待复测优先</p></div><button class="link action-link" data-view="week">${icon('list')}全部练习</button></div>
    ${ordered.length ? `<div class="evidence-list">${ordered.map((task) => {
      const item = items.get(task.evidenceId);
      const result = task.result;
      const dateText = date(result);
      return `<section class="evidence-item"><div class="item-top"><strong>${escapeHtml(task.title)}</strong><span class="badge ${result ? 'up' : 'brand'}">${result ? `${result.correct} / ${result.total} 题正确` : '待复测'}</span></div><p>${[item.topic, item.skill].filter(Boolean).map(escapeHtml).join(' · ')}${result ? ` · ${retestTypes()[result.questionSet] || '题目来源未注明'} · ${result.hints ? '使用提示' : '独立完成'}` : ''}</p>${dateText ? `<p>${result.date ? '复测日期' : '记录日期'} ${dateText}</p>` : ''}${result?.note ? `<p>${escapeHtml(result.note)}</p>` : ''}<button class="link" data-retest="${escapeHtml(task.id)}">${result ? '编辑复测' : '记录复测'} ${icon('right')}</button></section>`;
    }).join('')}</div>` : '<div class="empty">从一道题的复盘安排练习，复测后可在这里回看结果。</div>'}</article>`;
}

export { subjectName };
