import {
  dateLabel,
  deltaBadge,
  escapeHtml,
  examGroupKey,
  examKindLabel,
  examKindLabels,
  examScopeLabel,
  examScopeLabels,
  examTotal,
  icon,
  num,
  percent,
  rankGroupKey,
  ratio,
  scoreStatuses,
  state,
  subjects,
} from '../core.js';
import { chart } from '../charts.js';
import { pageChoice } from './shared.js';

const OVERALL_METRICS = [
  ['grade', '年级名次'],
  ['class', '班级名次'],
  ['gradeShare', '年级前百分比'],
  ['classShare', '班级前百分比'],
  ['total', '总分得分率'],
];
const SUBJECT_METRICS = [['score', '得分'], ['rate', '得分率']];

const subjectById = (id) => subjects().find((subject) => subject.id === id) || subjects()[0];

function metricValue(exam, object, metric, subjectId) {
  if (object === 'subject') {
    const entry = exam.scores[subjectId];
    if (!entry) return null;
    // 单科得分/得分率按考试日期连线，校内与校外机构之间不再分段。
    return { value: metric === 'rate' ? ratio(entry) : entry.score, group: 'subject' };
  }
  if (metric === 'total') {
    const total = examTotal(exam);
    if (!total?.signature) return null;
    return { value: (100 * total.score) / total.max, group: `${examGroupKey(exam)}|${total.signature}` };
  }
  const rankKind = metric === 'class' || metric === 'classShare' ? 'class' : 'grade';
  const isShare = metric === 'gradeShare' || metric === 'classShare';
  const rank = exam[`${rankKind}Rank`];
  if (!rank) return null;
  if (isShare) {
    const count = exam[`${rankKind}Count`];
    if (!Number.isInteger(count) || rank < 1 || rank > count) return null;
    return { value: (100 * rank) / count, group: rankGroupKey(exam) };
  }
  return { value: rank, group: rankGroupKey(exam) };
}

function metricMeta(object, metric, subject) {
  if (object === 'subject') {
    return metric === 'rate'
      ? { unit: '%', lowerBetter: false, dataLabel: `${subject.name}得分率` }
      : { unit: '分', lowerBetter: false, dataLabel: `${subject.name}得分` };
  }
  return {
    grade: { unit: '名', lowerBetter: true, dataLabel: '年级名次' },
    class: { unit: '名', lowerBetter: true, dataLabel: '班级名次' },
    gradeShare: { unit: '%', lowerBetter: true, dataLabel: '年级前百分比' },
    classShare: { unit: '%', lowerBetter: true, dataLabel: '班级前百分比' },
    total: { unit: '%', lowerBetter: false, dataLabel: '总分得分率' },
  }[metric];
}

function headlineValue(exam, object, metric, subject) {
  if (object === 'subject') {
    const entry = exam.scores[subject.id];
    return metric === 'rate' ? percent(ratio(entry)) : `${num(entry.score)} / ${num(entry.max)} 分`;
  }
  if (metric === 'total') {
    const total = examTotal(exam);
    return percent((100 * total.score) / total.max);
  }
  const rankKind = metric === 'class' || metric === 'classShare' ? 'class' : 'grade';
  const isShare = metric === 'gradeShare' || metric === 'classShare';
  const rank = exam[`${rankKind}Rank`];
  const count = exam[`${rankKind}Count`];
  if (isShare) return `前 ${percent((100 * rank) / count)}`;
  return `第 ${num(rank)} 名`;
}

function subjectDelta(current, prior, subjectId, metric) {
  const cur = current.scores[subjectId];
  const pri = prior?.scores[subjectId];
  if (!cur || !pri) return '<span class="trend-delta-note">暂无上一场可对比</span>';
  const caliberDiff = examGroupKey(current) !== examGroupKey(prior);
  const caliberNote = caliberDiff ? ' · 考试类型、参考范围或机构不同' : '';
  if (metric === 'score') {
    if (cur.max !== pri.max) return `<span class="trend-delta-note">满分不同${caliberNote}</span>`;
    const diff = cur.score - pri.score;
    const text = Math.abs(diff) < 0.005
      ? '较上场持平'
      : diff > 0 ? `较上场多 ${num(diff)} 分` : `较上场少 ${num(Math.abs(diff))} 分`;
    if (caliberDiff) return `<span class="trend-delta-note">${text}${caliberNote}</span>`;
    return `${deltaBadge(diff, '分')}<span>较上一场</span>`;
  }
  const diff = ratio(cur) - ratio(pri);
  const text = Math.abs(diff) < 0.005
    ? '较上场持平'
    : diff > 0 ? `较上场高 ${num(diff)} 个百分点` : `较上场低 ${num(Math.abs(diff))} 个百分点`;
  if (caliberDiff) return `<span class="trend-delta-note">${text}${caliberNote}</span>`;
  return `${deltaBadge(diff, '个百分点')}<span>较上一场</span>`;
}

function deltaHtml(current, prior, object, metric, subject, meta) {
  if (object === 'subject') return subjectDelta(current, prior, subject.id, metric);
  if (!prior) return '<span class="trend-delta-note">暂无上一场可对比</span>';
  const currentEntry = metricValue(current, object, metric, subject.id);
  const priorEntry = metricValue(prior, object, metric, subject.id);
  if (!currentEntry || !priorEntry || currentEntry.group !== priorEntry.group) {
    return '<span class="trend-delta-note">比较群体不同，不可比较</span>';
  }
  if (metric === 'grade' || metric === 'class') {
    if (current[`${metric}Count`] !== prior[`${metric}Count`]) return '<span class="trend-delta-note">参考人数不同，不可比较</span>';
  }
  const change = meta.lowerBetter ? priorEntry.value - currentEntry.value : currentEntry.value - priorEntry.value;
  const unit = meta.unit === '%' ? '个百分点' : meta.unit === '名' ? '名' : '分';
  return `${deltaBadge(change, unit)}<span>较上一场</span>`;
}

function controls(object, subject, metric) {
  const objectValue = object === 'subject' ? subject.id : 'overall';
  const objectOptions = [['overall', '整体'], ...subjects().map((item) => [item.id, item.name])];
  const metricOptions = object === 'overall' ? OVERALL_METRICS : SUBJECT_METRICS;
  return `<div class="trend-selects">
    <div class="trend-select"><span class="trend-select-label">查看对象</span>${pageChoice('trend-object', '查看对象', objectOptions, objectValue)}</div>
    <div class="trend-select"><span class="trend-select-label">查看指标</span>${pageChoice('trend-metric', '查看指标', metricOptions, metric)}</div>
  </div>`;
}

function filterSummary() {
  const range = state.trendRange === 'all' ? '全部场次' : '近 10 场';
  const kind = state.trendKind ? examKindLabels()[state.trendKind] : '全部类型';
  const scope = state.trendScope ? examScopeLabels()[state.trendScope] : '全部范围';
  return `${range} · ${kind} · ${scope}`;
}

function filterEntry() {
  return `<button class="trend-filter-entry" type="button" data-action="trend-filter" aria-haspopup="dialog" aria-controls="detail-dialog">${icon('filter')}<span>筛选</span><span class="trend-filter-summary">${escapeHtml(filterSummary())}</span><span class="trend-filter-arrow" aria-hidden="true">›</span></button>`;
}

function headline(latest, prior, object, metric, subject, meta) {
  if (!latest) return '';
  return `<div class="trend-headline">
    <div class="trend-headline-main">
      <h3>${icon('rise')}${meta.dataLabel}趋势</h3>
      <span class="trend-headline-latest">最近一次 <strong>${headlineValue(latest, object, metric, subject)}</strong> · ${dateLabel(latest.date)}</span>
    </div>
    <div class="trend-headline-delta">${deltaHtml(latest, prior, object, metric, subject, meta)}</div>
  </div>`;
}

function pointDetail(exam, object, metric, subject) {
  if (!exam) return '';
  const head = `<span class="trend-point-exam">${escapeHtml(exam.name)} · ${escapeHtml(exam.date)}</span>`;
  let body;
  if (object === 'subject') {
    const entry = exam.scores[subject.id];
    const source = `${examKindLabel(exam.kind)} · ${examScopeLabel(exam.scope)}${exam.orgName ? ` · ${exam.orgName}` : ''}`;
    body = `<span>${subject.name} ${num(entry.score)} / ${num(entry.max)} 分 · 得分率 ${percent(ratio(entry))}</span><span class="trend-point-source">${escapeHtml(source)}</span>`;
  } else if (metric === 'total') {
    const total = examTotal(exam);
    body = `<span>总分 ${num(total.score)} / ${num(total.max)} 分 · 得分率 ${percent((100 * total.score) / total.max)}</span>`;
  } else {
    const rankKind = metric === 'class' || metric === 'classShare' ? 'class' : 'grade';
    const rank = exam[`${rankKind}Rank`];
    const count = exam[`${rankKind}Count`];
    body = `<span>${rankKind === 'class' ? '班级名次' : '年级名次'} 第 ${num(rank)} 名${count ? ` / ${num(count)} 人` : ''}</span>`;
  }
  return `<p class="trend-point-detail">${head} ${body}</p>`;
}

function noteLines(object, metric, shown, subject) {
  const lines = [];
  if (object === 'subject') {
    const missing = shown.filter((record) => !record.scores[subject.id]);
    if (missing.length) {
      const labels = new Map();
      missing.forEach((record) => {
        const label = scoreStatuses()[record.scoreStatuses?.[subject.id]] || '未录入';
        labels.set(label, (labels.get(label) || 0) + 1);
      });
      lines.push(`未绘制 ${missing.length} 场：${[...labels].map(([label, count]) => `${label} ${count} 场`).join(' · ')}；这些场次不按 0 分补线。`);
    }
    const zeros = shown.filter((record) => record.scores[subject.id]?.score === 0).length;
    if (zeros) lines.push(`其中 ${zeros} 场为真实 0 分，已按 0 绘制。`);
  } else if (metric === 'gradeShare' || metric === 'classShare') {
    const rankKind = metric === 'classShare' ? 'class' : 'grade';
    const missing = shown.filter((record) => {
      const rank = record[`${rankKind}Rank`];
      const count = record[`${rankKind}Count`];
      return rank && (!Number.isInteger(count) || rank < 1 || rank > count);
    });
    if (missing.length) {
      lines.push(`缺参考人数，前百分比留空：${missing.map((record) => `${escapeHtml(record.name)}（第 ${num(record[`${rankKind}Rank`])} 名）`).join('、')}。`);
    }
  }
  return lines.length ? `<p class="trend-missing">${lines.join('<br>')}</p>` : '';
}

function plotNote(object, metric, shown, subject) {
  if (object === 'subject') {
    return '按考试日期展示成绩；校内与校外机构之间也会连线，节点详情标注考试类型、参考范围与机构。得分率按当场保存的满分计算。试卷难度和考查内容可能不同，请结合试卷解读。';
  }
  if (metric === 'total') return '总分得分率＝本场得分 ÷ 本场满分。计分口径或参考群体不同的场次不连成同一条线；模拟中考录齐后纳入。';
  if (metric === 'gradeShare' || metric === 'classShare') return '前百分比＝本场名次 ÷ 本场参考人数，越小越靠前；缺参考人数的场次留空。';
  return '名次越靠前，点越高。不同参考范围或机构的场次分段显示。';
}

export function trendView(exams) {
  const object = state.trendObject === 'subject' ? 'subject' : 'overall';
  const subject = subjectById(state.trendSubject);
  const metricOptions = object === 'overall' ? OVERALL_METRICS : SUBJECT_METRICS;
  const rememberedMetric = object === 'overall' ? state.trendOverallMetric : state.trendSubjectMetric;
  const metric = metricOptions.some(([key]) => key === rememberedMetric) ? rememberedMetric : metricOptions[0][0];
  const meta = metricMeta(object, metric, subject);

  const kind = state.trendKind;
  const scope = state.trendScope;
  const filtered = exams.filter((record) => (!kind || record.kind === kind) && (!scope || record.scope === scope));
  const shown = state.trendRange === 'all' ? filtered : filtered.slice(-10);

  const entries = shown.map((record) => metricValue(record, object, metric, subject.id));
  const values = entries.map((entry) => (entry ? entry.value : null));
  const groups = entries.map((entry) => (entry ? entry.group : null));
  const validExams = shown.filter((record, index) => entries[index]);

  const latest = validExams[validExams.length - 1] || null;
  const latestPrior = validExams[validExams.length - 2] || null;
  const pointExam = validExams.find((record) => record.id === state.trendPointId) || latest;

  const dataCount = validExams.length;
  const countText = state.trendRange === 'recent' && filtered.length > 10
    ? `筛选后 ${filtered.length} 场，近 ${shown.length} 场中 ${dataCount} 场有${meta.dataLabel}`
    : `筛选后 ${filtered.length} 场，${dataCount} 场有${meta.dataLabel}`;

  const plot = dataCount
    ? chart(shown, values, pointExam?.id, meta.unit, meta.lowerBetter, { fixed: true, groups, point: 'detail' })
    : '<div class="empty"><strong>当前条件下没有可绘制的记录</strong><p>筛选后暂无可用的成绩或排名数据。</p></div>';
  const single = dataCount === 1 ? '<p class="plot-note">当前条件下只有 1 场有数据，暂无法形成趋势。</p>' : '';

  return `<article class="card trend-card trend-page">
    ${controls(object, subject, metric)}
    ${filterEntry()}
    ${headline(latest, latestPrior, object, metric, subject, meta)}
    ${plot}${single}
    ${pointDetail(pointExam, object, metric, subject)}
    <p class="trend-summary"><strong>${countText}</strong></p>
    ${noteLines(object, metric, shown, subject)}
    <p class="plot-note">${plotNote(object, metric, shown, subject)}</p></article>`;
}
