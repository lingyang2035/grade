import {
  dateLabel,
  deltaBadge,
  escapeHtml,
  evidence,
  examKinds,
  examMeta,
  examScopes,
  examTotal,
  icon,
  isDemo,
  missingScore,
  newestFirst,
  num,
  paperLoss,
  percent,
  phoneLayout,
  priorities,
  rankDetails,
  ratio,
  scoreStatuses,
  scoreText,
  scoreValue,
  sameGroup,
  selectOptions,
  state,
  subjectChange,
  subjectName,
  subjects,
  target,
  targetRate,
} from '../core.js';

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function pageChoice(id, label, options, selected, selectClass = '', showLabel = false) {
  const current = options.find(([value]) => value === selected) || options[0];
  const optionMarkup = options.map(([value, text, disabled]) =>
    `<option value="${escapeHtml(value)}" ${value === current[0] ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</option>`).join('');
  return `<select id="${id}" class="page-choice-native ${selectClass}" aria-label="${escapeHtml(label)}">${optionMarkup}</select>
    <button class="page-choice-button" type="button" data-page-choice="${id}" aria-label="${escapeHtml(label)}，当前${escapeHtml(current[1])}" aria-haspopup="dialog" aria-controls="exam-picker-sheet" aria-expanded="false">${showLabel ? `<span>${escapeHtml(label)}</span>` : ''}<span class="page-choice-current">${escapeHtml(current[1])}</span></button>`;
}

export function selector(exams, exam, compact = false) {
  const options = newestFirst(exams).map((record) => {
    const full = subjects().every((subject) => record.scores[subject.id]);
    const coverage = full && isDemo() ? ` · ${subjects().length} 科齐全` : '';
    return [record.id, `${record.name} · ${compact ? dateLabel(record.date) : record.date + coverage}`];
  });
  return `<div class="exam-select">${icon('calendar')}<span>查看考试</span>${pageChoice('exam-select', '查看考试', options, exam.id)}</div>`;
}

export function sectionHead(title, description, aside = '') {
  return `<div class="section-head"><div><h2>${title}</h2><p>${description}</p></div>${aside}</div>`;
}

export function mobilePageHeading(title, action = '', below = '') {
  return `<header class="compact-page-head main-page-head"><div class="compact-page-head-row"><h2>${title}</h2>${action}</div>${below}</header>`;
}

export function examSubpageHeading(title, description) {
  return `<header class="compact-page-head">
    <div class="compact-page-head-row"><h2>${title}</h2><button class="link" type="button" data-view="history" aria-label="返回考试记录"><span aria-hidden="true">‹</span>考试记录</button></div>
    <p>${description}</p>
  </header>`;
}

export function disclosure(key, title, html) {
  const opened = document.querySelector(`[data-disclosure="${key}"]`)?.open;
  return `<details class="ios-disclosure" data-disclosure="${key}" ${opened ? 'open' : ''}><summary><span class="disclosure-label"><span>${title}</span><span class="row-chevron" aria-hidden="true">›</span></span></summary><div class="analysis-disclosure-body">${html}</div></details>`;
}

export function stat(title, glyph, color, value, suffix, detail, showBreakdown = false) {
  const body = `<span class="stat-label"><span class="stat-icon ${color}">${icon(glyph)}</span>${title}</span><span class="stat-value"><strong>${value}</strong><small>${suffix}</small></span><span class="stat-detail">${detail}</span>`;
  if (showBreakdown) {
    return `<button class="stat score-trigger" type="button" data-action="score-detail" aria-haspopup="dialog" aria-controls="score-dialog">${body}<span class="score-open-label">查看科目明细 ${icon('right')}</span></button>`;
  }
  return `<article class="stat">${body}</article>`;
}

export function overviewStats(exam, previous) {
  const current = examTotal(exam);
  const prior = examTotal(previous);
  const comparable = current?.signature && current.signature === prior?.signature && sameGroup(exam, previous);
  let scoreChange = '待录入科目成绩';
  if (current?.partialMock) scoreChange = `已录入 ${current.count} / ${subjects().length} 科`;
  else if (comparable) scoreChange = `${deltaBadge(current.score - prior.score, '分')} <span>较上次 · ${current.count} 科</span>`;
  else if (current) scoreChange = `已录入 ${current.count} 科${prior ? ' · 与上次口径不同' : ''}`;
  const stageTarget = target();
  const gap = exam.gradeRank && stageTarget ? Math.max(0, exam.gradeRank - stageTarget) : null;
  const rankValue = (kind) => (exam[`${kind}Rank`] ? `第 ${num(exam[`${kind}Rank`])}` : '—');
  const rankSuffix = (kind) => (!exam[`${kind}Rank`] ? '' : exam[`${kind}Count`] ? `/ ${num(exam[`${kind}Count`])} 人` : '名');
  const targetDetail = stageTarget ? `<span>年级前 ${num(stageTarget)} 名</span>` : '<span>尚未设置目标</span>';
  return `<div class="stats">
      ${stat(current?.partialMock ? '已录小计' : '本场总分', 'score', '', scoreValue(current), current ? `/ ${num(current.max)} 分` : '', scoreChange, true)}
      ${stat('班级排名', 'people', 'green', rankValue('class'), rankSuffix('class'), rankDetails(exam, previous, 'class'))}
      ${stat('年级排名', 'award', 'lilac', rankValue('grade'), rankSuffix('grade'), rankDetails(exam, previous, 'grade'))}
      ${stat('目标差距', 'target', 'amber', gap === null ? '—' : gap === 0 ? '已达标' : num(gap), gap > 0 ? '名' : '', targetDetail)}
    </div>`;
}

export function examComparison(exams, exam) {
  const canFilter = Boolean(exam.kind && exam.scope && exam.scope !== 'other');
  const comparableOnly = state.comparisonFilter === 'same' && canFilter;
  const recent = newestFirst(exams.slice(0, exams.indexOf(exam) + 1).filter((record) => !comparableOnly || sameGroup(record, exam)).slice(-5));
  const scoreCell = (record, subjectId) => {
    const entry = record.scores[subjectId];
    return entry
      ? `<button class="comparison-score" data-review="${record.id}" data-review-subject="${subjectId}" aria-label="复盘${escapeHtml(record.name)}的${subjectName(subjectId)}，${num(entry.score)}分，满分${num(entry.max)}分"><strong>${num(entry.score)} / ${num(entry.max)}</strong><small>${percent(ratio(entry))}</small><span class="comparison-meter" aria-hidden="true"><i style="width:${ratio(entry)}%"></i></span></button>`
      : `<span class="faint">${missingScore(record, subjectId)}</span>`;
  };
  const selected = state.comparisonSubject;
  const scope = pageChoice('comparison-filter', '筛选考试', [['all', '全部考试'], ['same', '同类型、同范围', !canFilter]], comparableOnly ? 'same' : 'all');
  const toolbar = phoneLayout()
    ? `<div class="comparison-toolbar">${scope}${pageChoice('comparison-subject', '查看学科', subjects().map((subject) => [subject.id, subject.name]), selected)}<span class="comparison-count">${recent.length} 场</span></div>`
    : `<div class="analysis-toolbar"><p><strong>对照近 ${recent.length} 场的各科成绩</strong> · ${recent.length === 1 ? '当前只有 1 场记录' : '每场保留实际满分'}</p><div class="analysis-filter"><span>筛选</span>${scope}</div></div>`;
  return `${toolbar}
    <div class="comparison-desktop table-wrap"><table class="comparison-table"><thead><tr><th scope="col">学科</th>${recent.map((record) => `<th scope="col" class="${record.id === exam.id ? 'selected-exam' : ''}"><strong>${escapeHtml(record.name)}</strong><small>${record.date}${record.id === exam.id ? ' · 当前' : ''}</small><small>${examMeta(record)}</small></th>`).join('')}</tr></thead><tbody>${subjects().map((subject) => `<tr><th scope="row"><button class="subject-name" data-subject="${subject.id}">${subject.name}</button></th>${recent.map((record) => `<td class="${record.id === exam.id ? 'selected-exam' : ''}">${scoreCell(record, subject.id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="comparison-mobile"><div class="comparison-list">${recent.map((record) => {
      const entry = record.scores[selected];
      return `<article class="comparison-item ${record.id === exam.id ? 'selected-exam' : ''}"><div class="item-top"><div><h4>${escapeHtml(record.name)}</h4><p class="evidence-meta">${record.date}${record.id === exam.id ? ' · 当前' : ''}<br>${examMeta(record)}</p></div><div class="comparison-number">${entry ? `<strong>${num(entry.score)} <small>/ ${num(entry.max)}</small></strong><small>得分率 ${percent(ratio(entry))}</small>` : `<span class="badge">${missingScore(record, selected)}</span>`}</div></div>${entry ? `<div class="inline-actions"><span class="comparison-meter" aria-hidden="true"><i style="width:${ratio(entry)}%"></i></span><button class="link" data-review="${record.id}" data-review-subject="${selected}">复盘${subjectName(selected)} ${icon('right')}</button></div>` : ''}</article>`;
    }).join('')}</div></div>
    <p class="analysis-note">截至 ${exam.date}，按日期选取最近 ${recent.length} 场。得分率统一了满分尺度，考试内容与难度仍需结合试卷判断。${phoneLayout() ? `点击「复盘${subjectName(selected)}」查看该场题目证据。` : '点击成绩可查看该场题目证据。'}</p>`;
}

export function targetComparison(exam, onlySubject = '') {
  const shown = onlySubject ? subjects().filter((subject) => subject.id === onlySubject) : subjects();
  return `<div class="analysis-toolbar"><p>${escapeHtml(exam.name)} · <span class="target-legend"><i aria-hidden="true"></i>虚线为目标得分率</span>${isDemo() ? ' · 示例目标' : ''}</p></div>
    <div class="target-grid" ${onlySubject ? 'style="grid-template-columns:1fr"' : ''}>${shown.map((subject) => {
      const entry = exam.scores[subject.id];
      const value = ratio(entry);
      const goal = targetRate(subject.id);
      const met = value !== null && goal !== null && value >= goal;
      const gap = value === null ? missingScore(exam, subject.id) : goal === null ? '' : met ? '已达到当前目标' : `距目标 ${num(Math.round((goal - value) * 10) / 10)} 个百分点`;
      const targetLine = entry && goal !== null ? `按本场满分，目标 ${num(Math.round(entry.max * goal) / 100)} 分` : '';
      const gapLine = gap ? (met ? `<span class="badge up">${gap}</span>` : gap) : '';
      const gapMarkup = gapLine || targetLine ? `<p class="target-gap">${gapLine}${gapLine && targetLine ? '<br>' : ''}${targetLine}</p>` : '';
      return `<article class="target-item"><div class="item-top"><button class="subject-name" data-subject="${subject.id}">${subject.name}</button><span class="target-rate">${value === null ? '—' : percent(value)}</span></div><div class="target-meta"><span>${entry ? `${num(entry.score)} / ${num(entry.max)} 分` : missingScore(exam, subject.id)}</span><span>${goal === null ? '未设置目标' : `目标 ${percent(goal)}`}</span></div><div class="target-track" aria-hidden="true">${value === null ? '' : `<span class="target-fill ${met ? 'met' : ''}" style="width:${value}%"></span>`}${goal === null ? '' : `<span class="target-marker" style="left:${goal}%"></span>`}</div>${gapMarkup}</article>`;
    }).join('')}</div>`;
}

export function paperLossComparison(exam) {
  const scored = subjects().filter((subject) => exam.scores[subject.id]).sort((a, b) => paperLoss(exam, b.id) - paperLoss(exam, a.id));
  const missing = subjects().filter((subject) => !exam.scores[subject.id]);
  const total = scored.reduce((sum, subject) => sum + paperLoss(exam, subject.id), 0);
  const largest = scored.length ? paperLoss(exam, scored[0].id) : 0;
  return `<div class="analysis-toolbar"><p>${escapeHtml(exam.name)} · 按失分从多到少排列</p><span class="badge down">${missing.length ? '已录科目' : '本场'}失分 ${num(total)} 分</span></div>
    ${scored.length ? `<div class="paper-loss-list">${scored.map((subject) => {
      const entry = exam.scores[subject.id];
      const loss = paperLoss(exam, subject.id);
      const items = evidence().filter((item) => item.examId === exam.id && item.subject === subject.id);
      const recorded = items.reduce((sum, item) => sum + Math.max(0, item.max - item.score), 0);
      return `<div class="paper-loss-row"><button class="subject-name" data-review="${exam.id}" data-review-subject="${subject.id}">${subject.name}</button><div><span class="paper-loss-meta">${num(entry.score)} / ${num(entry.max)} 分</span><div class="loss-track" aria-hidden="true"><span class="loss-fill" style="width:${largest ? 100 * loss / largest : 0}%"></span></div></div><div class="paper-loss-number"><strong>${num(loss)} <small style="display:inline">分</small></strong><small>得分率 ${percent(ratio(entry))}</small></div><div class="paper-loss-evidence"><small>${items.length ? `题目已记失分 ${num(recorded)} 分${recorded > loss ? ' · 待核对' : ''}` : '尚无题目证据'}</small><button class="link" data-review="${exam.id}" data-review-subject="${subject.id}">${items.length ? '查看证据' : '补充证据'} ${icon('right')}</button></div></div>`;
    }).join('')}</div>` : '<div class="empty">录入各科成绩后显示失分分布。</div>'}
    ${missing.length ? `<p class="field-help">未计入失分统计 · ${missing.map((subject) => `${subject.name}（${missingScore(exam, subject.id)}）`).join('、')}</p>` : ''}
    <p class="analysis-note">卷面失分＝本场满分－得分。模拟中考按合计项目统计，可能包含实验、听说或日常考核。题目已记失分仅来自复盘记录；具体练习重点需结合错因和复测确定。</p>`;
}

export function subjectTable(exam, previous, showLink = true) {
  const focus = new Set(priorities(exam).map((subject) => subject.id));
  return `<article class="card subject-card"><div class="card-heading"><div><h3>${icon('book')}学科表现</h3><p>得分率＝得分 ÷ 满分。所有已录入成绩计入本场总分。</p></div>${showLink ? `<button class="link" data-view="subjects">查看单科趋势 ${icon('right')}</button>` : ''}</div>
    <div class="table-wrap"><table><thead><tr><th scope="col">学科</th><th scope="col">本次得分</th><th scope="col">满分</th><th scope="col">本次得分率</th><th scope="col">较上次得分率</th><th scope="col">复盘标记</th></tr></thead><tbody>
    ${subjects().map((subject) => {
      const entry = exam.scores[subject.id];
      const value = ratio(entry);
      const mark = !entry ? `<span class="badge">${scoreStatuses()[exam.scoreStatuses?.[subject.id]] || '未录入'}</span>` : focus.has(subject.id) ? '<span class="badge down">优先复盘</span>' : '<span class="faint">—</span>';
      const bar = entry ? `<span class="progress"><span class="progress-track" aria-hidden="true"><span class="progress-fill ${focus.has(subject.id) ? 'attention' : ''}" style="width:${value}%"></span></span>${percent(value)}</span>` : '—';
      return `<tr><td><button class="subject-name" data-subject="${subject.id}">${subject.name}</button></td><td>${entry ? num(entry.score) : '—'}</td><td>${entry ? num(entry.max) : '—'}</td><td>${bar}</td><td>${subjectChange(exam, previous, subject.id)}</td><td>${mark}</td></tr>`;
    }).join('')}</tbody></table></div>${exam.note ? `<p class="note"><b>本次复盘笔记</b>　${escapeHtml(exam.note)}</p>` : ''}</article>`;
}

export function priorityCard(exam, previous) {
  const focus = priorities(exam);
  const scoredCore = subjects().filter((subject) => !subject.optional && exam.scores[subject.id]);
  const bestRate = scoredCore.length > 1 ? Math.max(...scoredCore.map((subject) => ratio(exam.scores[subject.id]))) : null;
  const bestSubjects = scoredCore.filter((subject) => ratio(exam.scores[subject.id]) === bestRate).map((subject) => subject.name).join('、');
  return `<article class="card"><div class="card-heading"><div><h3>${icon('target')}本次复盘重点</h3><p>按核心科目得分率，先看最低的两科。</p></div><span class="badge down">按得分率</span></div>
    ${focus.length ? `<div class="priority-list">${focus.map((subject, index) => {
      const value = ratio(exam.scores[subject.id]);
      const prior = ratio(previous?.scores[subject.id]);
      return `<div class="priority"><span class="priority-num">0${index + 1}</span><div><button class="subject-name priority-name" data-subject="${subject.id}">${subject.name}</button>${prior !== null ? ` ${subjectChange(exam, previous, subject.id)}` : ''}<p>${subject.action}</p></div><span class="priority-rate">${percent(value)}</span></div>`;
    }).join('')}</div>` : '<div class="empty">录入核心科目成绩后生成复盘重点。</div>'}
    <div class="priority-footer"><span>结合试卷确认具体错因</span><button class="link" data-view="subjects">查看学科分析 ${icon('right')}</button></div>
    ${bestRate === null ? '' : `<div class="highlight">${icon('award')}本次核心科目最高得分率<b>${bestSubjects} ${percent(bestRate)}</b></div>`}</article>`;
}

export function formChoiceField(name, label, options, selected, placeholder = '', { required = false, attributes = '' } = {}) {
  const value = hasOwn(options, selected) ? options[selected] : null;
  const current = value || placeholder || Object.values(options)[0];
  return `<div class="form-field" ${attributes}><span>${label}</span>
    <select class="form-choice-native" name="${name}" aria-label="${escapeHtml(label)}" ${required ? 'required' : ''}>${selectOptions(options, selected, placeholder)}</select>
    <button class="page-choice-button form-choice-button ${!value && placeholder ? 'is-placeholder' : ''}" type="button" data-form-choice="${name}" aria-label="${escapeHtml(label)}，当前${escapeHtml(current)}" aria-haspopup="dialog" aria-controls="exam-picker-sheet" aria-expanded="false"><span class="page-choice-current">${escapeHtml(current)}</span></button></div>`;
}

export const examPickerLabels = { kind: '考试类型', scope: '参考范围' };

export function examChoiceField(name, options, selected, placeholder) {
  const label = examPickerLabels[name];
  const value = options[selected];
  return `<label class="form-field exam-native-select">${label}<select name="${name}" aria-label="${label}">${selectOptions(options, selected, placeholder)}</select></label>
    <button class="form-field exam-choice-field" type="button" data-exam-picker="${name}" aria-haspopup="dialog" aria-controls="exam-picker-sheet" aria-expanded="false">
      <span class="exam-choice-label">${label}</span><span class="exam-choice-value ${value ? '' : 'is-placeholder'}">${value || placeholder}</span>
    </button>`;
}

export { scoreText, examKinds, examScopes };
