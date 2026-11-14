/* 全局状态、派生数据与格式化助手。所有视图只读这里的快照，不持有副本。 */

export const state = {
  boot: null,
  mode: 'personal',
  view: 'overview',
  selectedId: null,
  metric: 'grade',
  subject: 'math',
  range: 'recent',
  analysisSection: 'comparison',
  analysisTab: 'recent',
  comparisonSubject: 'math',
  comparisonFilter: 'all',
  reviewSubject: '',
  reviewReturn: null,
  abilityGroup: 'topic',
  savedExamId: null,
  settingsTab: 'account',
  historyKindFilter: '',
  historyScopeFilter: '',
  subjectKindFilter: '',
  subjectScopeFilter: '',
};

export const phoneLayout = () => window.matchMedia('(max-width: 760px)').matches;
export const newestFirst = (items) => [...items].reverse();
export const last = (items) => items[items.length - 1];

export const meta = () => state.boot.meta;
export const appVersion = () => meta().version || '';
export const user = () => state.boot.user;
export const personal = () => state.boot.data;
export const demoData = () => state.boot.demo;
export const data = () => (state.mode === 'demo' ? demoData() : personal());
export const subjects = () => meta().subjects;
export const examKinds = () => meta().examKinds;
export const examKindLabels = () => meta().examKindLabels || meta().examKinds;
export const examKindLabel = (kind) => examKindLabels()[kind] || '类型未填';
export const examScopes = () => meta().examScopes;
export const examScopeLabels = () => meta().examScopeLabels || meta().examScopes;
export const examScopeLabel = (scope) => examScopeLabels()[scope] || '范围未填';
export const scoreStatuses = () => meta().scoreStatuses;
export const retestTypes = () => meta().retestTypes;
export const isDemo = () => state.mode === 'demo';
export const isAdmin = () => Boolean(user().isAdmin);
export const readOnly = () => isDemo();

const subjectById = (id) => subjects().find((subject) => subject.id === id);
export const subjectName = (id) => subjectById(id)?.name || '';
export const subjectMax = (id) => subjectById(id)?.max ?? null;
export const optionalSubjectIds = () => new Set(subjects().filter((subject) => subject.optional).map((subject) => subject.id));

export function setBoot(payload) {
  state.boot = payload;
}

export function applyFamilyData(familyData) {
  state.boot.data = familyData;
}

export function applyUser(nextUser) {
  state.boot.user = nextUser;
}

export function exams() {
  return [...data().exams].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

export const logs = () => state.boot.logs || [];
export const evidence = () => data().evidence;
export const tasks = () => data().tasks;
export const cohort = () => data().cohort;
export const target = () => data().target;
export const subjectTargets = () => data().subjectTargets;
export const scoreMaxima = () => data().scoreMaxima;
export const maxDefaults = (kind, scope) => {
  const maxima = data().scoreMaxima || {};
  if (kind === 'zhongkaoMock') return maxima.mock || {};
  if (kind === 'weekly' || scope === 'external') {
    const flat = {};
    subjects().forEach((subject) => { flat[subject.id] = 100; });
    return flat;
  }
  return maxima.regular || {};
};

export function currentExam() {
  const all = exams();
  return all.find((exam) => exam.id === state.selectedId) || all[all.length - 1] || null;
}

export function previousExam(exam) {
  const all = exams();
  const index = all.indexOf(exam);
  return index > 0 ? all[index - 1] : null;
}

export function examTotal(exam) {
  return exam?.total || null;
}

export const scoreValue = (total) => (total?.score == null ? '—' : num(total.score));
export const scoreText = (total) => `${scoreValue(total)} / ${num(total.max)} 分`;

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

export function num(value) {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? number.format(parsed) : '—';
}

export const ratio = (entry) => (entry ? (100 * entry.score) / entry.max : null);
export const percent = (value) => (value === null || value === undefined ? '—' : `${num(Math.round(value * 10) / 10)}%`);
export const dateLabel = (date) => String(date).slice(5).replace('-', '/');

export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const today = () => meta().today || localDay();

export function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function scopeMatches(a, b) {
  return a?.id === b?.id || ((a?.scope || '') === (b?.scope || '') && a?.scope !== 'other');
}

/** 只有考试类型、范围和机构都一致的小考才放在同一条趋势里比较。 */
export function sameGroup(a, b) {
  if (!a || !b) return false;
  return a.id === b.id || (a.kind === b.kind && a.scope === b.scope && (a.orgName || '') === (b.orgName || ''));
}

export function deltaBadge(change, unit) {
  const rounded = Math.round(Math.abs(change) * 100) / 100;
  if (!rounded) return '<span class="badge">持平</span>';
  const positive = change > 0;
  return `<span class="badge ${positive ? 'up' : 'down'}">${icon(positive ? 'up' : 'down')}${num(rounded)} ${unit}</span>`;
}

export function rankDelta(exam, previous, kind) {
  const rank = exam[`${kind}Rank`];
  const priorRank = previous?.[`${kind}Rank`];
  const count = exam[`${kind}Count`];
  const priorCount = previous?.[`${kind}Count`];
  if (!rank || !priorRank) return '缺少上次或本次排名';
  if (!sameGroup(exam, previous)) return '考试类型、范围或机构不同';
  if (!count || !priorCount) return '缺少参考人数';
  if (count === priorCount) return `${deltaBadge(priorRank - rank, '名')} <span>较上次</span>`;
  return `${deltaBadge(100 * (priorRank / priorCount - rank / count), '个百分点')} <span>较上次排名占比</span>`;
}

export function rankShareLabel(exam, kind) {
  const rank = exam[`${kind}Rank`];
  const count = exam[`${kind}Count`];
  if (!Number.isInteger(rank) || !Number.isInteger(count) || rank < 1 || rank > count) return '';
  const share = 100 * rank / count;
  return share < 0.05 ? '前 0.1% 以内' : `前 ${percent(share)}`;
}

export function rankDetails(exam, previous, kind) {
  const change = rankDelta(exam, previous, kind);
  const label = rankShareLabel(exam, kind);
  if (!label) return change;
  return `<span class="badge brand rank-share" title="名次 ÷ 参考人数">${label}</span><span class="rank-change">${change}</span>`;
}

export function subjectChange(exam, previous, subjectId) {
  const current = exam.scores[subjectId];
  const prior = previous?.scores[subjectId];
  if (!current || !prior) return '<span class="faint">—</span>';
  if (!sameGroup(exam, previous) || current.max !== prior.max) {
    return '<span class="badge" title="考试类型、范围、机构或学科满分不同，请结合试卷查看">口径变化</span>';
  }
  return deltaBadge(ratio(current) - ratio(prior), '个百分点');
}

export function missingScore(exam, subjectId) {
  return scoreStatuses()[exam.scoreStatuses?.[subjectId]] || '未录入';
}

export function examMeta(exam) {
  return `${examKindLabel(exam.kind)} · ${examScopeLabel(exam.scope)}${exam.orgName ? ` · ${exam.orgName}` : ''}`;
}

export function paperLoss(exam, subjectId) {
  const entry = exam.scores[subjectId];
  return entry ? Math.max(0, entry.max - entry.score) : null;
}

export function targetRate(subjectId) {
  const value = subjectTargets()[subjectId];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function priorities(exam) {
  const optional = optionalSubjectIds();
  return subjects()
    .filter((subject) => !optional.has(subject.id) && exam.scores[subject.id])
    .sort((a, b) => ratio(exam.scores[a.id]) - ratio(exam.scores[b.id]))
    .slice(0, 2);
}

export function selectOptions(options, selected, placeholder) {
  return `<option value="">${escapeHtml(placeholder)}</option>${Object.entries(options)
    .map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('')}`;
}

export function readModePreference() {
  try {
    return localStorage.getItem('grade-mode') === 'demo' ? 'demo' : 'personal';
  } catch {
    return 'personal';
  }
}

export function saveModePreference(mode) {
  try {
    localStorage.setItem('grade-mode', mode);
  } catch {
    /* 浏览器禁用存储时只影响本次偏好，不影响数据。 */
  }
}
