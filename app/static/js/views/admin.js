import { escapeHtml, icon, phoneLayout, state, user } from '../core.js';
import { sectionHead } from './shared.js';

export function adminPanel() {
  const admin = state.boot.admin;
  if (!admin) return sectionHead('账号管理', '仅管理员可访问。');
  const currentId = user().id;
  const badge = (account) => {
    const marks = [];
    if (account.isAdmin) marks.push(`<span class="row-badge-icon" role="img" aria-label="管理员" title="管理员">${icon('shield')}</span>`);
    if (account.id === currentId) marks.push(`<span class="row-badge-icon current" role="img" aria-label="当前账号" title="当前账号">${icon('check')}</span>`);
    if (!account.active) marks.push('<span class="badge">已停用</span>');
    return marks.join('');
  };
  return `<div class="ios-group account-list">${admin.accounts.map((account) => `<button class="ios-row account-row" data-open-account="${escapeHtml(account.id)}">
      <span><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.username)}</small></span>
      <span class="ios-row-end">${badge(account)}<span class="row-chevron" aria-hidden="true">›</span></span>
    </button>`).join('') || '<div class="empty">还没有账号。</div>'}
      <button class="ios-row add-row" data-action="create-user"><span class="ios-row-label"><span class="row-icon">${icon('plus')}</span><span>添加账号</span></span><span class="row-chevron" aria-hidden="true">›</span></button>
    </div>
    <details class="admin-families"><summary>家庭管理 · ${admin.families.length} 个</summary>
      <div class="ios-group">${admin.families.map((family) => `<button class="ios-row admin-family" data-edit-family="${escapeHtml(family.id)}"><span><strong>${escapeHtml(family.name)}</strong><small>${escapeHtml([family.studentName, family.grade, family.className].filter(Boolean).join(' · ') || '学生资料待填写')} · ${family.accountCount} 个账号</small></span><span class="row-chevron" aria-hidden="true">›</span></button>`).join('') || '<div class="empty">还没有家庭。</div>'}
        <button class="ios-row add-row" data-action="create-family"><span class="ios-row-label"><span class="row-icon">${icon('plus')}</span><span>新增家庭</span></span><span class="row-chevron" aria-hidden="true">›</span></button>
      </div>
    </details>`;
}
