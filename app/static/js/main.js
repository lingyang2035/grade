import { get, post, put, patch, del, setCsrfToken } from './api.js';
import * as core from './core.js';
import * as dialogs from './dialogs.js';
import { analysisView, overviewView } from './views/overview.js';
import { historyView } from './views/history.js';
import { subjectView } from './views/subjects.js';
import { reviewView } from './views/review.js';
import { weekView } from './views/week.js';
import { accountView } from './views/account.js';

const content = document.querySelector('#content');
const modeMenu = document.querySelector('#mode-menu');
const modeButton = document.querySelector('#mode-button');

function showModeMenu(open) {
  modeMenu.hidden = !open;
  modeButton.setAttribute('aria-expanded', String(open));
}

/* Safari 14.0（iOS 14.4 及以下）不支持 flex gap，检测后用 margin 兜底（见 CSS 的 .no-flex-gap 规则）。 */
function checkFlexGap() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;display:flex;flex-direction:column;row-gap:1px';
  probe.append(document.createElement('div'), document.createElement('div'));
  document.body.append(probe);
  document.documentElement.classList.toggle('no-flex-gap', probe.scrollHeight !== 1);
  probe.remove();
}

function goTo(view) {
  if (view === 'analysis') core.state.analysisSection = 'comparison';
  if (view !== 'history') core.state.savedExamId = null;
  core.state.view = view;
  render();
  window.scrollTo(0, 0);
}

function selectExam(id) {
  core.state.selectedId = id;
  if (core.state.view === 'history') goTo('overview');
  else render();
  dialogs.focusPageChoice('exam-select');
}

function render() {
  const boot = core.state.boot;
  if (!boot) return;
  const exams = core.exams();
  const exam = exams.find((record) => record.id === core.state.selectedId) || exams[exams.length - 1] || null;
  const previous = exam ? exams[exams.indexOf(exam) - 1] || null : null;
  core.state.selectedId = exam?.id ?? null;


  const parentView = { review: 'history', analysis: 'overview' };
  const navView = parentView[core.state.view] || core.state.view;
  document.querySelectorAll('.nav [data-view]').forEach((button) => {
    if (button.dataset.view === navView) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  document.querySelector('#mode-label').textContent = core.isDemo() ? '演示数据' : '我的记录';
  document.querySelector('.hero').hidden = core.state.view !== 'overview';
  const stageTarget = core.target();
  document.querySelector('#hero-goal').textContent = stageTarget
    ? `${core.isDemo() ? '示例目标' : '阶段目标'} · 年级前 ${core.num(stageTarget)} 名`
    : '阶段目标 · 尚未设置';
  const name = boot.user.name || '用户';
  document.querySelector('#identity-label').innerHTML = `<span class="avatar" aria-hidden="true">${core.escapeHtml(name.charAt(0))}</span><span>${core.escapeHtml(name)}</span>`;
  modeMenu.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === core.state.mode));
  });

  const dataViews = ['overview', 'history', 'subjects', 'week', 'review', 'analysis'];
  const demoDataView = core.isDemo() && dataViews.includes(core.state.view);
  const banner = document.querySelector('#mode-banner');
  banner.hidden = !demoDataView;
  if (demoDataView) banner.innerHTML = '<b>演示数据只读</b>　示例考试与题目证据不会保存；切回「我的记录」查看本家庭数据。';
  document.querySelector('#footer-note').textContent = demoDataView
    ? '示例成绩 · 只读，不会保存'
    : `记录保存在本家庭的服务端 · ${boot.user.familyName}`;

  if (core.state.view === 'week') { content.innerHTML = weekView(); return; }
  if (core.state.view === 'account') { content.innerHTML = accountView(); return; }
  if (core.state.view === 'history') { content.innerHTML = historyView(exams); return; }
  if (!exam) {
    const titles = { overview: '学习总览', analysis: '成绩分析', history: '考试记录', subjects: '能力分析', review: '考后复盘' };
    const hint = '从最近一次有成绩单的考试开始。';
    const heading = core.phoneLayout() && ['overview', 'subjects'].includes(core.state.view)
      ? `<header class="compact-page-head main-page-head"><div class="compact-page-head-row"><h2>${titles[core.state.view]}</h2></div><p>${hint}</p></header>`
      : `<div class="section-head"><div><h2>${titles[core.state.view]}</h2><p>${hint}</p></div></div>`;
    content.innerHTML = heading + '<article class="card empty"><strong>还没有考试记录</strong><p>录入分数和排名后，这里会展示成绩概况。积累多场记录后可查看趋势。</p><button class="button" data-view="history">查看考试记录</button></article>';
    return;
  }
  if (core.state.view === 'subjects') content.innerHTML = subjectView(exams, exam, previous);
  else if (core.state.view === 'analysis') content.innerHTML = analysisView(exams, exam, previous);
  else if (core.state.view === 'review') content.innerHTML = reviewView(exam);
  else content.innerHTML = overviewView(exams, exam, previous);
}

/* ---------- 表单解析 ---------- */

function numeric(value) {
  if (value === '' || value === null || value === undefined) return null;
  return Number(value);
}

function examCounts(form) {
  const original = core.data().exams.find((exam) => exam.id === form.dataset.id);
  return {
    classCount: original?.classCount ?? core.cohort().classCount,
    gradeCount: original?.gradeCount ?? core.cohort().gradeCount,
  };
}

function parseExam(form) {
  const fields = new FormData(form);
  const name = String(fields.get('name') || '').trim();
  if (!name) throw new Error('请输入考试名称。');
  const date = String(fields.get('date') || '');
  if (!date) throw new Error('请选择考试日期。');
  const kind = String(fields.get('kind') || '');
  if (!kind) throw new Error('请选择考试类型。');
  const scope = String(fields.get('scope') || '');
  if (!scope) throw new Error('请选择参考范围。');
  const counts = examCounts(form);
  const classRank = scope === 'external' ? null : numeric(fields.get('classRank'));
  const gradeRank = scope === 'external' || scope === 'class' ? null : numeric(fields.get('gradeRank'));
  for (const [key, label] of [['class', '班级'], ['grade', '年级']]) {
    const rank = key === 'class' ? classRank : gradeRank;
    const count = counts[`${key}Count`];
    if (rank && count && rank > count) throw new Error(`${label}名次不能大于参考人数。`);
  }
  const payload = {
    name,
    date,
    kind,
    scope,
    orgName: scope === 'external' ? String(fields.get('orgName') || '').trim() : '',
    classRank,
    gradeRank,
    scores: {},
    scoreStatuses: {},
    note: String(fields.get('note') || '').trim(),
  };
  for (const subject of core.subjects()) {
    const maxElement = form.elements[`${subject.id}-max`];
    if (!maxElement) continue;
    const scoreRaw = fields.get(`${subject.id}-score`);
    const maxRaw = fields.get(`${subject.id}-max`);
    const status = String(fields.get(`${subject.id}-status`) || '');
    const scoreEmpty = scoreRaw === '' || scoreRaw === null;
    const maxEmpty = maxRaw === '' || maxRaw === null;
    const atDefault = maxElement.hasAttribute('data-default-max') && maxRaw === maxElement.dataset.defaultMax;
    if (scoreEmpty && (maxEmpty || atDefault)) {
      if (status) payload.scoreStatuses[subject.id] = status;
      continue;
    }
    if (scoreEmpty) throw new Error(`${subject.name}暂未录入得分，请将满分也留空。`);
    const score = Number(scoreRaw);
    const max = Number(maxRaw);
    if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) throw new Error(`请核对${subject.name}得分和满分。`);
    if (score < 0 || score > max) throw new Error(`请核对${subject.name}得分和满分，得分不能超过满分。`);
    if (status) throw new Error(`${subject.name}不能同时录入成绩和考试状态。`);
    payload.scores[subject.id] = { score, max };
  }
  if (kind === 'zhongkaoMock' && Object.keys(payload.scores).length === core.subjects().length) {
    const total = Object.values(payload.scores).reduce((sum, entry) => sum + entry.max, 0);
    if (Math.abs(total - 750) > 1e-6) throw new Error('模拟中考各科满分合计应为 750 分；如需其他总满分，请选择普通考试类型。');
  }
  if (!Object.keys(payload.scores).length && !Object.keys(payload.scoreStatuses).length && classRank === null && gradeRank === null) {
    throw new Error('请至少录入一门学科的得分、考试状态或一项排名。');
  }
  return payload;
}

function canWriteLearning() {
  if (core.isDemo()) {
    dialogs.announce('演示数据为只读示例，请切换到「我的记录」后再修改。');
    return false;
  }
  return true;
}

async function withSubmit(form, errorElement, action) {
  if (form.dataset.busy) return;
  form.dataset.busy = '1';
  const submit = form.querySelector('button[type="submit"], button.button.primary');
  if (submit) submit.disabled = true;
  if (errorElement) errorElement.textContent = '';
  try {
    await action();
  } catch (error) {
    if (errorElement?.isConnected) errorElement.textContent = error.message;
    else dialogs.announce(error.message);
  } finally {
    form.dataset.busy = '';
    if (submit) submit.disabled = false;
  }
}

async function refreshBoot() {
  const payload = await get('api/bootstrap');
  core.setBoot(payload);
  setCsrfToken(payload.csrfToken);
  render();
}

async function saveExam(form) {
  await withSubmit(form, document.querySelector('#exam-error'), async () => {
    const examId = form.dataset.id || null;
    const payload = parseExam(form);
    const response = examId ? await put(`api/exams/${examId}`, payload) : await post('api/exams', payload);
    core.applyFamilyData(response.data);
    core.state.mode = 'personal';
    core.saveModePreference('personal');
    core.state.selectedId = response.examId;
    core.state.savedExamId = response.examId;
    const saved = core.personal().exams.find((item) => item.id === response.examId);
    if (saved) {
      if (core.state.historyKindFilter && core.state.historyKindFilter !== saved.kind) core.state.historyKindFilter = '';
      if (core.state.historyScopeFilter && core.state.historyScopeFilter !== saved.scope) core.state.historyScopeFilter = '';
    }
    dialogs.closeExam();
    refreshLogs().catch(() => {});
    goTo('history');
    requestAnimationFrame(() => {
      const row = document.querySelector('[data-saved-exam]');
      row?.scrollIntoView({ block: 'center' });
    });
    dialogs.announce('考试已保存到我的记录。');
  });
}

async function saveDetail(form) {
  const kind = form.dataset.kind;
  const context = form.dataset.context;
  const fields = new FormData(form);
  const field = (name) => String(fields.get(name) ?? '').trim();
  await withSubmit(form, document.querySelector('#detail-error'), async () => {
    if (kind === 'evidence') {
      if (!canWriteLearning()) return;
      const exam = core.currentExam();
      if (!exam) throw new Error('请先选择一场考试。');
      const payload = {
        examId: exam.id,
        subject: field('subject'),
        question: field('question'),
        score: Number(field('score')),
        max: Number(field('max')),
        topic: field('topic'),
        skill: field('skill'),
        questionType: field('questionType'),
        reason: field('reason'),
      };
      const response = context ? await put(`api/evidence/${context}`, payload) : await post('api/evidence', payload);
      core.applyFamilyData(response.data);
      dialogs.closeDetail();
      render();
      dialogs.announce(response.message);
      return;
    }
    if (kind === 'plan') {
      if (!canWriteLearning()) return;
      let response;
      if (context) {
        response = await post('api/tasks', { evidenceId: context || null, title: field('title'), plan: field('plan'), due: field('due') });
      } else {
        response = await post('api/tasks', { evidenceId: null, title: field('title'), plan: field('plan'), due: field('due') });
      }
      core.applyFamilyData(response.data);
      dialogs.closeDetail();
      goTo('week');
      dialogs.announce(response.message);
      return;
    }
    if (kind === 'retest') {
      if (!canWriteLearning()) return;
      const payload = {
        correct: Number(field('correct')),
        total: Number(field('total')),
        questionSet: field('questionSet'),
        date: field('date'),
        hints: field('hints') === 'yes',
        note: field('note'),
      };
      const response = await put(`api/tasks/${context}/result`, payload);
      core.applyFamilyData(response.data);
      dialogs.closeDetail();
      render();
      dialogs.announce(response.message);
      return;
    }
    if (['learning-profile', 'cohort', 'target', 'subject-targets', 'score-maxima'].includes(kind)) {
      if (!canWriteLearning()) return;
      let response;
      if (kind === 'learning-profile') {
        response = await put('api/settings/profile', { studentName: field('studentName'), grade: field('grade'), className: field('className') });
      } else if (kind === 'cohort') {
        response = await put('api/settings/cohort', { classCount: numeric(field('classCount')), gradeCount: numeric(field('gradeCount')) });
      } else if (kind === 'target') {
        response = await put('api/settings/target', { target: numeric(field('target')) });
      } else if (kind === 'score-maxima') {
        const template = String(form.dataset.context || '');
        const maxima = {};
        core.subjects().forEach((subject) => {
          const raw = field(subject.id);
          maxima[subject.id] = raw === '' ? null : Number(raw);
        });
        response = await put(`api/settings/score-maxima/${template}`, maxima);
      } else {
        const targets = {};
        core.subjects().forEach((subject) => {
          const raw = field(subject.id);
          if (raw !== '') targets[subject.id] = Number(raw);
        });
        response = await put('api/settings/subject-targets', targets);
      }
      core.applyFamilyData(response.data);
      dialogs.closeDetail();
      render();
      dialogs.announce(response.message);
      return;
    }
    if (kind === 'account-name') {
      await patch('api/account', { name: field('name') });
      dialogs.closeDetail();
      await refreshBoot();
      dialogs.announce('称呼已保存。');
      return;
    }
    if (['admin-family', 'admin-user', 'admin-reset', 'admin-toggle'].includes(kind)) {
      if (!core.isAdmin()) throw new Error('账号管理仅限管理员操作。');
      let response;
      let tempPassword = '';
      if (kind === 'admin-family') {
        const payload = context
          ? { name: field('name') }
          : { name: field('name'), studentName: field('studentName'), grade: field('grade'), className: field('className') };
        response = context ? await patch(`api/admin/families/${context}`, payload) : await post('api/admin/families', payload);
      } else if (kind === 'admin-user') {
        const payload = {
          username: field('username'),
          name: field('name'),
          isAdmin: field('admin') === 'yes',
          familyId: field('familyId'),
        };
        response = context ? await patch(`api/admin/accounts/${context}`, payload) : await post('api/admin/accounts', payload);
        tempPassword = response.tempPassword || '';
      } else if (kind === 'admin-reset') {
        response = await post(`api/admin/accounts/${context}/reset-password`);
        tempPassword = response.tempPassword || '';
      } else {
        response = await post(`api/admin/accounts/${context}/toggle`);
      }
      dialogs.closeDetail();
      if (tempPassword) dialogs.openTempPassword(tempPassword, kind === 'admin-reset' ? '密码已重置' : '账号已创建');
      await refreshBoot();
      dialogs.announce(response.message);
      return;
    }
    throw new Error('未知操作。');
  });
}

/* ---------- 事件 ---------- */

async function refreshLogs() {
  const payload = await get('api/logs');
  core.state.boot.logs = payload.logs || [];
}

async function confirmDeleteExam(examId) {
  if (!examId) return;
  try {
    const response = await del(`api/exams/${examId}`);
    core.applyFamilyData(response.data);
    core.state.savedExamId = null;
    dialogs.closeDetail();
    render();
    dialogs.announce(response.message);
    refreshLogs().catch(() => {});
  } catch (error) {
    const target = document.querySelector('#detail-error');
    if (target) target.textContent = error.message;
    else dialogs.announce(error.message);
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button, [data-exam]');
  if (!event.target.closest('.mode-wrap')) showModeMenu(false);
  if (!button) return;
  const data = button.dataset;

  if (data.pageChoice || data.formChoice || data.examPicker) { dialogs.openChoice(button); return; }
  if (Object.prototype.hasOwnProperty.call(data, 'examChoice')) {
    if (data.examChoice) dialogs.chooseOption(data.examChoice);
    else dialogs.chooseOption('');
    return;
  }
  if (data.action === 'close-exam-picker') { dialogs.closeChoice(); return; }
  if (data.abilityExam) {
    dialogs.openAbilityQuestions(data.abilityExam, data.abilityLabel);
    return;
  }
  if (data.settingsTab) {
    core.state.settingsTab = data.settingsTab;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (data.openAccount) {
    if (!core.isAdmin()) return dialogs.announce('账号管理仅限管理员操作。');
    const account = core.state.boot.admin?.accounts.find((item) => item.id === data.openAccount);
    if (account) dialogs.openAdminAccount(account);
    return;
  }
  if (data.editFamily) {
    if (!core.isAdmin()) return dialogs.announce('账号管理仅限管理员操作。');
    dialogs.openAdminFamily(core.state.boot.admin?.families.find((family) => family.id === data.editFamily));
    return;
  }
  if (data.editUser || data.resetUser || data.toggleUser) {
    if (!core.isAdmin()) return dialogs.announce('账号管理仅限管理员操作。');
    const account = core.state.boot.admin?.accounts.find((item) => item.id === (data.editUser || data.resetUser || data.toggleUser));
    if (!account) return;
    if (data.editUser) dialogs.openAdminUser(account);
    else if (data.resetUser) dialogs.openResetConfirm(account);
    else dialogs.openToggleConfirm(account);
    return;
  }
  if (button === modeButton) {
    showModeMenu(modeMenu.hidden);
    return;
  }
  if (data.mode) {
    core.state.mode = data.mode;
    core.saveModePreference(data.mode);
    core.state.selectedId = null;
    core.state.view = 'overview';
    showModeMenu(false);
    modeButton.focus();
    render();
    return;
  }
  if (data.view) {
    const ret = core.state.reviewReturn;
    showModeMenu(false);
    goTo(data.view);
    if (ret && ret.view === data.view) {
      core.state.reviewReturn = null;
      requestAnimationFrame(() => window.scrollTo(0, ret.scroll));
    }
    return;
  }
  if (data.analysisSection) {
    core.state.analysisSection = data.analysisSection;
    render();
    document.querySelector(`[data-analysis-section="${core.state.analysisSection}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  if (data.analysisTab) {
    core.state.analysisTab = data.analysisTab;
    render();
    document.querySelector('#analysis-card')?.scrollIntoView({ block: 'start' });
    document.querySelector(`[data-analysis-tab="${core.state.analysisTab}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (data.metric) {
    core.state.metric = data.metric;
    render();
    document.querySelector(`[data-metric="${core.state.metric}"]`)?.focus();
    return;
  }
  if (data.subject) {
    core.state.subject = data.subject;
    goTo('subjects');
    dialogs.focusPageChoice('subject-select');
    return;
  }
  if (data.exam) { selectExam(data.exam); return; }
  if (data.edit) {
    if (!canWriteLearning()) return;
    dialogs.openExam(core.personal().exams.find((exam) => exam.id === data.edit));
    return;
  }
  if (data.pickSubject) {
    dialogs.toggleExamSubject(data.pickSubject);
    return;
  }
  if (data.review) {
    if (document.querySelector('#detail-dialog').contains(button)) dialogs.closeDetail();
    core.state.reviewReturn = { view: core.state.view, scroll: window.scrollY };
    core.state.selectedId = data.review;
    core.state.reviewSubject = data.reviewSubject || '';
    core.state.reviewQuestion = data.reviewQuestion || '';
    goTo('review');
    if (core.state.reviewQuestion) {
      requestAnimationFrame(() => document.getElementById(`evidence-${core.state.reviewQuestion}`)?.scrollIntoView({ block: 'center' }));
    }
    return;
  }
  if (data.editEvidence) {
    if (!canWriteLearning()) return;
    dialogs.openEvidence(core.evidence().find((item) => item.id === data.editEvidence));
    return;
  }
  if (data.plan) {
    if (!canWriteLearning()) return;
    dialogs.openPlan(core.evidence().find((item) => item.id === data.plan));
    return;
  }
  if (data.retest) {
    if (!canWriteLearning()) return;
    const task = core.tasks().find((item) => item.id === data.retest);
    if (task) dialogs.openRetest(task);
    return;
  }

  const action = data.action;
  if (action === 'add') {
    if (!canWriteLearning()) return;
    dialogs.openExam();
    return;
  }
  if (action === 'score-detail') {
    const exam = core.currentExam();
    if (exam) dialogs.openScoreBreakdown(exam);
    return;
  }
  if (action === 'show-analysis') {
    if (core.phoneLayout()) { goTo('analysis'); return; }
    if (core.state.view !== 'overview') goTo('overview');
    const collapsed = document.querySelector('#content .overview-collapsible');
    if (collapsed) collapsed.open = true;
    document.querySelector('#analysis-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'evidence') {
    if (!canWriteLearning()) return;
    dialogs.openEvidence();
    return;
  }
  if (action === 'plan') {
    if (!canWriteLearning()) return;
    dialogs.openPlan();
    return;
  }
  if (action === 'print') { window.print(); return; }
  if (['learning-profile', 'cohort', 'goal', 'subject-targets', 'score-maxima'].includes(action)) {
    if (!canWriteLearning()) return;
    if (action === 'learning-profile') dialogs.openProfile();
    else if (action === 'cohort') dialogs.openCohort();
    else if (action === 'goal') dialogs.openTarget();
    else if (action === 'subject-targets') dialogs.openSubjectTargets();
    else dialogs.openScoreMaxima(button.dataset.template);
    return;
  }
  if (action === 'logs') {
    await refreshLogs();
    dialogs.openLogs(core.logs());
    return;
  }
  if (action === 'delete-exam') {
    if (!core.isAdmin()) return dialogs.announce('只有管理员可以删除考试。');
    dialogs.openDeleteExam(core.personal().exams.find((exam) => exam.id === data.deleteExam));
    return;
  }
  if (action === 'confirm-delete-exam') {
    if (!core.isAdmin()) return dialogs.announce('只有管理员可以删除考试。');
    await confirmDeleteExam(button.dataset.deleteExam);
    return;
  }
  if (action === 'edit-account') { dialogs.openAccountName(); return; }
  if (action === 'create-family') {
    if (!core.isAdmin()) return dialogs.announce('账号管理仅限管理员操作。');
    dialogs.openAdminFamily();
    return;
  }
  if (action === 'create-user') {
    if (!core.isAdmin()) return dialogs.announce('账号管理仅限管理员操作。');
    dialogs.openAdminUser();
    return;
  }
  if (action === 'clear-history-filter') {
    core.state.historyKindFilter = '';
    core.state.historyScopeFilter = '';
    render();
    return;
  }
  if (action === 'copy-password') {
    const value = document.querySelector('#detail-dialog .temp-password strong')?.textContent || '';
    if (value) dialogs.copyPassword(value);
    return;
  }
  if (action === 'close-exam') return dialogs.closeExam();
  if (action === 'close-detail') return dialogs.closeDetail();
  if (action === 'close-score') return dialogs.closeScore();
  if (action === 'exam-next') { dialogs.changeExamStep(button.form, '2'); return; }
  if (action === 'exam-back') { dialogs.changeExamStep(button.form, '1'); return; }
});

document.addEventListener('change', (event) => {
  const controls = {
    'comparison-filter': 'comparisonFilter',
    'comparison-subject': 'comparisonSubject',
    'review-subject': 'reviewSubject',
    'ability-group': 'abilityGroup',
  };
  if (controls[event.target.id]) {
    const id = event.target.id;
    const scroll = window.scrollY;
    core.state[controls[id]] = event.target.value;
    render();
    dialogs.focusPageChoice(id);
    window.scrollTo(0, scroll);
    return;
  }
  if (event.target.id === 'history-kind-filter') {
    core.state.historyKindFilter = event.target.value;
    render();
    dialogs.focusPageChoice('history-kind-filter');
    return;
  }
  if (event.target.id === 'subject-kind-filter') {
    core.state.subjectKindFilter = event.target.value;
    render();
    dialogs.focusPageChoice('subject-kind-filter');
    return;
  }
  if (event.target.id === 'subject-scope-filter') {
    core.state.subjectScopeFilter = event.target.value;
    render();
    dialogs.focusPageChoice('subject-scope-filter');
    return;
  }
  if (event.target.id === 'history-scope-filter') {
    core.state.historyScopeFilter = event.target.value;
    render();
    dialogs.focusPageChoice('history-scope-filter');
    return;
  }
  if (event.target.id === 'exam-select') { selectExam(event.target.value); return; }
  if (event.target.id === 'subject-select') {
    core.state.subject = event.target.value;
    render();
    dialogs.focusPageChoice('subject-select');
    return;
  }
  if (event.target.id === 'range-select') {
    core.state.range = event.target.value;
    render();
    dialogs.focusPageChoice('range-select');
  }
});

document.addEventListener('invalid', (event) => {
  const select = event.target;
  if (!core.phoneLayout() || !select.matches('select.form-choice-native')) return;
  const trigger = select.nextElementSibling;
  event.preventDefault();
  const error = select.form.querySelector('.form-error');
  if (!error) return;
  error.textContent = `请选择${select.getAttribute('aria-label')}。`;
  trigger.setAttribute('aria-invalid', 'true');
  trigger.focus();
}, true);

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.id === 'exam-form') {
    event.preventDefault();
    if (form.dataset.step === '1') {
      dialogs.changeExamStep(form, '2');
      return;
    }
    saveExam(form);
    return;
  }
  if (form.id === 'detail-form') {
    event.preventDefault();
    saveDetail(form);
    return;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modeMenu.hidden) {
    showModeMenu(false);
    modeButton.focus();
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.point')) {
    event.preventDefault();
    selectExam(event.target.dataset.exam);
  }
});

async function init() {
  checkFlexGap();
  dialogs.bindPanelEvents();
  matchMedia('(max-width: 760px)').addEventListener('change', () => {
    if (!core.phoneLayout()) dialogs.closeChoice(false);
    if (!dialogs.isPanelOpen()) render();
  });
  try {
    const payload = await get('api/bootstrap');
    core.setBoot(payload);
    setCsrfToken(payload.csrfToken);
    core.state.mode = core.readModePreference();
    render();
    if (payload.notice) dialogs.announce(payload.notice);
  } catch (error) {
    content.innerHTML = `<article class="card empty"><strong>无法加载 Grade</strong><p>${core.escapeHtml(error.message)}</p></article>`;
  }
}

init();
