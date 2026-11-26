/* 全局状态、派生数据与格式化助手。所有视图只读这里的快照，不持有副本。 */

export const state = {
  boot: null,
  mode: 'personal',
  view: 'overview',
  selectedId: null,
  subject: 'math',
  analysisSection: 'current',
  comparisonSubject: 'math',
  comparisonFilter: 'all',
  reviewSubject: '',
  reviewReturn: null,
  abilityGroup: 'topic',
  abilityTab: 'profile',
  abilityReturn: null,
  savedExamId: null,
  settingsTab: 'account',
  historyKindFilter: '',
  historyScopeFilter: '',
  trendObject: 'overall',
  trendSubject: 'math',
  trendOverallMetric: 'grade',
  trendSubjectMetric: 'score',
  trendPointId: null,
  trendKind: '',
  trendScope: '',
  trendRange: 'recent',
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

/** 考试类型、参考范围和机构一致时才属于同一比较群体；校外考试缺机构名时只与自身一致。 */
export function examGroupKey(exam) {
  if (!exam) return '';
  const org = exam.scope === 'external' ? (exam.orgName || `#${exam.id}`) : '';
  return `${exam.kind || ''}|${exam.scope || ''}|${org}`;
}

/** 只有考试类型、范围和机构都一致的小考才放在同一条趋势里比较。 */
export function sameGroup(a, b) {
  if (!a || !b) return false;
  return a.id === b.id || examGroupKey(a) === examGroupKey(b);
}

/** 名次只比较同一参考群体（范围 + 机构），考试类型不影响名次可比性。 */
export function rankGroupKey(exam) {
  if (!exam) return '';
  const org = exam.scope === 'external' ? (exam.orgName || `#${exam.id}`) : '';
  return `${exam.scope || ''}|${org}`;
}

export function sameRankGroup(a, b) {
  if (!a || !b) return false;
  return a.id === b.id || rankGroupKey(a) === rankGroupKey(b);
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

/* ---------- 学科画像共用计算（成绩对照上色与画像卡共用，勿在 trend.js 复制） ---------- */

export const PROFILE_THRESHOLDS = {
  minEvidence: 3, // 有效场次少于该值判「证据不足」
  volWindow: 4, // 波动取近 4 场（场地不足 4 场时按实际场次）
  stableVol: 4, // 波动 < 4 个百分点判「稳定」
  metTolerance: 2, // 水平 ≥ 目标 − 2 个百分点判「达标」
  tierClose: 5, // 缺口 ≤ 5 个百分点为「差 5 个百分点以内」，更低者为「更低」
};

/** 单元格/进度条分档：按单场得分率相对目标的缺口，返回 met / close / low / none。 */
export function tierOf(value, target) {
  if (value === null || value === undefined || target === null) return 'none';
  const gap = target - value;
  if (gap <= PROFILE_THRESHOLDS.metTolerance) return 'met';
  if (gap <= PROFILE_THRESHOLDS.tierClose) return 'close';
  return 'low';
}

const profileMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const profileStd = (values) => {
  const average = profileMean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
};
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * 学科画像：依据 recent（新→旧，截至当前考试、按 comparisonFilter 过滤的最近场次，
 * 与 examComparison 的 recent 同一口径）计算某科的水平、波动、趋势与状态。
 * 真实零分计入；未录入/缺考/待公布（无 scores 条目）不计入。
 */
export function subjectProfile(recent, subjectId) {
  const rates = recent
    .map((record) => ratio(record.scores[subjectId]))
    .filter((value) => value !== null);
  const count = rates.length;
  const target = targetRate(subjectId);
  const level = count >= PROFILE_THRESHOLDS.minEvidence ? round1(profileMean(rates.slice(0, 3))) : null;
  const volatility = count >= PROFILE_THRESHOLDS.minEvidence
    ? round1(profileStd(rates.slice(0, Math.min(PROFILE_THRESHOLDS.volWindow, count))))
    : null;
  const trend = count >= PROFILE_THRESHOLDS.volWindow
    ? round1(profileMean(rates.slice(0, 2)) - profileMean(rates.slice(2, 4)))
    : null;
  const met = level !== null && target !== null ? level >= target - PROFILE_THRESHOLDS.metTolerance : null;
  const stable = volatility !== null ? volatility < PROFILE_THRESHOLDS.stableVol : null;
  const status = count < PROFILE_THRESHOLDS.minEvidence
    ? 'insufficient'
    : target === null
      ? 'no-target'
      : `${met ? 'met' : 'low'}·${stable ? 'stable' : 'volatile'}`;
  return { subjectId, count, level, volatility, trend, target, met, stable, status };
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
