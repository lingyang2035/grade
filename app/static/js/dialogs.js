import {
  addDays,
  cohort,
  currentExam,
  data,
  escapeHtml,
  exams as allExams,
  examKindLabels,
  examKinds,
  examMeta,
  examScopeLabels,
  examScopes,
  icon,
  meta,
  missingScore,
  maxDefaults,
  num,
  percent,
  phoneLayout,
  ratio,
  retestTypes,
  scoreMaxima,
  scoreStatuses,
  scoreText,
  selectOptions,
  state,
  subjects,
  subjectName,
  target,
  targetRate,
  today,
  user,
} from './core.js';
import { examChoiceField, formChoiceField } from './views/shared.js';
import { abilityLabel } from './views/subjects.js';

const panel = (id) => document.querySelector(`#${id}`);
const coreMaxima = (template) => (scoreMaxima()?.[template] || {});
const examDialog = () => panel('exam-dialog');
const examContent = () => panel('exam-form-content');
const detailDialog = () => panel('detail-dialog');
const detailContent = () => panel('detail-form-content');
const scoreDialog = () => panel('score-dialog');
const scoreContent = () => panel('score-dialog-content');
const panelLayer = () => panel('panel-layer');
const examPickerLayer = () => panel('exam-picker-layer');
const examPickerSheet = () => panel('exam-picker-sheet');
const panelBackground = document.querySelectorAll('.top, main, .mobile-nav');

let activePanel = null;
let panelTrigger = null;
let panelScroll = 0;
let panelTouch = null;
let choiceTrigger = null;
let choiceParentScroll = 0;
let fieldRevealFrame = 0;
let toastTimer;

export function announce(message) {
  const toast = panel('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5500);
}

function queueFieldReveal() {
  if (!phoneLayout() || fieldRevealFrame) return;
  fieldRevealFrame = requestAnimationFrame(() => {
    fieldRevealFrame = 0;
    const field = document.activeElement;
    const current = activePanel;
    if (!phoneLayout() || choiceTrigger || !field?.matches('input:not([type="date"]), textarea') || field.readOnly || field.disabled || !(current ? current.contains(field) : field.closest('main'))) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const panelBounds = current?.getBoundingClientRect();
    const upperEdge = panelBounds?.top ?? document.querySelector('.top').getBoundingClientRect().bottom;
    const bottomBar = current ? current.querySelector('.sticky-actions:not([hidden])') : document.querySelector('.mobile-nav');
    const top = Math.max(viewportTop, upperEdge) + 12;
    const bottom = Math.min(viewportBottom, panelBounds?.bottom ?? viewportBottom, bottomBar?.getBoundingClientRect().top ?? viewportBottom) - 12;
    if (bottom <= top) return;
    const bounds = field.getBoundingClientRect();
    const visibleHeight = Math.min(bounds.height, bottom - top);
    const delta = bounds.top < top ? bounds.top - top : Math.max(0, bounds.top + visibleHeight - bottom);
    if (Math.abs(delta) < 1) return;
    if (current) current.scrollTop += delta;
    else window.scrollBy(0, delta);
  });
}

export function updatePanelViewport() {
  const viewport = window.visualViewport;
  if (viewport && activePanel) {
    panelLayer().style.setProperty('--panel-top', `${viewport.offsetTop}px`);
    panelLayer().style.setProperty('--panel-height', `${viewport.height}px`);
    positionExamScopePicker();
  }
  queueFieldReveal();
}

function containPanelTouch(event) {
  const start = panelTouch;
  panelTouch = event.touches.length === 1 ? event.touches[0] : null;
  if (!activePanel || !event.cancelable || !start || !panelTouch) return;
  const targetPanel = choiceTrigger ? examPickerSheet() : activePanel;
  const target = event.target;
  if (!targetPanel.contains(target)) {
    event.preventDefault();
    return;
  }
  const dy = panelTouch.clientY - start.clientY;
  if (!dy || Math.abs(dy) < Math.abs(panelTouch.clientX - start.clientX)) return;
  for (let area = target; area && targetPanel.contains(area); area = area.parentElement) {
    const maxScroll = area.scrollHeight - area.clientHeight;
    if (maxScroll <= 1 || !['auto', 'scroll'].includes(getComputedStyle(area).overflowY)) continue;
    if (dy > 0 ? area.scrollTop > 1 : area.scrollTop < maxScroll - 1) return;
  }
  event.preventDefault();
}

export function showPanel(targetPanel, trigger) {
  if (activePanel) closePanel(activePanel);
  panel('toast').hidden = true;
  const kind = targetPanel.querySelector('form')?.dataset.kind;
  targetPanel.classList.toggle('panel-page', targetPanel === examDialog() || ['evidence', 'plan', 'retest', 'subject-targets', 'admin-user'].includes(kind));
  panelTrigger = trigger || document.activeElement;
  panelScroll = window.scrollY;
  document.body.style.top = `-${panelScroll}px`;
  document.body.classList.add('panel-open');
  targetPanel.querySelectorAll('input[type="number"]').forEach((input) => {
    input.inputMode = input.step && input.step !== '1' ? 'decimal' : 'numeric';
  });
  activePanel = targetPanel;
  panelLayer().hidden = false;
  targetPanel.hidden = false;
  updatePanelViewport();
  targetPanel.scrollTop = 0;
  targetPanel.focus({ preventScroll: true });
  panelBackground.forEach((element) => element.setAttribute('aria-hidden', 'true'));
}

export function closePanel(targetPanel) {
  if (activePanel !== targetPanel) return;
  if (choiceTrigger) {
    if (targetPanel === examPickerSheet()) {
      closeChoice();
      return;
    }
    closeChoice(false);
  }
  if (targetPanel === detailDialog() && targetPanel.dataset.variant === 'temp-password') {
    detailContent().innerHTML = '';
    delete targetPanel.dataset.variant;
  }
  targetPanel.hidden = true;
  panelLayer().hidden = true;
  activePanel = null;
  document.body.classList.remove('panel-open');
  document.body.style.removeProperty('top');
  panelBackground.forEach((element) => element.removeAttribute('aria-hidden'));
  if (panelTrigger?.isConnected) panelTrigger.focus({ preventScroll: true });
  window.scrollTo(0, panelScroll);
  panelTrigger = null;
}

export function closeExam() {
  closePanel(examDialog());
}

export function closeDetail() {
  closePanel(detailDialog());
}

export function closeScore() {
  closePanel(scoreDialog());
}

export function isPanelOpen() {
  return Boolean(activePanel);
}

export function closeActivePanel() {
  if (activePanel) closePanel(activePanel);
}

/* ---------- iOS 选择器 ---------- */

function choiceSelect(trigger) {
  return trigger.dataset.pageChoice
    ? document.getElementById(trigger.dataset.pageChoice)
    : trigger.form?.elements[trigger.dataset.formChoice || trigger.dataset.examPicker];
}

function positionExamScopePicker() {
  if (!choiceTrigger || choiceTrigger.dataset.examPicker !== 'scope') return;
  const bounds = examPickerLayer().getBoundingClientRect();
  const field = choiceTrigger.getBoundingClientRect();
  const menuHeight = examPickerSheet().offsetHeight;
  const below = field.bottom - bounds.top + 6;
  const above = field.top - bounds.top - menuHeight - 6;
  const latestTop = bounds.height - menuHeight - 12;
  const top = below > latestTop && above >= 12 ? above : below;
  examPickerSheet().style.top = `${Math.max(12, Math.min(top, latestTop))}px`;
  examPickerSheet().style.right = `${Math.max(12, bounds.right - field.right)}px`;
}

function pickerOption(option, selectedValue, help = '') {
  const selected = option.value === selectedValue;
  return `<button class="ios-row exam-picker-option" type="button" data-exam-choice="${escapeHtml(option.value)}" aria-pressed="${selected}" ${option.disabled ? 'disabled' : ''}><span>${escapeHtml(option.textContent)}${help}</span>${selected ? icon('check') : ''}</button>`;
}

export function focusPageChoice(id) {
  const control = phoneLayout() ? document.querySelector(`[data-page-choice="${id}"]`) : document.getElementById(id);
  control?.focus({ preventScroll: true });
}

export function openChoice(trigger) {
  if (!phoneLayout() || choiceTrigger || (activePanel && !activePanel.contains(trigger))) return;
  const select = choiceSelect(trigger);
  if (!select) return;
  const parent = activePanel;
  const examField = trigger.dataset.examPicker;
  choiceTrigger = trigger;
  choiceParentScroll = parent?.scrollTop ?? 0;
  trigger.setAttribute('aria-expanded', 'true');
  panel('exam-picker-title').textContent = select.getAttribute('aria-label');
  const options = panel('exam-picker-options');
  options.innerHTML = [...select.options].filter((option) => option.value || (!examField && !select.required)).map((option) => {
    const help = examField === 'kind' && option.value === 'zhongkaoMock' ? '<small>满分默认取中考模板，可修改</small>' : '';
    return pickerOption(option, select.value, help);
  }).join('');
  examPickerSheet().querySelector('.exam-picker-clear').hidden = !examField || !select.value;
  examPickerLayer().dataset.mode = examField || 'bottom';
  examPickerLayer().classList.toggle('over-form', Boolean(parent));
  examPickerLayer().hidden = false;
  if (parent) {
    examPickerSheet().hidden = false;
    examPickerSheet().focus({ preventScroll: true });
    parent.setAttribute('aria-hidden', 'true');
  } else {
    showPanel(examPickerSheet(), trigger);
  }
  positionExamScopePicker();
  options.scrollTop = 0;
  const selected = options.querySelector('[aria-pressed="true"]');
  if (selected) {
    const overflow = selected.getBoundingClientRect().bottom - options.getBoundingClientRect().bottom + 2;
    if (overflow > 0) options.scrollTop = overflow;
  }
}

export function closeChoice(restoreFocus = true) {
  if (!choiceTrigger) return;
  const trigger = choiceTrigger;
  choiceTrigger = null;
  trigger.setAttribute('aria-expanded', 'false');
  examPickerLayer().hidden = true;
  examPickerSheet().hidden = true;
  delete examPickerLayer().dataset.mode;
  examPickerSheet().style.top = '';
  examPickerSheet().style.right = '';
  if (activePanel === examPickerSheet()) {
    closePanel(examPickerSheet());
    return;
  }
  if (!activePanel) return;
  activePanel.removeAttribute('aria-hidden');
  if (restoreFocus && trigger.isConnected && phoneLayout()) trigger.focus({ preventScroll: true });
  activePanel.scrollTop = choiceParentScroll;
}

export function chooseOption(value) {
  const trigger = choiceTrigger;
  if (!trigger) return;
  const select = choiceSelect(trigger);
  const option = [...select.options].find((item) => item.value === value && !item.disabled);
  if (!option) return;
  if (value === select.value) {
    closeChoice();
    return;
  }
  select.value = value;
  if (!trigger.dataset.pageChoice) {
    const label = trigger.querySelector('.page-choice-current, .exam-choice-value');
    label.textContent = option.textContent;
    (trigger.dataset.examPicker ? label : trigger).classList.toggle('is-placeholder', !value);
    trigger.setAttribute('aria-label', `${select.getAttribute('aria-label')}，当前${option.textContent}`);
  }
  closeChoice();
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

export function bindPanelEvents() {
  panelLayer().addEventListener('touchstart', (event) => {
    panelTouch = event.touches.length === 1 ? event.touches[0] : null;
  }, { passive: true });
  panelLayer().addEventListener('touchmove', containPanelTouch, { passive: false });
  panelLayer().addEventListener('click', (event) => {
    if (event.target === examPickerLayer() || (event.target === panelLayer() && activePanel === examPickerSheet())) closeChoice();
  });
  document.addEventListener('focusin', queueFieldReveal);
  examDialog().addEventListener('scroll', positionExamScopePicker);
  examDialog().addEventListener('change', (event) => {
    const form = event.target.form;
    if (form?.id !== 'exam-form') return;
    if (event.target.name === 'kind') changeExamKind(form, event.target.value);
    else if (event.target.name === 'scope') changeExamScope(form, event.target.value);
  });
  examDialog().addEventListener('input', (event) => {
    const field = event.target;
    if (field.name?.endsWith('-max')) {
      const subjectId = field.name.slice(0, -'-max'.length);
      markExamMaxEdited(subjectId);
      field.removeAttribute('data-default-max');
    } else if (field.name === 'classRank' || field.name === 'gradeRank') {
      updateRankHelp();
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updatePanelViewport);
    window.visualViewport.addEventListener('scroll', updatePanelViewport);
  }
  document.addEventListener('keydown', (event) => {
    const keyboardPanel = choiceTrigger ? examPickerSheet() : activePanel;
    if (!keyboardPanel) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (choiceTrigger) closeChoice();
      else closePanel(activePanel);
    }
  });
}

/* ---------- 考试录入 ---------- */

const CORE_SUBJECT_IDS = ['chinese', 'math', 'english', 'physics', 'chemistry'];

let examDraft = null;

function numericField(name, label, value) {
  return `<label class="form-field">${label}<input type="number" min="1" max="100000" step="1" name="${name}" value="${value ?? ''}"></label>`;
}

function examCohort(examId) {
  const original = data().exams.find((exam) => exam.id === examId);
  return {
    classCount: original?.classCount ?? cohort().classCount,
    gradeCount: original?.gradeCount ?? cohort().gradeCount,
  };
}

export function updateExamCohort() {
  const form = document.querySelector('#exam-form');
  if (!form) return;
  const counts = examCohort(form.dataset.id);
  const describe = (count) => (count ? `${num(count)} 人` : '待设置');
  panel('exam-cohort-summary').textContent = `班级 ${describe(counts.classCount)} · 年级 ${describe(counts.gradeCount)}`;
  updateRankHelp();
}

function examValue(subjectId) {
  return examDraft?.values.get(subjectId) || {};
}

function defaultMax(kind, scope, subjectId) {
  const value = maxDefaults(kind, scope)[subjectId];
  return value ?? null;
}

function syncExamDraft() {
  const form = document.querySelector('#exam-form');
  if (!form || !examDraft) return;
  for (const subject of subjects()) {
    const score = form.elements[`${subject.id}-score`];
    const max = form.elements[`${subject.id}-max`];
    const status = form.elements[`${subject.id}-status`];
    if (!score && !max && !status) continue;
    const entry = examValue(subject.id);
    examDraft.values.set(subject.id, {
      ...entry,
      score: score ? score.value : entry.score ?? '',
      max: max ? max.value : entry.max ?? '',
      maxIsDefault: max ? max.hasAttribute('data-default-max') : entry.maxIsDefault ?? false,
      status: status ? status.value : entry.status ?? '',
    });
  }
}

function rankFieldsMarkup() {
  const scope = examDraft.scope;
  const exam = examDraft.exam;
  if (scope === 'external') return '';
  const classField = numericField('classRank', '班级名次', exam?.classRank);
  const gradeField = scope === 'class' ? '' : numericField('gradeRank', '年级名次', exam?.gradeRank);
  return classField + gradeField;
}

function updateRankHelp() {
  const help = panel('exam-rank-help');
  if (!help) return;
  const form = document.querySelector('#exam-form');
  if (!form || examDraft?.scope === 'external') return;
  const counts = examCohort(form.dataset.id);
  const classRank = form.elements.classRank?.value;
  const gradeRank = form.elements.gradeRank?.value;
  const missing = (classRank && !counts.classCount) || (gradeRank && !counts.gradeCount);
  help.textContent = missing
    ? '可记录名次，暂不显示前百分比。'
    : examDraft?.scope === 'class' ? '只记录班级名次。' : '请填校内班级和年级名次。没有公布的排名可以留空。';
}

function kindOptions() {
  const options = { ...examKinds() };
  const legacy = examDraft.exam?.kind;
  if (legacy && !(legacy in options)) options[legacy] = examKindLabels()[legacy] || '旧类型';
  return options;
}

function scopeOptions() {
  const options = { ...examScopes() };
  const legacy = examDraft.exam?.scope;
  if (legacy && !(legacy in options)) options[legacy] = examScopeLabels()[legacy] || '旧范围';
  return options;
}

function subjectChip(subject) {
  const selected = examDraft.selected.has(subject.id);
  return `<button type="button" class="subject-chip${selected ? ' is-selected' : ''}" data-pick-subject="${subject.id}" aria-pressed="${selected}">${subject.name}</button>`;
}

function subjectPickerMarkup() {
  const core = subjects().filter((subject) => CORE_SUBJECT_IDS.includes(subject.id));
  const more = subjects().filter((subject) => !CORE_SUBJECT_IDS.includes(subject.id));
  const anyMore = more.some((subject) => examDraft.selected.has(subject.id));
  return `<div class="subject-picker"><span class="subject-picker-label">本次参加的科目</span>
    <div class="subject-chips">${core.map(subjectChip).join('')}</div>
    <details class="subject-more"${anyMore ? ' open' : ''}><summary>更多科目</summary><div class="subject-chips">${more.map(subjectChip).join('')}</div></details></div>`;
}

function scoreRowsMarkup() {
  const kind = examDraft.kind;
  const scope = examDraft.scope;
  const picker = kind === 'weekly';
  const shown = subjects().filter((subject) => !picker || examDraft.selected.has(subject.id));
  if (!shown.length) {
    return '<p class="field-help">先选择本次参加的科目。只拿到名次时，也可以直接保存。</p>';
  }
  return `<div class="score-row headings" aria-hidden="true"><b>学科</b><b>得分</b><b>满分</b></div>${shown.map((subject) => {
    const entry = examValue(subject.id);
    const fallback = defaultMax(kind, scope, subject.id);
    const maxValue = entry.max !== undefined && entry.max !== '' ? entry.max : fallback ?? '';
    const isDefault = entry.max === undefined || entry.max === '' || entry.maxIsDefault;
    return `<div class="score-row"><strong>${subject.name}${subject.optional ? ' <small class="faint">单独观察</small>' : ''}</strong>
      <label><span class="score-label">得分</span><input type="number" inputmode="decimal" min="0" max="1000" step="0.01" name="${subject.id}-score" aria-label="${subject.name}得分" value="${entry.score ?? ''}"></label>
      <label><span class="score-label">满分</span><input type="number" inputmode="decimal" min="0.01" max="1000" step="0.01" name="${subject.id}-max" aria-label="${subject.name}满分" value="${maxValue}"${isDefault && maxValue !== '' ? ` data-default-max="${escapeHtml(maxValue)}"` : ''}></label></div>`;
  }).join('')}`;
}

function statusFieldsMarkup() {
  const picker = examDraft.kind === 'weekly';
  const shown = subjects().filter((subject) => !picker || examDraft.selected.has(subject.id));
  return shown.map((subject) => formChoiceField(`${subject.id}-status`, subject.name, scoreStatuses(), examValue(subject.id).status || '', '未标记')).join('');
}

function scoreHelpText() {
  const kind = examDraft.kind;
  if (kind === 'zhongkaoMock') return '满分默认取中考模板，可按本次试卷逐科修改；各科满分合计须为 750 分。';
  if (kind === 'weekly' || examDraft.scope === 'external') return '周测和机构测验默认每科 100 分，可按本次试卷修改。未选科目不占满分。';
  return '满分默认取平时模板，可按本次试卷逐科修改。未录科目可留空。';
}

function renderExamPanel(form) {
  updateExamCohort();
  const picker = panel('exam-subject-picker');
  if (picker) picker.innerHTML = examDraft.kind === 'weekly' ? subjectPickerMarkup() : '';
  const help = panel('score-input-help');
  if (help) help.textContent = scoreHelpText();
  const grid = panel('score-grid');
  if (grid) grid.innerHTML = scoreRowsMarkup();
  const statuses = panel('score-status-fields');
  if (statuses) statuses.innerHTML = statusFieldsMarkup();
  if (form) form.elements.kind.value = examDraft.kind;
  if (form) form.elements.scope.value = examDraft.scope;
}

function renderRankFields(form) {
  const holder = panel('exam-rank-fields');
  if (holder) holder.innerHTML = rankFieldsMarkup();
  const org = panel('exam-org-field');
  if (org) {
    org.hidden = examDraft.scope !== 'external';
    org.querySelector('input').disabled = examDraft.scope !== 'external';
  }
  if (form) form.elements.scope.value = examDraft.scope;
  updateRankHelp();
}

export function openExam(exam = null, initialStep = '1') {
  const values = new Map();
  for (const subject of subjects()) {
    const entry = exam?.scores?.[subject.id];
    const status = exam?.scoreStatuses?.[subject.id];
    values.set(subject.id, {
      score: entry ? entry.score : '',
      max: entry ? entry.max : '',
      maxIsDefault: !entry,
      status: status || '',
    });
  }
  examDraft = {
    exam,
    kind: exam?.kind || '',
    scope: exam?.scope || '',
    selected: new Set(exam ? subjects().filter((subject) => exam.scores?.[subject.id] || exam.scoreStatuses?.[subject.id]).map((subject) => subject.id) : []),
    values,
  };
  examContent().innerHTML = `<form id="exam-form" data-id="${exam?.id ?? ''}" data-step="1">
    <div class="dialog-top"><div><h2 id="exam-dialog-title">${exam ? '编辑考试' : '考后录入'}</h2><p>分数和排名可以分开补录。</p></div><button type="button" class="icon-button" data-action="close-exam" aria-label="关闭">${icon('close')}</button></div>
    <div class="steps"><span class="step" data-exam-step="1" aria-current="step">01 考试与排名</span><span class="step" data-exam-step="2">02 学科成绩</span></div>
    <section data-exam-panel="1">
    <div class="form-grid"><label class="form-field">考试日期<input type="date" name="date" min="2000-01-01" max="${today()}" required value="${exam?.date ?? today()}"></label><label class="form-field">考试名称<input name="name" maxlength="45" placeholder="例如 11 月月考" required value="${escapeHtml(exam?.name)}"></label>
    ${examChoiceField('kind', kindOptions(), examDraft.kind, '选择类型')}${examChoiceField('scope', scopeOptions(), examDraft.scope, '选择范围')}
    <span class="field-slot" id="exam-rank-fields"></span>
    </div>
    <p class="field-help" id="exam-rank-help"></p>
    <label class="form-field" id="exam-org-field" hidden>机构名称（可选）<input name="orgName" maxlength="40" placeholder="例如 某某培训" value="${escapeHtml(exam?.orgName)}"></label>
    <div class="exam-cohort"><span id="exam-cohort-summary" aria-live="polite"></span></div></section>
    <section data-exam-panel="2" hidden><div id="exam-subject-picker"></div><p class="field-help" id="score-input-help"></p>
    <div class="score-grid" id="score-grid"></div>
    <details class="score-status"><summary>标记待公布或缺考（可选）</summary><div class="form-grid" id="score-status-fields"></div></details>
    <label class="form-field">复盘笔记（可选）<textarea name="note" rows="2" maxlength="500" placeholder="例如：数学第 20 题漏看条件，本周重做两道同类题。">${escapeHtml(exam?.note)}</textarea></label>
    </section><p class="form-error" id="exam-error" role="alert"></p>
    <div class="form-actions sticky-actions" data-exam-footer="1"><button type="button" class="button" data-action="close-exam">取消</button><button class="button primary" type="button" data-action="exam-next">下一步 ${icon('right')}</button></div>
    <div class="form-actions sticky-actions" data-exam-footer="2" hidden><button type="button" class="button" data-action="exam-back">上一步</button><button class="button primary">保存考试</button></div></form>`;
  const form = document.querySelector('#exam-form');
  renderRankFields(form);
  renderExamPanel(form);
  showPanel(examDialog());
  examDialog().scrollTop = 0;
  if (initialStep !== '1') {
    changeExamStep(form, initialStep);
    requestAnimationFrame(() => {
      examDialog().querySelector('textarea[name="note"]')?.scrollIntoView({ block: 'center' });
    });
  }
}

export function changeExamStep(form, step) {
  if (step === '2') {
    for (const field of form.querySelectorAll('[data-exam-panel="1"] input')) {
      if (!field.reportValidity()) return;
    }
    syncExamDraft();
    renderExamPanel(form);
  }
  form.dataset.step = step;
  form.querySelectorAll('[data-exam-panel], [data-exam-footer]').forEach((element) => {
    element.hidden = (element.dataset.examPanel || element.dataset.examFooter) !== step;
  });
  form.querySelectorAll('[data-exam-step]').forEach((element) => {
    if (element.dataset.examStep === step) element.setAttribute('aria-current', 'step');
    else element.removeAttribute('aria-current');
  });
  panel('exam-error').textContent = '';
  examDialog().scrollTop = 0;
  const stepLabel = form.querySelector('[aria-current="step"]');
  stepLabel.tabIndex = -1;
  stepLabel.focus({ preventScroll: true });
}

function applyDraftDefaults() {
  const form = document.querySelector('#exam-form');
  if (!form) return;
  for (const subject of subjects()) {
    const entry = examDraft.values.get(subject.id);
    if (!entry || !entry.maxIsDefault) continue;
    entry.max = defaultMax(examDraft.kind, examDraft.scope, subject.id) ?? '';
  }
  renderExamPanel(form);
}

export function changeExamKind(form, kind) {
  syncExamDraft();
  examDraft.kind = kind;
  if (kind === 'weekly' && !examDraft.selected.size && examDraft.exam) {
    examDraft.selected = new Set(examDraft.exam ? subjects().filter((subject) => examDraft.exam.scores?.[subject.id] || examDraft.exam.scoreStatuses?.[subject.id]).map((subject) => subject.id) : []);
  }
  applyDraftDefaults();
  renderRankFields(form);
}

export function changeExamScope(form, scope) {
  syncExamDraft();
  examDraft.scope = scope;
  applyDraftDefaults();
  renderRankFields(form);
}

export function toggleExamSubject(subjectId) {
  if (!examDraft || examDraft.kind !== 'weekly') return;
  const subject = subjects().find((item) => item.id === subjectId);
  if (!subject) return;
  syncExamDraft();
  if (examDraft.selected.has(subjectId)) {
    const entry = examDraft.values.get(subjectId);
    const hasInput = entry && (String(entry.score ?? '') !== '' || entry.status || (entry.max !== '' && !entry.maxIsDefault));
    if (hasInput && !window.confirm(`移除${subject.name}会清除本场已填的得分、满分或状态，继续吗？`)) return;
    examDraft.selected.delete(subjectId);
  } else {
    examDraft.selected.add(subjectId);
  }
  renderExamPanel(document.querySelector('#exam-form'));
}

export function markExamMaxEdited(subjectId) {
  const entry = examDraft?.values.get(subjectId);
  if (entry) entry.maxIsDefault = false;
}

/* ---------- 通用面板表单 ---------- */

function showDetail(kind, title, description, fields, context = '', submitLabel = '保存') {
  detailDialog().dataset.variant = '';
  detailContent().innerHTML = `<form id="detail-form" data-kind="${kind}" data-context="${escapeHtml(context)}">
    <div class="dialog-top"><div><h2 id="detail-title">${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    ${fields}<p id="detail-error" class="form-error" role="alert"></p><div class="form-actions${kind === 'evidence' ? ' sticky-actions' : ''}"><button type="button" class="button" data-action="close-detail">取消</button><button class="button primary">${submitLabel}</button></div></form>`;
  showPanel(detailDialog());
  detailDialog().scrollTop = 0;
}

export function openEvidence(item = null) {
  const exam = currentExam();
  if (!exam) return;
  const subjectOptions = Object.fromEntries(subjects().map((subject) => [subject.id, subject.name]));
  showDetail('evidence', item ? '编辑题目证据' : '记录一道题', escapeHtml(exam.name),
    `<div class="form-grid evidence-fields">${formChoiceField('subject', '学科', subjectOptions, item?.subject || state.reviewSubject, '选择学科', { required: true })}
    <label class="form-field">题号<input name="question" maxlength="28" required placeholder="例如 第 23 题" value="${escapeHtml(item?.question)}"></label>
    <label class="form-field">本题得分<input name="score" type="number" min="0" max="100" step="0.01" required value="${item?.score ?? ''}"></label>
    <label class="form-field">本题满分<input name="max" type="number" min="0.01" max="100" step="0.01" required value="${item?.max ?? ''}"></label>
    <label class="form-field evidence-wide">技能<input name="skill" maxlength="35" required placeholder="例如 建模" value="${escapeHtml(item?.skill)}"></label>
    <label class="form-field evidence-wide">知识点（可选）<input name="topic" maxlength="35" placeholder="例如 一次函数" value="${escapeHtml(item?.topic)}"></label>
    <label class="form-field evidence-wide">题型（可选）<input name="questionType" maxlength="24" placeholder="例如 解答题" value="${escapeHtml(item?.questionType)}"></label>
    <label class="form-field evidence-wide">已确认的错因（可选）<textarea name="reason" rows="2" maxlength="250" placeholder="例如：读懂题意，但漏写了变量关系。">${escapeHtml(item?.reason)}</textarea></label></div>`, item?.id);
}

export function openPlan(item = null) {
  showDetail('plan', '安排练习', item ? `${subjectName(item.subject)} · ${escapeHtml(item.skill)} · ${escapeHtml(item.question)}` : '写下一个可以独立验证的小目标。',
    `<div class="form-grid"><label class="form-field">练习目标<input name="title" maxlength="60" required placeholder="例如 独立做 3 道新题" value="${item ? escapeHtml(`复练：${item.skill}`) : ''}"></label><label class="form-field">计划完成日期<input name="due" type="date" required value="${addDays(today(), 3)}"></label>
    <label class="form-field" style="grid-column:1 / -1">具体怎么做（可选）<textarea name="plan" rows="3" maxlength="250" placeholder="例如：先写变量关系，再列式。用三道没做过的题验证。"></textarea></label></div>`, item?.id);
}

export function openRetest(task) {
  const result = task.result;
  showDetail('retest', '记录复测结果', escapeHtml(task.title),
    `<div class="form-grid"><label class="form-field">正确题数<input name="correct" type="number" min="0" max="100" step="1" required value="${result?.correct ?? ''}"></label><label class="form-field">总题数<input name="total" type="number" min="1" max="100" step="1" required value="${result?.total ?? ''}"></label>
    ${formChoiceField('questionSet', '题目来源', retestTypes(), result?.questionSet, '暂不注明')}<label class="form-field">复测日期<input name="date" type="date" max="${today()}" value="${escapeHtml(result?.date ?? (result ? '' : today()))}"></label>
    ${formChoiceField('hints', '完成方式', { no: '独立完成', yes: '使用提示' }, result?.hints ? 'yes' : 'no', '', { attributes: 'style="grid-column:1 / -1"' })}
    <label class="form-field" style="grid-column:1 / -1">这次发现了什么（可选）<textarea name="note" rows="2" maxlength="250">${escapeHtml(result?.note)}</textarea></label></div>`, task.id);
}

export function openProfile() {
  const profile = data().profile;
  showDetail('learning-profile', '学习档案', '填写当前学生的资料，新学期可在这里更新。',
    `<div class="form-grid"><label class="form-field">学生称呼<input name="studentName" maxlength="24" required value="${escapeHtml(profile.studentName)}"></label>${formChoiceField('grade', '年级', Object.fromEntries(meta().grades.map((grade) => [grade, grade])), profile.grade, '暂不填写')}<label class="form-field">班级（可选）<input name="className" maxlength="24" placeholder="例如 2 班" value="${escapeHtml(profile.className)}"></label></div>`);
}

export function openCohort() {
  const counts = cohort();
  showDetail('cohort', '班级和年级人数', '设置一次，录入新考试时自动带入。已保存的人数随原考试记录保留。',
    `<div class="form-grid"><label class="form-field">班级人数<input name="classCount" type="number" min="1" max="100000" step="1" placeholder="例如 42" value="${counts.classCount ?? ''}"></label><label class="form-field">年级人数<input name="gradeCount" type="number" min="1" max="100000" step="1" placeholder="例如 420" value="${counts.gradeCount ?? ''}"></label></div>`);
}

export function openTarget() {
  showDetail('target', '设置阶段目标', '把年级排名拆成可跟踪的小目标。这个名次只用于校内进度跟踪。',
    `<label class="form-field">年级前多少名<input type="number" name="target" min="1" max="100000" step="1" value="${target() ?? ''}"></label>`);
}

export function openSubjectTargets() {
  showDetail('subject-targets', '设置各科目标', '填写当前阶段希望达到的得分率，范围 0–100%。留空可取消该科目标。',
    `<div class="form-grid">${subjects().map((subject) => `<label class="form-field">${subject.name}目标（%）<input type="number" name="${subject.id}" min="0" max="100" step="0.1" placeholder="未设置" value="${targetRate(subject.id) ?? ''}"></label>`).join('')}</div><p class="field-help">保存后，所有考试都与这组当前目标对照。每科的目标分数按该场实际满分换算。</p>`);
}

export function openScoreMaxima(template) {
  const maxima = coreMaxima(template);
  const isMock = template === 'mock';
  const title = isMock ? '设置中考满分' : '设置平时满分';
  showDetail('score-maxima', title, `${isMock ? '中考' : '平时'}考试录入时自动带入这些满分，本场仍可修改。`,
    `<div class="form-grid">${subjects().map((subject) => `<label class="form-field">${subject.name}满分<input type="number" name="${subject.id}" min="0.01" max="1000" step="0.01" placeholder="未设置" value="${maxima[subject.id] ?? ''}"></label>`).join('')}</div><p class="field-help">留空表示该科不预设默认满分。保存后只影响之后录入的新考试，历史考试的满分保持不变。</p>`, template);
}

export function openAccountName() {
  const profile = user();
  showDetail('account-name', '账号资料', profile.mustChangePassword ? '首次登录需先修改密码。' : '',
    `<label class="form-field">称呼<input name="name" required maxlength="24" value="${escapeHtml(profile.name)}"></label>
    <p class="account-username"><span>账号名</span><strong>${escapeHtml(profile.username)}</strong></p>`);
}

export function openAdminAccount(account) {
  const self = account.id === user().id;
  const role = account.isAdmin ? '管理员' : '成员';
  const row = (label, value) => `<div class="info-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
  detailDialog().dataset.variant = '';
  detailContent().innerHTML = `<div class="dialog-top"><div><h2 id="detail-title">${escapeHtml(account.name)}</h2><p>${escapeHtml(role)}</p></div><button type="button" class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    <div class="info-list">
      ${row('账号名', account.username)}
      ${row('所属家庭', account.familyName)}
      ${account.mustChangePassword ? row('密码状态', '首次登录需修改密码') : ''}
      ${account.active ? '' : row('状态', '已停用')}
    </div>
    <div class="ios-group admin-account-actions">
      ${self ? '' : `<button class="ios-row" type="button" data-reset-user="${escapeHtml(account.id)}"><span>重置密码</span><span class="row-chevron" aria-hidden="true">›</span></button>`}
      ${self ? '' : `<button class="ios-row" type="button" data-toggle-user="${escapeHtml(account.id)}"><span>${account.active ? '停用账号' : '启用账号'}</span><span class="row-chevron" aria-hidden="true">›</span></button>`}
      <button class="ios-row" type="button" data-edit-user="${escapeHtml(account.id)}"><span>编辑账号</span><span class="row-chevron" aria-hidden="true">›</span></button>
    </div>
    <div class="form-actions"><button class="button primary" type="button" data-action="close-detail">完成</button></div>`;
  showPanel(detailDialog());
  detailDialog().scrollTop = 0;
}

export async function copyPassword(value) {
  const hint = document.getElementById('copy-hint');
  let copied = false;
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (!copied) {
    // iOS 14 / 微信等环境不支持 Clipboard API 时，退回选中复制。
    try {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
      document.body.appendChild(field);
      field.select();
      field.setSelectionRange(0, field.value.length);
      copied = document.execCommand('copy');
      document.body.removeChild(field);
    } catch {
      copied = false;
    }
  }
  if (hint) hint.textContent = copied ? '已复制' : '请长按密码手动复制';
}

export function openAdminFamily(family = null) {
  const grades = Object.fromEntries(meta().grades.map((grade) => [grade, grade]));
  if (family) {
    showDetail('admin-family', '编辑家庭', '家庭名称用于区分不同家庭。学生档案在「设置」中维护。',
      `<label class="form-field">家庭名称<input name="name" maxlength="40" required value="${escapeHtml(family.name)}" placeholder="例如 张家"></label>`, family.id);
    return;
  }
  showDetail('admin-family', '新增家庭', '创建家庭时填写学生资料；之后学生档案在「设置」中维护。',
    `<div class="form-grid"><label class="form-field">家庭名称<input name="name" maxlength="40" required placeholder="例如 张家"></label><label class="form-field">学生称呼<input name="studentName" maxlength="24" required placeholder="例如 小张"></label>${formChoiceField('grade', '年级', grades, '', '暂不填写')}<label class="form-field">班级（可选）<input name="className" maxlength="24" placeholder="例如 2 班"></label></div>`);
}

export function openAdminUser(account = null) {
  const families = state.boot.admin.families;
  const familyOptions = Object.fromEntries(families.map((family) => [family.id, family.name]));
  const selectedFamily = account?.familyId || families[0]?.id || '';
  showDetail('admin-user', account ? '编辑账号' : '新增账号', '账号权限由「管理员」单独控制。新账号会生成一次性临时密码，首次登录必须修改。',
    `<div class="form-grid"><label class="form-field">账号名<input name="username" maxlength="40" pattern="[A-Za-z0-9_.\\-]+" required value="${escapeHtml(account?.username)}" placeholder="字母、数字、点、横线或下划线"></label><label class="form-field">称呼<input name="name" maxlength="24" required value="${escapeHtml(account?.name)}"></label>${formChoiceField('admin', '管理员权限', { no: '无', yes: '有' }, account?.isAdmin ? 'yes' : 'no')}${formChoiceField('familyId', '所属家庭', familyOptions, selectedFamily, '选择家庭', { required: true, attributes: 'style="grid-column:1/-1"' })}</div>`, account?.id);
}

function formatLogTime(value) {
  return String(value || '').replace('T', ' ').slice(0, 16);
}

export function openLogs(items) {
  detailDialog().dataset.variant = '';
  const showFamily = items.some((item) => item.familyName !== user().familyName);
  detailContent().innerHTML = `<div class="dialog-top"><div><h2 id="detail-title">操作日志</h2><p>考试创建、修改与删除记录。</p></div><button class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    ${items.length ? `<div class="log-list">${items.map((item) => `<article class="log-item"><div class="item-top"><strong>${escapeHtml(item.actionLabel)}</strong><span class="evidence-meta">${escapeHtml(formatLogTime(item.createdAt))}</span></div><p>${escapeHtml(item.summary)}</p><p class="evidence-meta">${escapeHtml(item.actorName)}${showFamily ? ` · ${escapeHtml(item.familyName)}` : ''}${item.detail ? ` · ${escapeHtml(item.detail)}` : ''}</p></article>`).join('')}</div>` : '<div class="empty">还没有操作记录。</div>'}
    <div class="form-actions"><button class="button primary" data-action="close-detail">完成</button></div>`;
  showPanel(detailDialog());
  detailDialog().scrollTop = 0;
}

export function openDeleteExam(exam) {
  if (!exam) return;
  detailDialog().dataset.variant = '';
  detailContent().innerHTML = `<div class="dialog-top"><div><h2 id="detail-title">删除考试</h2><p>${escapeHtml(exam.name)} · ${escapeHtml(exam.date)}</p></div><button class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    <p class="form-error" role="alert" id="detail-error"></p>
    <p class="field-help">删除后，这场考试和已录题目证据将被永久移除，无法恢复；相关练习会保留，但不再关联这场考试。</p>
    <div class="form-actions"><button class="button danger-outline" type="button" data-action="confirm-delete-exam" data-delete-exam="${escapeHtml(exam.id)}">确认删除</button><button class="button primary" type="button" data-action="close-detail">取消</button></div>`;
  showPanel(detailDialog());
  detailDialog().querySelector('.button.primary')?.focus({ preventScroll: true });
  detailDialog().scrollTop = 0;
}

export function openResetConfirm(account) {
  showDetail('admin-reset', '重置密码', `为「${escapeHtml(account.name)}」生成一次性临时密码。旧密码和现有登录会话会立即失效。`, '', account.id, '确认重置');
}

export function openToggleConfirm(account) {
  showDetail('admin-toggle', account.active ? '停用账号' : '启用账号', `${escapeHtml(account.name)} · ${account.active ? '停用后将无法登录，资料保留。' : '启用后该账号可以正常登录。'}`, '', account.id, '确认');
}

export function openTempPassword(password, title = '临时密码') {
  detailDialog().dataset.variant = 'temp-password';
  detailContent().innerHTML = `<div class="dialog-top"><div><h2 id="detail-title">${escapeHtml(title)}</h2><p>请把临时密码单独发送给账号使用人。</p></div><button type="button" class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    <div class="temp-password"><strong>${escapeHtml(password)}</strong><button class="button" type="button" data-action="copy-password">复制密码</button><p class="field-help" id="copy-hint" aria-live="polite">关闭后无法再次查看，首次登录需修改密码。</p></div>
    <div class="form-actions"><button class="button primary" data-action="close-detail">完成</button></div>`;
  showPanel(detailDialog());
}

export function openAbilityQuestions(examId, label) {
  const exam = allExams().find((record) => record.id === examId);
  if (!exam) return;
  const items = data().evidence.filter((item) => item.examId === examId && item.subject === state.subject && abilityLabel(item) === label);
  detailDialog().dataset.variant = '';
  detailContent().innerHTML = `<div class="dialog-top"><div><h2 id="detail-title">${escapeHtml(label)} · 题目明细</h2><p>${escapeHtml(exam.name)} · ${subjectName(state.subject)} · ${items.length} 道已录题目</p></div><button type="button" class="icon-button" data-action="close-detail" aria-label="关闭">${icon('close')}</button></div>
    <div class="evidence-list">${items.map((item) => `<article class="evidence-item"><div class="item-top"><strong>${escapeHtml(item.question)}</strong><span class="badge ${item.score < item.max ? 'down' : 'up'}">${num(item.score)} / ${num(item.max)} 分</span></div><p>${[item.topic, item.skill, item.questionType].filter(Boolean).map(escapeHtml).join(' · ')}</p>${item.reason ? `<p>已记录错因 · ${escapeHtml(item.reason)}</p>` : item.score < item.max ? '<p>错因待确认</p>' : ''}</article>`).join('') || '<div class="empty">这道题没有匹配的已录证据。</div>'}</div>
    <div class="form-actions"><button class="button primary" data-review="${escapeHtml(exam.id)}" data-review-subject="${state.subject}"${items.length ? ` data-review-question="${escapeHtml(items[0].id)}"` : ''}>打开考试复盘 ${icon('right')}</button></div>`;
  showPanel(detailDialog());
  detailDialog().scrollTop = 0;
}

export function openTrendFilter() {
  const rangeOptions = { recent: '近 10 场', all: '全部场次' };
  const rangeSelected = state.trendRange || 'recent';
  const rangeMarkup = `<div class="form-field"><span>场次数</span>
    <select class="form-choice-native" name="range" aria-label="场次数" required>${Object.entries(rangeOptions).map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === rangeSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
    <button class="page-choice-button form-choice-button" type="button" data-form-choice="range" aria-label="场次数，当前${escapeHtml(rangeOptions[rangeSelected])}" aria-haspopup="dialog" aria-controls="exam-picker-sheet" aria-expanded="false"><span class="page-choice-current">${escapeHtml(rangeOptions[rangeSelected])}</span></button></div>`;
  showDetail('trend-filter', '筛选趋势', '修改先作为草稿，应用后更新图表。',
    `<div class="form-grid">
      ${formChoiceField('kind', '考试类型', examKindLabels(), state.trendKind, '全部类型')}
      ${formChoiceField('scope', '参考范围', examScopeLabels(), state.trendScope, '全部范围')}
      ${rangeMarkup}
    </div>`, '', '应用');
}

export function openScoreBreakdown(exam) {
  const total = exam.total;
  const included = total?.included || [];
  const missing = subjects().filter((subject) => !exam.scores[subject.id]);
  const amount = (subject) => {
    const entry = exam.scores[subject.id];
    return entry ? `${num(entry.score)} / ${num(entry.max)} 分` : missingScore(exam, subject.id);
  };
  const rows = (items) => items.map((subject) => `<tr><td>${subject.name}</td><td class="score-amount">${amount(subject)}</td></tr>`).join('');
  const missingGroups = new Map();
  for (const subject of missing) {
    const status = missingScore(exam, subject.id);
    if (!missingGroups.has(status)) missingGroups.set(status, []);
    missingGroups.get(status).push(subject.name);
  }
  const missingText = [...missingGroups].map(([status, names]) => `${status}　${names.join('、')}`).join('；');
  const summary = total ? scoreText(total) : '—';
  const mock = exam.kind === 'zhongkaoMock';
  const breakdownTitle = total?.partialMock ? '已录小计明细' : '本场考试总分明细';
  scoreContent().innerHTML = `<div class="dialog-top"><div><h2 id="score-dialog-title">${breakdownTitle}</h2><p>${escapeHtml(exam.name)} · ${exam.date}${mock ? ` · 中考满分按本场${total?.max != null ? ` ${num(total.max)}` : ''}分核算` : ''}</p></div><button class="icon-button" type="button" data-action="close-score" aria-label="关闭明细">${icon('close')}</button></div>
    <div class="score-summary"><span>${included.length} / ${subjects().length} 科已计入</span><strong>${summary}</strong></div>
    ${included.length ? `<table class="score-breakdown"><thead><tr><th scope="col">计入总分的科目</th><th class="score-amount" scope="col">得分 / 满分</th></tr></thead><tbody>${rows(subjects().filter((subject) => included.includes(subject.id)))}</tbody></table>` : '<p class="score-missing">本场还没有可计入的科目成绩。</p>'}
    ${missing.length ? `<p class="score-missing"><strong>未计入的科目</strong>　${missingText}</p>` : ''}
    <p class="field-help">${mock ? '英语含听说，理化含实验，道法、历史和体育含日常考核。' : '本场总分按已录入科目的得分和满分加总。'}</p>`;
  showPanel(scoreDialog());
  scoreDialog().scrollTop = 0;
}

/* 能力画像放大查看：在 score-dialog 里展示放大版的雷达/热力图。 */
export function openAbilityZoom(title, html) {
  scoreContent().innerHTML = `<div class="dialog-top"><div><h2 id="score-dialog-title">${escapeHtml(title)}</h2><p>点右上角关闭返回</p></div><button class="icon-button" type="button" data-action="close-score" aria-label="关闭放大视图">${icon('close')}</button></div><div class="zoom-body">${html}</div>`;
  showPanel(scoreDialog());
  scoreDialog().scrollTop = 0;
}
