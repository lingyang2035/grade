import {
  escapeHtml,
  examKindLabel,
  examKinds,
  examScopeLabel,
  examScopes,
  examTotal,
  icon,
  isAdmin,
  isDemo,
  newestFirst,
  num,
  phoneLayout,
  rankShareLabel,
  scoreText,
  state,
} from '../core.js';
import { mobilePageHeading, pageChoice, sectionHead } from './shared.js';

function filterPanel() {
  const kind = state.historyKindFilter;
  const scope = state.historyScopeFilter;
  const active = Boolean(kind || scope);
  return `<details class="history-filter"${active ? ' open' : ''}><summary>筛选${active ? ` · ${escapeHtml([kind ? examKindLabel(kind) : '', scope ? examScopeLabel(scope) : ''].filter(Boolean).join(' · '))}` : ''}</summary>
    <div class="history-filter-body">
      <div class="form-grid">${pageChoice('history-kind-filter', '考试类型', [['', '全部类型'], ...Object.entries(examKinds())], kind)}${pageChoice('history-scope-filter', '参考范围', [['', '全部范围'], ...Object.entries(examScopes())], scope)}</div>
      ${active ? '<div class="history-active"><span>仅显示符合条件的考试</span><button class="link" data-action="clear-history-filter">清除筛选</button></div>' : ''}
    </div></details>`;
}

export function historyView(exams) {
  const add = !isDemo() ? `<button class="button primary" data-action="add">${icon('plus')}录入考试</button>` : '';
  const mobile = phoneLayout();
  const kind = state.historyKindFilter;
  const scope = state.historyScopeFilter;
  const shown = exams.filter((exam) => (!kind || exam.kind === kind) && (!scope || exam.scope === scope));
  const heading = mobile
    ? mobilePageHeading('考试记录', add)
    : sectionHead('考试记录', exams.length ? `共 ${exams.length} 场` : '', `<div class="inline-actions">${add}</div>`);
  const tools = filterPanel();
  if (!exams.length) return heading + '<article class="card empty"><strong>还没有考试记录</strong></article>';
  if (!shown.length) return heading + tools + `<article class="card empty"><strong>没有符合筛选条件的考试</strong><p>清除筛选后查看全部记录。</p><button class="button" data-action="clear-history-filter">清除筛选</button></article>`;
  const canDelete = isAdmin() && !isDemo();
  return heading + tools +
    `<article class="card history-card"><div class="table-wrap"><table><thead><tr><th scope="col">考试</th><th scope="col">日期</th><th scope="col">本场考试总分</th><th scope="col">班级排名</th><th scope="col">年级排名</th><th scope="col">操作</th></tr></thead><tbody>${newestFirst(shown).map((exam) => {
      const total = examTotal(exam);
      const rank = (key) => (exam[`${key}Rank`] ? `${num(exam[`${key}Rank`])}${exam[`${key}Count`] ? ` / ${num(exam[`${key}Count`])}` : ''}${rankShareLabel(exam, key) ? `<div class="evidence-meta">${rankShareLabel(exam, key)}</div>` : ''}` : '—');
      const totalDisplay = total ? `${total.partialMock ? '<span class="badge">已录小计</span> ' : ''}${scoreText(total)} <span class="faint history-subject-count">· ${total.count} 科</span>` : '—';
      const saved = state.savedExamId === exam.id;
      return `<tr${saved ? ' data-saved-exam="1" class="is-saved"' : ''}><td><b>${escapeHtml(exam.name)}</b>${saved ? ' <span class="badge up">已保存</span>' : ''}<div class="evidence-meta">${escapeHtml(examKindLabel(exam.kind))} · ${escapeHtml(examScopeLabel(exam.scope))}${exam.orgName ? ` · ${escapeHtml(exam.orgName)}` : ''}</div></td><td>${exam.date}</td><td data-label="${total?.partialMock ? '' : '总分'}">${totalDisplay}</td><td data-label="班级">${rank('class')}</td><td data-label="年级">${rank('grade')}</td><td><div class="inline-actions"><button class="link" data-exam="${exam.id}">看成绩</button><button class="link" data-review="${exam.id}">复盘</button>${!isDemo() ? `<button class="link" data-edit="${exam.id}">编辑</button>` : ''}${canDelete ? `<button class="link danger-link" data-action="delete-exam" data-delete-exam="${exam.id}">删除</button>` : ''}</div></td></tr>`;
    }).join('')}</tbody></table></div></article>`;
}
