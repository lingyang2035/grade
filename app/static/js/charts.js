import { dateLabel, escapeHtml, newestFirst, num, percent, state } from './core.js';
import { pageChoice } from './views/shared.js';

export function rangeSelect(exams) {
  if (exams.length <= 10) return '';
  return pageChoice('range-select', '趋势图场次范围', [['recent', '近 10 场'], ['all', '全部场次']], state.range, 'range-select');
}

export function stability(values, selected, lowerBetter) {
  const recent = values.slice(Math.max(0, selected - 4), selected + 1);
  const counts = { improved: 0, declined: 0, unchanged: 0 };
  for (let index = 1; index < recent.length; index++) {
    if (recent[index - 1] === null || recent[index] === null) continue;
    const difference = (recent[index] - recent[index - 1]) * (lowerBetter ? -1 : 1);
    if (difference > 0.005) counts.improved++;
    else if (difference < -0.005) counts.declined++;
    else counts.unchanged++;
  }
  if (!Object.values(counts).some(Boolean)) return '';
  return `<p class="stability"><strong>截至本场，近 ${recent.length} 场相邻变化</strong>　进步 ${counts.improved} 次 · 回落 ${counts.declined} 次 · 持平 ${counts.unchanged} 次</p>`;
}

export function chart(exams, values, selectedId, unit, lowerBetter) {
  const selectedIndex = exams.findIndex((exam) => exam.id === selectedId);
  const end = state.range === 'all' ? exams.length : Math.min(exams.length, Math.max(10, selectedIndex + 1));
  const start = state.range === 'all' ? 0 : Math.max(0, end - 10);
  const shown = exams.slice(start, end);
  const series = values.slice(start, end);
  const present = series.filter((value) => value !== null);
  if (!present.length) return '<div class="empty">当前没有可绘制的记录。</div>';
  const minimum = Math.min(...present);
  const maximum = Math.max(...present);
  const increment = maximum - minimum > 18 ? 5 : 1;
  const step = Math.max(1, Math.ceil((maximum - minimum) / 3 / increment) * increment);
  const low = Math.max(0, Math.floor(minimum / step) * step - step);
  const high = Math.min(unit === '%' ? 100 : Infinity, Math.ceil(maximum / step) * step + step);
  const compact = globalThis.matchMedia('(max-width: 760px)').matches && shown.length <= 6;
  const width = compact ? Math.max(320, 57 + shown.length * 43) : Math.max(614, 90 + shown.length * 53);
  const left = 43;
  const right = width - 19;
  const top = 23;
  const bottom = 158;
  const x = (index) => (shown.length === 1 ? (left + right) / 2 : left + 16 + (index * (right - left - 32)) / (shown.length - 1));
  const y = (value) => (lowerBetter ? top + ((value - low) * (bottom - top)) / (high - low) : bottom - ((value - low) * (bottom - top)) / (high - low));
  const format = (value) => (unit === '%' ? percent(value) : num(value));
  const coords = series.map((value, index) => (value === null ? null : [x(index), y(value)]));
  const groups = [];
  let group = [];
  coords.forEach((point) => {
    if (point) group.push(point);
    else if (group.length) {
      groups.push(group);
      group = [];
    }
  });
  if (group.length) groups.push(group);
  const ticks = Array.from({ length: 5 }, (_, index) => low + ((high - low) * index) / 4);
  const active = shown.findIndex((exam) => exam.id === selectedId);
  return `<div class="plot"><svg viewBox="0 0 ${width} 189" ${!compact && shown.length > 6 ? `style="min-width:${width}px"` : ''} aria-label="${shown.length} 场考试的趋势图">
    <defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#697bec" stop-opacity=".20"/><stop offset="1" stop-color="#697bec" stop-opacity=".015"/></linearGradient></defs>
    ${ticks.map((tick) => `<path d="M${left} ${y(tick)}H${right}" stroke="#e8ebf4" stroke-dasharray="3 4"/><text x="${left - 7}" y="${y(tick) + 4}" text-anchor="end">${format(unit === '%' ? tick : Math.round(tick))}</text>`).join('')}
    ${active >= 0 && coords[active] ? `<path d="M${x(active)} ${top}V${bottom}" stroke="#a6b2f0" stroke-dasharray="3 4"/>` : ''}
    ${groups.filter((item) => item.length > 1).map((item) => `<polygon points="${item[0][0]},${bottom} ${item.map((point) => point.join(',')).join(' ')} ${item[item.length - 1][0]},${bottom}" fill="url(#chart-fill)"/><polyline points="${item.map((point) => point.join(',')).join(' ')}" fill="none" stroke="#5267da" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    ${shown.map((exam, index) => {
      const point = coords[index];
      const selected = index === active;
      const label = `${exam.name} ${exam.date} ${point ? format(series[index]) : '无数据'}`;
      return `${point ? `<text x="${point[0]}" y="${point[1] - 11}" text-anchor="middle" class="${selected ? 'selected-label' : ''}">${format(series[index])}</text><circle class="point" data-exam="${exam.id}" role="button" tabindex="0" aria-label="${escapeHtml(label)}" cx="${point[0]}" cy="${point[1]}" r="${selected ? 6 : 4.5}" stroke="#5368df" stroke-width="2" fill="${selected ? '#5368df' : 'white'}"><title>${escapeHtml(label)}</title></circle>` : ''}<text x="${x(index)}" y="179" text-anchor="middle" class="${selected ? 'selected-label' : ''}">${dateLabel(exam.date)}</text>`;
    }).join('')}
  </svg></div>`;
}

export { newestFirst };
