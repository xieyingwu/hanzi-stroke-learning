// ============================================================
//  我的 - 登录 / 个人信息
// ============================================================
const ME_STORAGE_KEY = 'hanzi_user';

function getUserData() {
  try { return JSON.parse(localStorage.getItem(ME_STORAGE_KEY)) || null; } catch { return null; }
}
function setUserData(data) {
  localStorage.setItem(ME_STORAGE_KEY, JSON.stringify(data));
}

function refreshMePage() {
  const user = getUserData();
  if (user && user.loggedIn) {
document.getElementById('meLogin').style.display = 'none';
document.getElementById('meProfile').style.display = 'block';
// 头像
const avatarEl = document.getElementById('profileAvatar');
if (user.avatarUrl) {
  avatarEl.innerHTML = '<img src="' + user.avatarUrl + '" alt="头像">';
} else {
  avatarEl.textContent = '🐼';
}
// 昵称
document.getElementById('profileName').textContent = user.nickname || '用户';
document.getElementById('profilePhone').textContent = maskPhone(user.phone || '');
document.getElementById('profileJoinDate').textContent = '加入于 ' + (user.joinDate || '2026-04-14');
// 信息行
document.getElementById('infoNickname').textContent = user.nickname || '未设置';
document.getElementById('infoGender').textContent = user.gender || '未设置';
document.getElementById('infoAge').textContent = user.age ? user.age + '岁' : '未设置';
document.getElementById('infoBio').textContent = user.bio || '未设置';
// 统计（与顶栏、学习页共用 ProgressStore）
const stars = ProgressStore.getStars();
const learned = ProgressStore.getLearnedCount();
const streakDays = ProgressStore.getStreak();
document.getElementById('meStars').textContent = stars;
document.getElementById('meLearned').textContent = learned;
document.getElementById('meDays').textContent = streakDays;
  } else {
document.getElementById('meLogin').style.display = '';
document.getElementById('meProfile').style.display = 'none';
  }
}

function maskPhone(phone) {
  if (phone.length >= 7) return phone.substring(0, 3) + '****' + phone.substring(7);
  return phone;
}

function handleLogin() {
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!/^1\d{10}$/.test(phone)) { showToast('📱 请输入正确的手机号'); return; }
  if (password.length < 6) { showToast('🔑 密码至少6位'); return; }
  const user = {
loggedIn: true,
phone: phone,
nickname: '',
gender: '',
age: '',
bio: '',
avatarUrl: '',
joinDate: new Date().toISOString().split('T')[0]
  };
  setUserData(user);
  document.getElementById('loginPassword').value = '';
  showToast('🎉 登录成功！');
  refreshMePage();
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  localStorage.removeItem(ME_STORAGE_KEY);
  showToast('已退出登录');
  refreshMePage();
}

// --- 编辑字段 ---
let currentEditField = '';
const fieldConfig = {
  nickname: { title: '编辑昵称', placeholder: '请输入昵称', type: 'text' },
  gender:   { title: '选择性别', placeholder: '请输入性别（男/女/其他）', type: 'text' },
  age:      { title: '编辑年龄', placeholder: '请输入年龄', type: 'number' },
  bio:      { title: '编辑个性签名', placeholder: '写点什么介绍自己吧', type: 'text' }
};

function openEditField(field) {
  const cfg = fieldConfig[field];
  if (!cfg) return;
  currentEditField = field;
  const user = getUserData();
  document.getElementById('editModalTitle').textContent = cfg.title;
  const input = document.getElementById('editInput');
  input.type = cfg.type;
  input.placeholder = cfg.placeholder;
  input.value = user[field] || '';
  document.getElementById('editModalOverlay').classList.add('active');
  setTimeout(() => input.focus(), 300);
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.remove('active');
  currentEditField = '';
}

function saveEditField() {
  const val = document.getElementById('editInput').value.trim();
  if (!val) { showToast('内容不能为空'); return; }
  if (currentEditField === 'age' && (isNaN(val) || val < 1 || val > 150)) {
showToast('请输入有效年龄（1-150）'); return;
  }
  const user = getUserData();
  user[currentEditField] = val;
  setUserData(user);
  closeEditModal();
  showToast('✅ 保存成功');
  refreshMePage();
}

// 点击遮罩关闭编辑弹窗
document.getElementById('editModalOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeEditModal();
});

// ============================================================