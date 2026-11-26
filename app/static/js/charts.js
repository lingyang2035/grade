import { dateLabel, escapeHtml, num, percent } from './core.js';

function truncate(value, maximum) {
  const string = String(value || '');
  return string.length > maximum ? `${string.slice(0, maximum)}…` : string;
}

function niceStep(range) {
  if (range <= 0) return 1;
  const raw = range / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const residual = raw / magnitude;
  const factor = residual < 1.5 ? 1 : residual < 3 ? 2 : residual < 7 ? 5 : 10;
  return factor * magnitude;
}

export function chart(exams, values, selectedId, unit, lowerBetter, options = {}) {
  const shown = exams;
  const series = values;
  const present = series.filter((value) => value !== null);
  if (!present.length) return '<div class="empty">当前没有可绘制的记录。</div>';
  const minimum = Math.min(...present);
  const maximum = Math.max(...present);
  const step = niceStep(maximum - minimum);
  let low = Math.floor(minimum / step) * step;
  let high = Math.ceil(maximum / step) * step;
  if (low === high) { low -= step; high += step; }
  if (unit === '%') {
    low = Math.max(0, low);
    high = Math.min(100, high);
    if (high <= low) high = 100;
  }
  const compact = globalThis.matchMedia('(max-width: 760px)').matches && shown.length <= 6;
  const width = compact ? Math.max(320, 57 + shown.length * 43) : Math.max(614, 90 + shown.length * 53);
  const left = 43;
  const right = width - 19;
  const top = 24;
  const bottom = compact ? 158 : 140;
  const nameY = 163;
  const dateY = compact ? 179 : 183;
  const height = compact ? 189 : 198;
  const x = (index) => (shown.length === 1 ? (left + right) / 2 : left + 16 + (index * (right - left - 32)) / (shown.length - 1));
  const y = (value) => (lowerBetter ? top + ((value - low) * (bottom - top)) / (high - low) : bottom - ((value - low) * (bottom - top)) / (high - low));
  const format = (value) => (unit === '%' ? percent(value) : num(value));
  const coords = series.map((value, index) => (value === null ? null : [x(index), y(value)]));
  const groupKeys = options.groups || null;
  const segments = [];
  let segment = [];
  let segmentKey = null;
  coords.forEach((point, index) => {
    const key = groupKeys ? groupKeys[index] : null;
    if (!point) {
      if (segment.length) segments.push(segment);
      segment = [];
      segmentKey = null;
      return;
    }
    if (segment.length && groupKeys && segmentKey !== key) {
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    segmentKey = key;
  });
  if (segment.length) segments.push(segment);
  const ticks = [];
  for (let tick = low; tick <= high + step * 0.5; tick += step) ticks.push(tick);
  const active = shown.findIndex((exam) => exam.id === selectedId);
  const hitRadius = 22;
  const lines = segments.filter((item) => item.length > 1);
  return `<div class="plot"><svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" aria-label="${shown.length} 场考试的趋势图">
    <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#4054d0" stop-opacity=".16"/><stop offset="1" stop-color="#4054d0" stop-opacity=".01"/></linearGradient></defs>
    ${ticks.map((tick) => `<path d="M${left} ${y(tick)}H${right}" stroke="#e8ebf4" stroke-dasharray="3 4"/><text x="${left - 7}" y="${y(tick) + 4}" text-anchor="end">${format(unit === '%' ? tick : Math.round(tick))}</text>`).join('')}
    ${active >= 0 && coords[active] ? `<path d="M${x(active)} ${top}V${bottom}" stroke="#a6b2f0" stroke-dasharray="3 4"/>` : ''}
    ${lines.map((item) => {
      const path = item.map((point) => point.join(',')).join(' ');
      const area = `M${item[0][0]},${bottom} ${path} L${item[item.length - 1][0]},${bottom} Z`;
      return `<path d="${area}" fill="url(#chart-fill)"/><polyline points="${path}" fill="none" stroke="#4054d0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('')}
    ${shown.map((exam, index) => {
      const point = coords[index];
      const selected = index === active;
      const label = `${exam.name} ${exam.date} ${point ? format(series[index]) : '无数据'}`;
      const pointTarget = options.point === 'detail'
        ? `data-trend-point="${escapeHtml(exam.id)}"`
        : `data-exam="${escapeHtml(exam.id)}"`;
      const axis = compact
        ? `<text x="${x(index)}" y="${dateY}" text-anchor="middle" class="x-date${selected ? ' selected-label' : ''}">${dateLabel(exam.date)}</text>`
        : `<text x="${x(index)}" y="${nameY}" text-anchor="middle" class="x-name">${escapeHtml(truncate(exam.name, 6))}</text><text x="${x(index)}" y="${dateY}" text-anchor="middle" class="x-date${selected ? ' selected-label' : ''}">${dateLabel(exam.date)}</text>`;
      return `${point ? `<text x="${point[0]}" y="${point[1] - 11}" text-anchor="middle" class="${selected ? 'selected-label' : ''}">${format(series[index])}</text><circle class="point-dot" cx="${point[0]}" cy="${point[1]}" r="${selected ? 6 : 4}" stroke="#4054d0" stroke-width="2" fill="${selected ? '#4054d0' : 'white'}" aria-hidden="true"/><circle class="point-hit" ${pointTarget} role="button" tabindex="0" aria-label="${escapeHtml(label)}" cx="${point[0]}" cy="${point[1]}" r="${hitRadius}" fill="transparent"><title>${escapeHtml(label)}</title></circle>` : ''}${axis}`;
    }).join('')}
  </svg></div>`;
}

/**
 * 学科雷达图（能力画像，参考原型）。items = [{ subjectId, label, value, goal }]，
 * value/goal 为 0–100 得分率，goal 可为 null。刻度环 60/80/100（圆心 50%）。
 * 实线 = 近 3 次平均水平，虚线 = 目标（全轴有目标才连多边形，否则在有目标的轴打点）。
 * 轴标签为 SVG 文本「科目 XX%」（取整），不承载点击（下钻走能力页学科选择器）。
 */
export function radar(items) {
  const n = items.length;
  if (n < 3) return '';
  const R = 92;
  const cx = 140;
  const cy = 112;
  const rr = (value) => Math.max(0, Math.min(1, (value - 50) / 50));
  const pt = (index, r) => {
    const a = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    return [cx + R * r * Math.cos(a), cy + R * r * Math.sin(a)];
  };
  const ring = (level) => items.map((item, i) => pt(i, rr(level)).map((z) => z.toFixed(1)).join(',')).join(' ');
  const poly = (get) => items.map((item, i) => pt(i, rr(get(item))).map((z) => z.toFixed(1)).join(',')).join(' ');
  const allGoal = items.every((item) => item.goal !== null && item.goal !== undefined);
  // 顶部标签基线最浅约 y=3.44，加 12 单位顶部留白避免语文 78% 被截掉
  let out = '<svg viewBox="0 -12 280 242" class="radar-svg" role="img" aria-label="学科画像雷达图">';
  [60, 80, 100].forEach((level) => { out += `<polygon points="${ring(level)}" fill="none" class="radar-ring"/>`; });
  out += allGoal
    ? `<polygon points="${poly((item) => item.goal)}" fill="none" class="radar-goal"/>`
    : items.map((item, i) => {
        if (item.goal === null || item.goal === undefined) return '';
        const p = pt(i, rr(item.goal));
        return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" class="radar-goal-dot"/>`;
      }).join('');
  out += `<polygon points="${poly((item) => item.value)}" fill="var(--brand)" fill-opacity=".22" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>`;
  items.forEach((item, i) => {
    const q = pt(i, 1.18);
    out += `<text class="radar-t" x="${q[0].toFixed(1)}" y="${q[1].toFixed(1)}" text-anchor="middle">${escapeHtml(item.label)} ${Math.round(item.value)}%</text>`;
  });
  return `${out}</svg>`;
}
