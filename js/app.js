// ============================================================
//  Toast / 吉祥物
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
function setMascotMsg(msg) {
  document.getElementById('mascotMsg').textContent = msg;
}

// ============================================================
//  底部 Tab 切换
// ============================================================
function switchTab(tab, el) {
  // 复习、排行：仅弹 toast，不改变当前页面和导航高亮
  if (tab === 'review' || tab === 'rank') {
    showToast('🚧 该功能即将推出！');
    return;
  }

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  const msgs = {
    learn: '点击汉字卡片开始学习笔顺！✏️',
    me:    '这是你的个人空间！🐼'
  };
  setMascotMsg(msgs[tab] || '');

  // 切换页面显示
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  const pageMap = { learn: 'learnPage', me: 'mePage' };
  const targetPage = document.getElementById(pageMap[tab]);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  if (tab === 'me') {
    refreshMePage();
  }
}

//  触摸下滑关闭弹层
// ============================================================
let touchStartY = 0;
document.getElementById('modalSheet').addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });
document.getElementById('modalSheet').addEventListener('touchmove', e => {
  if (e.touches[0].clientY - touchStartY > 60) closeModal();
}, { passive: true });

// ============================================================
//  启动
// ============================================================
init();
