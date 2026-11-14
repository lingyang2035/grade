import {
  appVersion,
  cohort,
  data,
  escapeHtml,
  icon,
  isAdmin,
  isDemo,
  num,
  percent,
  phoneLayout,
  scoreMaxima,
  state,
  subjectName,
  subjects,
  target,
  targetRate,
  user,
} from '../core.js';
import { adminPanel } from './admin.js';
import { mobilePageHeading, sectionHead } from './shared.js';

function accountPanel() {
  const base = document.querySelector('meta[name="app-base"]')?.content || '/';
  const profile = user();
  const admin = isAdmin();
  const csrf = state.boot?.csrfToken || '';
  const meta = [profile.username, admin ? '管理员' : '', profile.familyName].filter(Boolean).join(' · ');
  return `<section class="card"><div class="account-profile-row"><div><strong>${escapeHtml(profile.name)}</strong><p>${escapeHtml(meta)}</p></div><button class="link action-link" data-action="edit-account">${icon('edit')}编辑</button></div></section>
    <div class="ios-group account-actions">
    <button class="ios-row" data-action="logs"><span class="ios-row-label"><span class="row-icon">${icon('list')}</span><span>操作日志</span></span><span class="row-chevron" aria-hidden="true">›</span></button>
    <a class="ios-row" href="${escapeHtml(base)}password"><span class="ios-row-label"><span class="row-icon">${icon('key')}</span><span>修改密码</span></span><span class="row-chevron" aria-hidden="true">›</span></a>
    <form class="ios-row-form" method="post" action="${escapeHtml(base)}logout"><input type="hidden" name="csrf_token" value="${escapeHtml(csrf)}"><button class="ios-row" type="submit"><span class="ios-row-label"><span class="row-icon">${icon('logout')}</span><span>退出登录</span></span><span class="row-chevron" aria-hidden="true">›</span></button></form>
    </div>`;
}

function learningSections(editable) {
  const profile = data().profile;
  const counts = cohort();
  const stageTarget = target();
  const countText = (count) => (count ? `${num(count)} 人` : '未设置');
  const maximaSummary = (template) => {
    const entries = Object.entries(scoreMaxima()[template] || {})
      .filter(([, max]) => max != null)
      .map(([id, max]) => `${subjectName(id)} ${num(max)}`);
    return entries.length ? entries.join(' · ') : '全部未设置';
  };
  return `<section class="card"><div class="card-heading"><div><h3>${icon('book')}学习档案</h3></div></div>
    <div class="settings-row"><div><strong>${escapeHtml(profile.studentName || '填写学生资料')}</strong><p>${escapeHtml([profile.grade, profile.className].filter(Boolean).join(' · ') || '年级、班级待填写')}</p></div>${editable ? `<button class="link" data-action="learning-profile">${icon('edit')}编辑资料</button>` : ''}</div>
    <div class="settings-row"><div><strong>班级与年级人数</strong><p>班级 ${countText(counts.classCount)} · 年级 ${countText(counts.gradeCount)}</p></div>${editable ? `<button class="link" data-action="cohort">${icon('people')}设置人数</button>` : ''}</div></section>
    <section class="card"><div class="card-heading"><div><h3>${icon('score')}考试满分</h3></div></div>
    <div class="settings-row"><div><strong>中考满分</strong><p>${escapeHtml(maximaSummary('mock'))}</p></div>${editable ? `<button class="link" data-action="score-maxima" data-template="mock">${icon('gear')}设置</button>` : ''}</div>
    <div class="settings-row"><div><strong>平时考试满分</strong><p>${escapeHtml(maximaSummary('regular'))}</p></div>${editable ? `<button class="link" data-action="score-maxima" data-template="regular">${icon('gear')}设置</button>` : ''}</div></section>
    <section class="card"><div class="card-heading"><div><h3>${icon('target')}学习目标</h3></div></div>
    <div class="settings-row"><div><strong>阶段排名目标</strong><p>${stageTarget ? `年级前 ${num(stageTarget)} 名` : '尚未设置'}</p></div>${editable ? `<button class="link" data-action="goal">${icon('target')}设置</button>` : ''}</div>
    <div class="settings-row"><div><strong>各科目标得分率</strong></div>${editable ? `<button class="link" data-action="subject-targets">${icon('gear')}设置</button>` : ''}</div>
    <div class="settings-targets">${subjects().map((subject) => {
      const rate = targetRate(subject.id);
      return `<span>${subject.name}<b class="${rate === null ? 'unset' : ''}">${rate === null ? '未设置' : percent(rate)}</b></span>`;
    }).join('')}</div></section>`;
}

export function accountView() {
  const admin = isAdmin();
  const tabs = [['account', '账号'], ['exam', '考试设置']];
  if (admin) tabs.push(['admin', '账号管理']);
  const allowed = new Set(tabs.map(([id]) => id));
  const active = allowed.has(state.settingsTab) ? state.settingsTab : 'account';
  const panel = active === 'admin' ? adminPanel()
    : active === 'exam' ? `<div class="settings-grid">${learningSections(!isDemo())}</div>`
      : accountPanel();
  const heading = phoneLayout() ? mobilePageHeading('设置') : sectionHead('设置', '');
  return heading +
    `<div class="analysis-tabs settings-tabs" role="group" aria-label="设置栏目">${tabs.map(([id, label]) => `<button type="button" data-settings-tab="${id}" aria-pressed="${active === id}">${label}</button>`).join('')}</div>
    <div class="settings-panel">${panel}</div>
    <p class="app-version">${escapeHtml(appVersion())}</p>${isDemo() ? '<p class="ledger-source">当前为演示数据，只读；切回「我的记录」查看本家庭数据。</p>' : ''}`;
}
