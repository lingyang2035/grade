import { escapeHtml, icon, phoneLayout, state, user } from '../core.js';
import { sectionHead } from './shared.js';

export function adminPanel() {
  const admin = state.boot.admin;
  if (!admin) return sectionHead('账号管理', '仅管理员可访问。');
  const currentId = user().id;
  const add = `<div class="admin-add-row"><button class="link" data-action="create-user">${icon('plus')}添加账号</button></div>`;
  const badge = (account) => {
    if (account.id === currentId) return '<span class="badge brand">当前账号</span>';
    if (!account.active) return '<span class="badge">已停用</span>';
    return '';
  };
  return `${add}
    <div class="ios-group account-list">${admin.accounts.map((account) => `<button class="ios-row account-row" data-open-account="${escapeHtml(account.id)}">
      <span><strong>${escapeHtml(account.name)}</strong>${account.isAdmin ? ' <span class="badge brand">管理员</span>' : ''}<small>${escapeHtml(account.username)}</small></span>
      <span class="ios-row-end">${badge(account)}<span class="row-chevron" aria-hidden="true">›</span></span>
    </button>`).join('') || '<div class="empty">还没有账号。</div>'}</div>
    <details class="admin-families"><summary>家庭管理</summary>
      <div class="inline-actions"><button class="button" data-action="create-family">${icon('plus')}新增家庭</button></div>
      <div class="ios-group">${admin.families.map((family) => `<button class="ios-row admin-family" data-edit-family="${escapeHtml(family.id)}"><span><strong>${escapeHtml(family.name)}</strong><small>${escapeHtml([family.studentName, family.grade, family.className].filter(Boolean).join(' · ') || '学生资料待填写')} · ${family.accountCount} 个账号</small></span><span class="row-chevron" aria-hidden="true">›</span></button>`).join('') || '<div class="empty">还没有家庭。</div>'}</div>
    </details>`;
}
