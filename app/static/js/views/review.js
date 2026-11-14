import {
  escapeHtml,
  evidence,
  examMeta,
  examTotal,
  icon,
  paperLoss,
  num,
  scoreText,
  state,
  subjectName,
  subjects,
  tasks,
} from '../core.js';
import { pageChoice } from './shared.js';

export function reviewView(exam) {
  const selectedSubject = state.reviewSubject;
  const items = [...evidence().filter((item) => item.examId === exam.id && (!selectedSubject || item.subject === selectedSubject))].reverse();
  const losses = new Map();
  for (const item of items) {
    const label = `${subjectName(item.subject)} · ${item.skill}`;
    losses.set(label, (losses.get(label) || 0) + item.max - item.score);
  }
  const sortedLosses = [...losses].filter(([, points]) => points > 0).sort((a, b) => b[1] - a[1]);
  const totalLoss = sortedLosses.reduce((sum, [, points]) => sum + points, 0);
  const total = examTotal(exam);
  const scoredSubjects = subjects().filter((subject) => (!selectedSubject || subject.id === selectedSubject) && exam.scores[subject.id]);
  const wholeLoss = scoredSubjects.length ? scoredSubjects.reduce((sum, subject) => sum + paperLoss(exam, subject.id), 0) : null;
  const unscoredEvidenceLoss = items.filter((item) => !exam.scores[item.subject]).reduce((sum, item) => sum + Math.max(0, item.max - item.score), 0);
  const mismatchedSubjects = scoredSubjects.filter((subject) => items.filter((item) => item.subject === subject.id).reduce((sum, item) => sum + Math.max(0, item.max - item.score), 0) > paperLoss(exam, subject.id));
  const description = `${exam.date} · ${examMeta(exam)}${total ? ` · ${total.partialMock ? '已录小计' : '总分'} ${scoreText(total)}` : ''}`;
  const backView = state.reviewReturn?.view && state.reviewReturn.view !== 'review' ? state.reviewReturn.view : 'history';
  const backLabel = { history: '考试记录', overview: '学习总览', analysis: '成绩分析', subjects: '能力分析', week: '练习' }[backView] || '考试记录';
  return `<header class="review-heading">
      <div class="review-heading-row"><h2><span class="subpage-label">考后复盘</span><span>${escapeHtml(exam.name)}</span></h2><button class="link review-back" data-view="${backView}">‹ ${backLabel}</button></div>
      <p class="review-meta">${description}</p>
    </header>` +
    `<div class="analysis-filter review-filter"><span>复盘学科</span>${pageChoice('review-subject', '复盘学科', [['', '全部学科'], ...subjects().map((subject) => [subject.id, subject.name])], selectedSubject, '', true)}</div>
    <div class="review-grid"><article class="card"><div class="card-heading"><div><h3>${icon('target')}已记录题目失分</h3><p>${selectedSubject ? subjectName(selectedSubject) : '已录科目'}卷面失分 ${wholeLoss === null ? '待录入成绩' : `${num(wholeLoss)} 分`} · 题目已记 ${num(totalLoss)} 分${unscoredEvidenceLoss ? `<br>其中 ${num(unscoredEvidenceLoss)} 分的题目所属学科成绩尚未录入` : ''}${mismatchedSubjects.length ? `<br>${mismatchedSubjects.map((subject) => subject.name).join('、')}题目失分超出卷面失分，请核对记录` : ''}</p></div>${totalLoss ? `<span class="badge down">${num(totalLoss)} 分</span>` : ''}</div>
    ${sortedLosses.length ? `<div class="loss-list">${sortedLosses.map(([label, points]) => `<div class="loss-row"><div class="item-top"><strong>${escapeHtml(label)}</strong><span>${num(points)} 分</span></div><div class="loss-track" aria-hidden="true"><span class="loss-fill" style="width:${100 * points / sortedLosses[0][1]}%"></span></div></div>`).join('')}</div>` : '<div class="empty">还没有已记录的扣分。</div>'}</article>
    <article class="card"><div class="card-heading"><div><h3>${icon('book')}题目证据</h3><p>${items.length} 道题</p></div><button class="button primary" data-action="evidence">${icon('plus')}记录一道题</button></div>
    ${items.length ? `<div class="evidence-list">${items.map((item) => {
      const linked = tasks().find((task) => task.evidenceId === item.id && !task.result);
      return `<article class="evidence-item${state.reviewQuestion === item.id ? ' is-focused' : ''}" id="evidence-${escapeHtml(item.id)}"><div class="item-top"><strong>${escapeHtml(item.skill)}</strong><span class="badge">${num(item.score)} / ${num(item.max)} 分</span></div><div class="evidence-meta">${subjectName(item.subject)} · ${escapeHtml(item.question)}</div><p>知识点 ${escapeHtml(item.topic?.trim() || '待补录')} · 题型 ${escapeHtml(item.questionType?.trim() || '待补录')}</p>${item.reason ? `<p>${escapeHtml(item.reason)}</p>` : ''}<div class="inline-actions"><button class="link" ${linked ? 'data-view="week"' : `data-plan="${item.id}"`}>${linked ? '查看练习安排' : '安排练习'}</button><button class="link" data-edit-evidence="${item.id}">编辑证据</button></div></article>`;
    }).join('')}</div>` : '<div class="empty">从最值得回看的几道题开始。<br>录入题号、得分和孩子确认的错因。</div>'}</article></div>` +
    (exam.note ? `<p class="note"><b>本次复盘笔记</b>　${escapeHtml(exam.note)}</p>` : '') +
    '<div class="review-print"><button class="link" data-action="print">打印复盘</button></div>';
}
