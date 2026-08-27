/* ============================================================
   赛博干饭人 · 热量与食谱复盘生成器
   核心交互逻辑
   ============================================================ */

(function () {
  'use strict';

  // ---------- 全局状态 ----------
  const state = {
    config: null,
    foods: [],
    targetCalories: 0,
    targetSet: false,
    selectedFoods: [],   // {uid, id, name, emoji, amount, unit, kcal, totalKcal, meal}
    filterCategory: 'all',
    theme: 'cream',
    size: '3:4',
    date: '',
    statusTag: '🥗 完美轻断食',
    uidCounter: 1,
    pendingFood: null,   // 待确认添加的食物
  };

  const STORAGE_KEY = 'cyber_foodie_total_processed';

  // ---------- DOM 引用 ----------
  const $ = (id) => document.getElementById(id);

  // ---------- 初始化 ----------
  async function init() {
    try {
      await loadConfig();
      await loadFoods();
    } catch (err) {
      console.error('初始化失败:', err);
      alert('配置文件加载失败，请确保通过 HTTP 服务器访问（如 GitHub Pages / 本地 server）');
      return;
    }

    setDefaultDate();
    // 同步输入框默认值，有默认值直接解锁
    const initTarget = parseInt($('targetCalories').value, 10);
    if (initTarget && initTarget > 0) {
      state.targetCalories = initTarget;
      state.targetSet = true;
      $('targetHint').textContent = `✅ 目标已设置：${initTarget} kcal，开始挑选食物吧！`;
      $('targetHint').classList.add('success');
    }
    renderFoodGrid();
    bindEvents();
    updatePreview();
    startTimestamp();
    updateFoodMask();

    // 每次打开网站自动弹出免责声明
    showModal('disclaimerModal');
  }

  // ---------- 加载配置 ----------
  async function loadConfig() {
    const res = await fetch('config.json?t=' + Date.now());
    if (!res.ok) throw new Error('config.json 加载失败');
    state.config = await res.json();

    // 应用配置
    document.title = state.config.siteTitle || '赛博干饭人';
    if (state.config.avatar) {
      $('navAvatar').src = state.config.avatar;
      $('modalAvatar').src = state.config.avatar;
    }
    if (state.config.author) {
      $('navAuthor').textContent = state.config.author;
      $('modalAuthor').textContent = state.config.author;
      $('cardAuthor').textContent = state.config.author;
    }
    if (state.config.homepage) {
      $('navHomepage').href = state.config.homepage;
    }
    if (state.config.wechat) {
      $('modalWechat').textContent = state.config.wechat;
    }
    if (state.config.qrcode) {
      $('modalQrcode').src = state.config.qrcode;
      $('catQrcode').src = state.config.qrcode;
    }

    // 渲染帮助文档（从 config 读取）
    if (state.config.helpTitle) {
      $('helpTitle').textContent = state.config.helpTitle;
    }
    if (Array.isArray(state.config.helpContent) && state.config.helpContent.length) {
      let html = '';
      state.config.helpContent.forEach((item) => {
        html += `<p><strong>${item.step || ''}</strong>${item.text ? '：' + item.text : ''}</p>`;
      });
      if (state.config.helpTip) {
        html += `<p class="help-tip">${state.config.helpTip}</p>`;
      }
      $('helpContent').innerHTML = html;
    }
  }

  // ---------- 加载食物库 ----------
  async function loadFoods() {
    const res = await fetch('foods.json');
    if (!res.ok) throw new Error('foods.json 加载失败');
    state.foods = await res.json();
  }

  // ---------- 默认日期 ----------
  function setDefaultDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    state.date = `${y}-${m}-${d}`;
    $('dateInput').value = state.date;
  }

  // ---------- 日期格式验证 ----------
  function isValidDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 第一步：目标热量（输入即生效）
    $('targetCalories').addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (val && val > 0) {
        state.targetCalories = val;
        state.targetSet = true;
        $('targetHint').textContent = `✅ 目标已设置：${val} kcal，开始挑选食物吧！`;
        $('targetHint').classList.add('success');
      } else {
        state.targetCalories = 0;
        state.targetSet = false;
        $('targetHint').textContent = '⚠ 请先输入目标热量，才能开始挑选食物';
        $('targetHint').classList.remove('success');
      }
      updateFoodMask();
      updatePreview();
    });

    // 主题切换（下拉菜单，只改卡片）
    $('themeSelect').addEventListener('change', (e) => {
      state.theme = e.target.value;
      applyTheme();
    });

    // 日期（手动输入 + 格式验证）
    $('dateInput').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val === '') {
        $('dateHint').style.display = 'none';
        return;
      }
      if (isValidDate(val)) {
        state.date = val;
        $('dateHint').style.display = 'none';
        updatePreview();
      } else {
        $('dateHint').style.display = 'block';
      }
    });

    // 日历选择按钮：弹出系统日期选择器
    $('datePickerBtn').addEventListener('click', () => {
      const hidden = $('datePickerHidden');
      if (state.date) hidden.value = state.date;
      try {
        hidden.showPicker();
      } catch (e) {
        hidden.click();
      }
    });
    $('datePickerHidden').addEventListener('change', (e) => {
      if (e.target.value) {
        $('dateInput').value = e.target.value;
        state.date = e.target.value;
        $('dateHint').style.display = 'none';
        updatePreview();
      }
    });

    // 状态标签
    $('statusTag').addEventListener('change', (e) => {
      state.statusTag = e.target.value;
      updatePreview();
    });

    // 食物筛选
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.filterCategory = btn.dataset.filter;
        renderFoodGrid();
      });
    });

    // 关注我弹窗
    $('followBtn').addEventListener('click', () => showModal('followModal'));
    $('followClose').addEventListener('click', () => hideModal('followModal'));

    // 警告弹窗
    $('warnOk').addEventListener('click', () => hideModal('warnModal'));

    // 数量弹窗
    $('amountCancel').addEventListener('click', () => hideModal('amountModal'));
    $('amountConfirm').addEventListener('click', confirmAddFood);
    $('amountInput').addEventListener('input', updateAmountTotal);
    $('amountInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmAddFood();
    });

    // 下载
    $('downloadBtn').addEventListener('click', downloadImage);

    // 猫咪弹窗关闭
    $('catCloseBtn').addEventListener('click', () => hideModal('catModal'));

    // 帮助弹窗
    $('helpBtn').addEventListener('click', () => showModal('helpModal'));
    $('helpClose').addEventListener('click', () => hideModal('helpModal'));

    // 免责声明弹窗：勾选后启用按钮
    $('disclaimerCheck').addEventListener('change', (e) => {
      $('disclaimerBtn').disabled = !e.target.checked;
    });
    $('disclaimerBtn').addEventListener('click', () => hideModal('disclaimerModal'));

  }

  // ---------- 应用主题（只改卡片，全局UI固定奶油风） ----------
  function applyTheme() {
    const card = $('previewCard');
    card.className = 'preview-card theme-' + state.theme;
  }

  // ---------- 食物区域遮罩 ----------
  function updateFoodMask() {
    if (state.targetSet) {
      $('foodMask').classList.remove('show');
    } else {
      $('foodMask').classList.add('show');
    }
  }

  // ---------- 渲染食物网格 ----------
  function renderFoodGrid() {
    const grid = $('foodGrid');
    grid.innerHTML = '';

    const list = state.filterCategory === 'all'
      ? state.foods
      : state.foods.filter((f) => f.category === state.filterCategory);

    if (list.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:20px 0;">暂无该分类食物</p>';
      return;
    }

    list.forEach((food) => {
      const item = document.createElement('div');
      item.className = 'food-item';
      item.innerHTML = `
        <div class="food-info">
          <div class="food-emoji">${food.emoji}</div>
          <div class="food-name">${food.name}</div>
          <div class="food-kcal">${food.kcal} kcal/${food.unit}</div>
        </div>
        <button class="food-add-btn" data-id="${food.id}" title="添加">+</button>
      `;
      item.querySelector('.food-add-btn').addEventListener('click', () => openAmountModal(food));
      grid.appendChild(item);
    });
  }

  // ---------- 打开数量输入弹窗 ----------
  function openAmountModal(food) {
    if (!state.targetSet) {
      alert('请先设置今日计划总热量！');
      return;
    }
    state.pendingFood = food;
    $('amountFoodName').textContent = `${food.emoji} ${food.name}`;
    $('amountFoodKcal').textContent = `单位热量：${food.kcal} kcal / ${food.unit}`;
    $('amountUnit').textContent = food.unit;
    const isPortion = food.unit === '份' || food.unit === '杯';
    const input = $('amountInput');
    if (isPortion) {
      input.value = 1;
      input.setAttribute('step', '1');
      input.setAttribute('min', '1');
    } else {
      input.value = 100;
      input.setAttribute('step', '10');
      input.setAttribute('min', '10');
    }
    updateAmountTotal();
    showModal('amountModal');
    setTimeout(() => $('amountInput').focus(), 100);
  }

  // ---------- 更新数量弹窗的总热量 ----------
  function updateAmountTotal() {
    if (!state.pendingFood) return;
    const amount = parseFloat($('amountInput').value) || 0;
    const food = state.pendingFood;
    // 单位是 100g / 100ml 时按比例，份/杯时直接乘
    let total;
    if (food.unit === '100g' || food.unit === '100ml') {
      total = Math.round((food.kcal * amount) / 100);
    } else {
      total = Math.round(food.kcal * amount);
    }
    $('amountTotal').textContent = total;
  }

  // ---------- 确认添加食物 ----------
  function confirmAddFood() {
    if (!state.pendingFood) return;
    const food = state.pendingFood;
    const amount = parseFloat($('amountInput').value) || 0;
    if (amount <= 0) {
      alert('请输入有效的数量');
      return;
    }

    let totalKcal;
    if (food.unit === '100g' || food.unit === '100ml') {
      totalKcal = Math.round((food.kcal * amount) / 100);
    } else {
      totalKcal = Math.round(food.kcal * amount);
    }

    // 硬拦截：超标警告
    const currentTotal = getTotalCalories();
    if (currentTotal + totalKcal > state.targetCalories) {
      $('warnCurrent').textContent = currentTotal + totalKcal;
      $('warnTarget').textContent = state.targetCalories;
      showModal('warnModal');
      hideModal('amountModal');
      state.pendingFood = null;
      return;
    }

    // 添加到已选
    state.selectedFoods.push({
      uid: state.uidCounter++,
      id: food.id,
      name: food.name,
      emoji: food.emoji,
      amount: amount,
      unit: food.unit,
      kcal: food.kcal,
      totalKcal: totalKcal,
      meal: null,
    });

    hideModal('amountModal');
    state.pendingFood = null;
    renderSelectedFoods();
    renderMealAreas();
    updatePreview();
  }

  // ---------- 获取已选总热量 ----------
  function getTotalCalories() {
    return state.selectedFoods.reduce((sum, f) => sum + f.totalKcal, 0);
  }

  // ---------- 渲染已选食物区 ----------
  function renderSelectedFoods() {
    const container = $('selectedFoods');
    container.innerHTML = '';

    if (state.selectedFoods.length === 0) {
      container.innerHTML = '<p class="empty-hint">🍽️ 还没有选择食物，去上方添加吧</p>';
      return;
    }

    state.selectedFoods.forEach((food) => {
      const chip = document.createElement('div');
      chip.className = 'selected-chip';

      const isPortion = food.unit === '份' || food.unit === '杯';
      const unitLabel = food.unit === '100g' ? 'g' : food.unit === '100ml' ? 'ml' : food.unit;
      const step = isPortion ? '1' : '10';
      const min = isPortion ? '1' : '10';

      chip.innerHTML = `
        <span class="chip-emoji">${food.emoji}</span>
        <span class="chip-name" title="${food.name}">${food.name}</span>
        <span class="chip-amount-wrap">
          <input type="number" class="chip-amount-input" value="${food.amount}" min="${min}" step="${step}" data-uid="${food.uid}">
          <span class="chip-amount-unit">${unitLabel}</span>
        </span>
        <span class="chip-kcal">${food.totalKcal}kcal</span>
        <button class="chip-remove" data-uid="${food.uid}" title="删除">×</button>
        <span class="chip-meal-btns">
          <button class="chip-meal-btn ${food.meal === 'breakfast' ? 'active' : ''}" data-meal="breakfast">🌅 早餐</button>
          <button class="chip-meal-btn ${food.meal === 'lunch' ? 'active' : ''}" data-meal="lunch">☀️ 午餐</button>
          <button class="chip-meal-btn ${food.meal === 'dinner' ? 'active' : ''}" data-meal="dinner">🌙 晚餐</button>
        </span>
      `;

      // 删除
      chip.querySelector('.chip-remove').addEventListener('click', () => removeFood(food.uid));

      // 修改数量
      const amountInput = chip.querySelector('.chip-amount-input');
      amountInput.addEventListener('change', () => {
        let val = parseInt(amountInput.value, 10);
        if (isNaN(val) || val < parseInt(min, 10)) {
          val = parseInt(min, 10);
          amountInput.value = val;
        }
        updateFoodAmount(food.uid, val);
      });

      // 餐次分配（点击切换：再次点击同一餐次则取消）
      chip.querySelectorAll('.chip-meal-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const meal = btn.dataset.meal;
          const target = state.selectedFoods.find((f) => f.uid === food.uid);
          if (target) {
            target.meal = target.meal === meal ? null : meal;
          }
          renderSelectedFoods();
          renderMealAreas();
          updatePreview();
        });
      });

      container.appendChild(chip);
    });
  }

  // ---------- 修改已选食物数量 ----------
  function updateFoodAmount(uid, newAmount) {
    const food = state.selectedFoods.find((f) => f.uid === uid);
    if (!food) return;
    food.amount = newAmount;
    if (food.unit === '100g' || food.unit === '100ml') {
      food.totalKcal = Math.round((food.kcal * newAmount) / 100);
    } else {
      food.totalKcal = Math.round(food.kcal * newAmount);
    }
    renderSelectedFoods();
    renderMealAreas();
    updatePreview();
  }

  // ---------- 渲染三餐区域 ----------
  function renderMealAreas() {
    const meals = { breakfast: [], lunch: [], dinner: [] };
    state.selectedFoods.forEach((f) => {
      if (f.meal && meals[f.meal]) meals[f.meal].push(f);
    });

    ['breakfast', 'lunch', 'dinner'].forEach((meal) => {
      const area = document.querySelector(`.meal-area[data-meal="${meal}"]`);
      const list = area.querySelector('.meal-list');
      list.innerHTML = '';

      if (meals[meal].length === 0) {
        list.innerHTML = '<span class="meal-empty">暂无食物</span>';
        area.classList.remove('has-foods');
      } else {
        area.classList.add('has-foods');
        meals[meal].forEach((food) => {
          const chip = document.createElement('div');
          chip.className = 'selected-chip';
          chip.innerHTML = `
            <span class="chip-emoji">${food.emoji}</span>
            <span class="chip-name" title="${food.name}">${food.name}</span>
            <span class="chip-kcal">${food.totalKcal}kcal</span>
            <button class="chip-remove" data-uid="${food.uid}" title="移除">×</button>
          `;
          chip.querySelector('.chip-remove').addEventListener('click', () => {
            const target = state.selectedFoods.find((f) => f.uid === food.uid);
            if (target) target.meal = null;
            renderSelectedFoods();
            renderMealAreas();
            updatePreview();
          });
          list.appendChild(chip);
        });
      }
    });
  }

  // ---------- 删除食物 ----------
  function removeFood(uid) {
    state.selectedFoods = state.selectedFoods.filter((f) => f.uid !== uid);
    renderSelectedFoods();
    renderMealAreas();
    updatePreview();
  }

  // ---------- 更新预览 ----------
  function updatePreview() {
    const total = getTotalCalories();
    const target = state.targetCalories;
    const percent = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : 0;
    const over = target > 0 && total > target;

    // 左侧目标统计区同步
    $('targetSelectedVal').textContent = total;
    $('targetPercentVal').textContent = percent;

    // 卡片内
    $('cardDate').textContent = state.date ? state.date.replace(/-/g, '.') : '--';
    $('cardStatus').textContent = state.statusTag;
    $('cardTargetNum').textContent = target > 0 ? target : '--';
    $('cardSelectedNum').textContent = total;
    $('cardPercentNum').textContent = percent + '%';

    const cardFill = $('cardProgressFill');
    cardFill.style.width = percent + '%';
    cardFill.classList.toggle('over', over);

    // 食物清单
    renderCardFoods();
  }

  // ---------- 渲染卡片食物清单 ----------
  function renderCardFoods() {
    const container = $('cardFoods');
    container.innerHTML = '';

    if (state.selectedFoods.length === 0) {
      container.innerHTML = '<p class="card-empty">🍽️ 还没有添加食物</p>';
      return;
    }

    // 检查是否有三餐分配
    const hasMealAssignment = state.selectedFoods.some((f) => f.meal);

    if (hasMealAssignment) {
      // 按三餐分组展示
      const mealOrder = ['breakfast', 'lunch', 'dinner'];
      const mealNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
      const unassigned = state.selectedFoods.filter((f) => !f.meal);

      mealOrder.forEach((meal) => {
        const foods = state.selectedFoods.filter((f) => f.meal === meal);
        if (foods.length === 0) return;

        const section = document.createElement('div');
        section.className = 'meal-section';
        section.innerHTML = `<div class="meal-section-title">${mealNames[meal]}</div>`;
        foods.forEach((f) => section.appendChild(createFoodLine(f)));
        container.appendChild(section);
      });

      // 未分配的放最后
      if (unassigned.length > 0) {
        const section = document.createElement('div');
        section.className = 'meal-section';
        section.innerHTML = '<div class="meal-section-title">其他</div>';
        unassigned.forEach((f) => section.appendChild(createFoodLine(f)));
        container.appendChild(section);
      }
    } else {
      // 统一清单
      state.selectedFoods.forEach((f) => container.appendChild(createFoodLine(f)));
    }
  }

  // ---------- 创建单条食物行 ----------
  function createFoodLine(food) {
    const line = document.createElement('div');
    line.className = 'food-line';
    const amountText = food.unit === '100g' || food.unit === '100ml'
      ? `${food.amount}${food.unit.replace('100', '')}`
      : `${food.amount}${food.unit}`;
    line.innerHTML = `
      <span class="food-line-emoji">${food.emoji}</span>
      <span class="food-line-name">${food.name}</span>
      <span class="food-line-amount">${amountText}</span>
      <span class="food-line-kcal">${food.totalKcal}kcal</span>
    `;
    return line;
  }

  // ---------- 时间戳 ----------
  function startTimestamp() {
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      $('cardTimestamp').textContent = `${h}:${m}:${s}`;
    }
    tick();
    setInterval(tick, 1000);
  }

  // ---------- 下载图片 ----------
  async function downloadImage() {
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas 未加载，请检查网络连接');
      return;
    }

    const btn = $('downloadBtn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ 生成中...';
    btn.disabled = true;

    try {
      const card = $('previewCard');
      const foods = $('cardFoods');

      // 保存原始样式
      const origAspect = card.style.aspectRatio;
      const origHeight = card.style.height;
      const origOverflow = card.style.overflow;
      const origFoodsOverflow = foods.style.overflow;
      const origFoodsFlex = foods.style.flex;

      // 第一步：取消所有高度/滚动限制
      card.style.aspectRatio = 'auto';
      card.style.height = 'auto';
      card.style.overflow = 'visible';
      foods.style.overflow = 'visible';
      foods.style.flex = 'none';

      // 强制重排 + 等待布局稳定
      card.offsetHeight;
      await new Promise(r => setTimeout(r, 250));

      // 第二步：读取内容实际高度，设为固定高度（确保 html2canvas 截到完整内容）
      const contentHeight = card.scrollHeight;
      card.style.height = contentHeight + 'px';
      await new Promise(r => setTimeout(r, 150));

      const canvas = await html2canvas(card, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });

      // 恢复卡片原始样式
      card.style.aspectRatio = origAspect;
      card.style.height = origHeight;
      card.style.overflow = origOverflow;
      foods.style.overflow = origFoodsOverflow;
      foods.style.flex = origFoodsFlex;

      // 下载
      const link = document.createElement('a');
      const filename = `饮食复盘_${state.date || 'today'}_${Date.now()}.png`;
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();

      // 计数 + 检查弹窗
      incrementAndCheckPopup();
    } catch (err) {
      console.error('下载失败:', err);
      alert('图片生成失败：' + err.message);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  // ---------- 计数 & 猫咪弹窗逻辑 ----------
  function incrementAndCheckPopup() {
    let count = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
    count += 1;
    localStorage.setItem(STORAGE_KEY, String(count));

    // 前6次免费；之后每3次触发一次（第9、12、15...次）
    if (count > 6 && count % 3 === 0) {
      showCatPopup();
    }
  }

  // ---------- 显示猫咪弹窗（5秒倒计时） ----------
  function showCatPopup() {
    const btn = $('catCloseBtn');
    let seconds = 5;
    btn.disabled = true;
    btn.textContent = `残忍关掉 (${seconds}s)`;
    showModal('catModal');

    const timer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '残忍关掉弹窗';
      } else {
        btn.textContent = `残忍关掉 (${seconds}s)`;
      }
    }, 1000);
  }

  // ---------- 弹窗工具 ----------
  function showModal(id) {
    $(id).classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function hideModal(id) {
    $(id).classList.remove('show');
    // 只有所有弹窗都关闭才恢复滚动
    const anyOpen = document.querySelector('.modal-overlay.show');
    if (!anyOpen) document.body.style.overflow = '';
  }

  // ---------- 启动 ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
