import { escapeHtml, evidence, icon, phoneLayout, tasks } from '../core.js';
import { mobilePageHeading, sectionHead } from './shared.js';

export function weekView() {
  const all = [...tasks()].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  const pending = all.filter((task) => !task.result).length;
  const summary = `待复测 ${pending} 项 · 已复测 ${all.length - pending} 项`;
  const plan = `<button class="button primary" data-action="plan">${icon('plus')}安排练习</button>`;
  const heading = phoneLayout()
    ? mobilePageHeading('练习与复测', plan, `<p>${summary}</p>`)
    : sectionHead('练习与复测', summary, plan);
  return heading +
    (all.length ? `<div class="task-list">${all.map((task) => {
      const item = evidence().find((entry) => entry.id === task.evidenceId);
      const result = task.result;
      return `<article class="task"><div class="item-top"><span class="badge ${result ? 'up' : 'brand'}">${result ? '已复测' : '待复测'}</span><span class="evidence-meta">${escapeHtml(task.due)} 前</span></div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.plan)}</p>
        ${result ? `<div class="task-result">${icon('check')} ${result.correct} / ${result.total} 道题正确 · ${result.hints ? '使用提示' : '独立完成'}${result.note ? `<br>${escapeHtml(result.note)}` : ''}</div>` : ''}
        <div class="inline-actions"><button class="link" data-retest="${task.id}">${result ? '修改复测结果' : '记录复测结果'}</button>${item ? `<button class="link" data-review="${item.examId}" data-review-subject="${item.subject}" data-review-question="${item.id}">查看题目来源</button>` : ''}</div></article>`;
    }).join('')}</div>` : '<article class="card empty"><strong>还没有安排练习</strong>可以从一道错题开始，也可以直接写下想验证的能力。</article>');
}
