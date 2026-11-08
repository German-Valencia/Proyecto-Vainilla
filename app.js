/**
 * Mercado App - Vanilla JS (ES6+)
 * Módulo de Precios, Presupuestos e Histórico con IndexedDB (100% Offline).
 */

// ==========================================
// Constantes y Categorías
// ==========================================
const CATEGORIES = {
  general: { label: 'Varios', icon: 'fa-box', badgeClass: 'badge-general' },
  frutas: { label: 'Frutas', icon: 'fa-apple-alt', badgeClass: 'badge-frutas' },
  lacteos: { label: 'Lácteos y Huevos', icon: 'fa-egg', badgeClass: 'badge-lacteos' },
  carnes: { label: 'Carnes', icon: 'fa-drumstick-bite', badgeClass: 'badge-carnes' },
  panaderia: { label: 'Panadería', icon: 'fa-bread-slice', badgeClass: 'badge-panaderia' },
  limpieza: { label: 'Limpieza', icon: 'fa-pump-soap', badgeClass: 'badge-limpieza' },
  bebidas: { label: 'Bebidas', icon: 'fa-wine-bottle', badgeClass: 'badge-bebidas' }
};

const KEYWORD_MAP = {
  frutas: ['manzana', 'banana', 'platano', 'pera', 'naranja', 'limon', 'fresa', 'uva', 'tomate', 'lechuga', 'papa', 'cebolla', 'zanahoria', 'aguacate', 'palta', 'espinaca', 'fruta', 'verdura', 'brocoli', 'sandia', 'melon', 'pina', 'mango', 'pepino'],
  lacteos: ['leche', 'queso', 'yogur', 'yogurt', 'huevo', 'huevos', 'mantequilla', 'crema', 'suero', 'parmesano', 'mozzarella'],
  carnes: ['carne', 'pollo', 'pescado', 'res', 'cerdo', 'jamon', 'salchicha', 'atun', 'salmon', 'molida', 'tocino', 'chuleta', 'pavo'],
  panaderia: ['pan', 'arroz', 'pasta', 'fideo', 'harina', 'avena', 'cereal', 'galleta', 'tostada', 'bagel', 'tortilla', 'panqueque', 'croissant'],
  limpieza: ['jabon', 'detergente', 'cloro', 'lavaloza', 'papel', 'toalla', 'shampoo', 'champu', 'pasta dental', 'cepillo', 'limpiador', 'suavizante', 'esponja', 'lavandina', 'desinfectante'],
  bebidas: ['agua', 'jugo', 'gaseosa', 'refresco', 'soda', 'coca', 'pepsi', 'cerveza', 'vino', 'cafe', 'te', 'licor', 'whisky', 'energetica']
};

const STORAGE_KEY = 'todos';

// ==========================================
// Selectores del DOM
// ==========================================
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoQty = document.getElementById('todo-qty');
const todoPrice = document.getElementById('todo-price');
const todoButton = document.getElementById('todo-button');
const todoList = document.getElementById('todo-list');
const segmentButtons = document.querySelectorAll('.segment-btn');
const filterSelect = document.querySelector('.filter-todo');
const emptyState = document.getElementById('empty-state');
const todoStats = document.getElementById('todo-stats');
const footerCounter = document.getElementById('footer-counter');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const shareListBtn = document.getElementById('share-list-btn');
const inputWrapper = document.querySelector('.input-wrapper');
const categoryChips = document.querySelectorAll('.category-chip');
const offlineBadge = document.getElementById('offline-badge');

// Presupuesto y Precios
const budgetSpent = document.getElementById('budget-spent');
const budgetEstimated = document.getElementById('budget-estimated');
const budgetGoalBtn = document.getElementById('budget-goal-btn');
const budgetGoalText = document.getElementById('budget-goal-text');
const budgetProgressFill = document.getElementById('budget-progress-fill');
const openHistoryBtn = document.getElementById('open-history-btn');

// Hint de Histórico de Precios
const priceHistoryHint = document.getElementById('price-history-hint');
const hintName = document.getElementById('hint-name');
const hintPrice = document.getElementById('hint-price');
const useHintBtn = document.getElementById('use-hint-btn');

// Modales
const budgetModal = document.getElementById('budget-modal');
const budgetForm = document.getElementById('budget-form');
const budgetInput = document.getElementById('budget-input');
const removeBudgetBtn = document.getElementById('remove-budget-btn');

const editItemModal = document.getElementById('edit-item-modal');
const editItemForm = document.getElementById('edit-item-form');
const editItemId = document.getElementById('edit-item-id');
const editItemName = document.getElementById('edit-item-name');
const editItemQty = document.getElementById('edit-item-qty');
const editItemPrice = document.getElementById('edit-item-price');
const editItemStore = document.getElementById('edit-item-store');

const historyModal = document.getElementById('history-modal');
const historySearchInput = document.getElementById('history-search-input');
const historyItemsContainer = document.getElementById('history-items-container');

// Variables de estado
let currentFilter = 'all'; // 'all' | 'uncompleted' | 'completed'
let currentCategoryFilter = 'all'; // 'all' | 'general' | 'frutas' | etc.
let selectedCategory = 'general';
let manualCategorySelected = false;
let currentBudgetGoal = 0;
let suggestedPriceValue = null;

// ==========================================
// Inicialización
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  await initApp();
  registerServiceWorker();
  initNetworkListeners();
});

async function initApp() {
  initEventListeners();
  initModalListeners();
  if (window.mercadoDB) {
    currentBudgetGoal = await window.mercadoDB.getBudgetSetting();
  }
  renderTodos();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => console.log('SW activo:', reg.scope))
        .catch((err) => console.warn('SW error:', err));
    });
  }
}

function initNetworkListeners() {
  const updateNetworkStatus = () => {
    if (!navigator.onLine) offlineBadge?.classList.add('visible');
    else offlineBadge?.classList.remove('visible');
  };
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}

// ==========================================
// Configuración de Eventos Principales
// ==========================================
function initEventListeners() {
  todoForm.addEventListener('submit', handleAddTodo);
  todoList.addEventListener('click', handleListAction);
  clearCompletedBtn.addEventListener('click', handleClearCompleted);
  if (shareListBtn) shareListBtn.addEventListener('click', handleShareList);

  // Detección automática de categoría y consulta de precios anteriores
  todoInput.addEventListener('input', handleInputChange);

  // Aplicar sugerencia de precio histórico
  if (useHintBtn) {
    useHintBtn.addEventListener('click', () => {
      if (suggestedPriceValue !== null && todoPrice) {
        todoPrice.value = suggestedPriceValue.toFixed(2);
        priceHistoryHint.style.display = 'none';
        triggerHaptic(10);
      }
    });
  }

  // Manejo de chips de categoría (Filtrado)
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const category = chip.dataset.category;
      if (currentCategoryFilter === category && category !== 'all') {
        setCategoryFilter('all');
      } else {
        setCategoryFilter(category);
      }
    });
  });

  // Manejo del control segmentado (Todas / Pendientes / Compradas)
  segmentButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      segmentButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      currentFilter = btn.dataset.filter;
      if (filterSelect) filterSelect.value = currentFilter;
      renderTodos();
    });
  });

  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      segmentButtons.forEach((b) => {
        const isActive = b.dataset.filter === currentFilter;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      renderTodos();
    });
  }
}

// ==========================================
// Gestión de Modales
// ==========================================
function initModalListeners() {
  // Abrir Modal de Presupuesto
  budgetGoalBtn?.addEventListener('click', () => {
    if (budgetInput) budgetInput.value = currentBudgetGoal > 0 ? currentBudgetGoal : '';
    openModal(budgetModal);
  });

  // Guardar Meta de Presupuesto
  budgetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseFloat(budgetInput.value) || 0;
    currentBudgetGoal = val;
    if (window.mercadoDB) await window.mercadoDB.setBudgetSetting(val);
    closeModal(budgetModal);
    renderTodos();
    triggerHaptic(15);
  });

  // Quitar Meta de Presupuesto
  removeBudgetBtn?.addEventListener('click', async () => {
    currentBudgetGoal = 0;
    if (window.mercadoDB) await window.mercadoDB.setBudgetSetting(0);
    closeModal(budgetModal);
    renderTodos();
    triggerHaptic(10);
  });

  // Abrir Modal de Histórico de Precios
  openHistoryBtn?.addEventListener('click', async () => {
    openModal(historyModal);
    await loadPriceHistoryCatalog();
  });

  // Buscador dentro del Histórico
  historySearchInput?.addEventListener('input', (e) => {
    filterPriceHistoryList(e.target.value);
  });

  // Guardar edición de un producto
  editItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editItemId.value;
    const newName = editItemName.value.trim();
    const newQty = parseInt(editItemQty.value, 10) || 1;
    const newPrice = parseFloat(editItemPrice.value) || 0;
    const newStore = editItemStore.value.trim();

    if (!newName) return;

    const todos = getStoredTodos();
    const targetItem = todos.find((t) => t.id === id);
    if (targetItem) {
      targetItem.text = newName;
      targetItem.quantity = newQty;
      targetItem.price = newPrice;
      targetItem.store = newStore;

      saveStoredTodos(todos);

      // Si tiene precio, registrar en el histórico de IndexedDB
      if (newPrice > 0 && window.mercadoDB) {
        await window.mercadoDB.recordPrice(newName, newPrice, targetItem.category, newStore || 'General');
      }

      closeModal(editItemModal);
      renderTodos();
      triggerHaptic(15);
    }
  });

  // Delegación para cerrar modales al hacer clic en overlays o botones de cierre
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const modalId = closeBtn.dataset.close;
      const target = document.getElementById(modalId);
      if (target) closeModal(target);
      return;
    }

    if (e.target.classList.contains('modal-overlay')) {
      closeModal(e.target);
    }
  });
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('active');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('active');
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ==========================================
// Carga y Filtrado del Catálogo de Precios
// ==========================================
let cachedCatalog = [];

async function loadPriceHistoryCatalog() {
  if (!historyItemsContainer) return;
  historyItemsContainer.innerHTML = '<p class="modal-desc">Cargando catálogo...</p>';

  if (window.mercadoDB) {
    cachedCatalog = await window.mercadoDB.getAllCatalog();
  }

  renderPriceHistoryList(cachedCatalog);
}

function renderPriceHistoryList(items) {
  if (!historyItemsContainer) return;

  if (items.length === 0) {
    historyItemsContainer.innerHTML = `
      <div class="empty-state visible" style="padding: 2rem 0;">
        <i class="fas fa-tags" style="font-size: 2rem; opacity: 0.35;"></i>
        <p class="empty-title" style="margin-top: 0.5rem;">Sin precios registrados aún</p>
        <p class="empty-desc">Asigna precios a tus productos al agregarlos o al comprarlos para ver su histórico aquí.</p>
      </div>`;
    return;
  }

  historyItemsContainer.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'history-item-card';

    let trendHtml = '<span class="trend-badge trend-same"><i class="fas fa-equals"></i> Estable</span>';
    if (item.trend === 'up') {
      trendHtml = '<span class="trend-badge trend-up"><i class="fas fa-arrow-up"></i> Subió</span>';
    } else if (item.trend === 'down') {
      trendHtml = '<span class="trend-badge trend-down"><i class="fas fa-arrow-down"></i> Bajó</span>';
    }

    const dateStr = new Date(item.lastUpdated).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });

    card.innerHTML = `
      <div class="history-item-left">
        <span class="history-item-name">${item.displayName}</span>
        <span class="history-item-meta">${item.store || 'General'} • ${dateStr} • Mín: $${(item.minPrice || item.lastPrice).toFixed(2)}</span>
      </div>
      <div class="history-item-right">
        <span class="history-item-price">$${item.lastPrice.toFixed(2)}</span>
        ${trendHtml}
      </div>
    `;
    historyItemsContainer.appendChild(card);
  });
}

function filterPriceHistoryList(query) {
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    renderPriceHistoryList(cachedCatalog);
    return;
  }
  const filtered = cachedCatalog.filter((item) =>
    item.displayName.toLowerCase().includes(q) || (item.store && item.store.toLowerCase().includes(q))
  );
  renderPriceHistoryList(filtered);
}

// ==========================================
// Filtros y Autocategorización
// ==========================================
function setCategoryFilter(categoryKey) {
  currentCategoryFilter = categoryKey;

  if (categoryKey !== 'all') {
    selectedCategory = categoryKey;
    manualCategorySelected = true;
  } else {
    selectedCategory = 'general';
    manualCategorySelected = false;
  }

  categoryChips.forEach((chip) => {
    const isTarget = chip.dataset.category === categoryKey;
    chip.classList.toggle('active', isTarget);
    chip.setAttribute('aria-checked', isTarget ? 'true' : 'false');
    if (isTarget) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  });

  triggerHaptic(10);
  renderTodos();
}

async function handleInputChange(e) {
  const text = e.target.value.trim();

  // 1. Autocategorización inteligente
  if (!manualCategorySelected || currentCategoryFilter === 'all') {
    let matchedCategory = 'general';
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        matchedCategory = category;
        break;
      }
    }
    selectedCategory = matchedCategory;

    if (currentCategoryFilter === 'all') {
      categoryChips.forEach((chip) => {
        const isTarget = chip.dataset.category === matchedCategory;
        if (isTarget && matchedCategory !== 'general') {
          chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    }
  }

  // 2. Consulta de último precio conocido en IndexedDB
  if (text.length >= 3 && window.mercadoDB) {
    const info = await window.mercadoDB.getLatestProductInfo(text);
    if (info && info.lastPrice > 0) {
      suggestedPriceValue = info.lastPrice;
      if (hintName) hintName.innerText = info.displayName;
      if (hintPrice) hintPrice.innerText = `$${info.lastPrice.toFixed(2)}`;
      if (priceHistoryHint) priceHistoryHint.style.display = 'flex';
      return;
    }
  }

  if (priceHistoryHint) priceHistoryHint.style.display = 'none';
  suggestedPriceValue = null;
}

// ==========================================
// Almacenamiento Local (LocalStorage)
// ==========================================
function getStoredTodos() {
  const rawData = localStorage.getItem(STORAGE_KEY);
  if (!rawData) return [];

  try {
    const parsed = JSON.parse(rawData);
    if (!Array.isArray(parsed)) return [];

    let migrated = false;
    const todos = parsed.map((item, index) => {
      if (typeof item === 'string') {
        migrated = true;
        return {
          id: `legacy_${Date.now()}_${index}`,
          text: item,
          completed: false,
          category: 'general',
          quantity: 1,
          price: 0,
          store: '',
          createdAt: Date.now() - index * 1000,
        };
      }
      if (!item.category) {
        item.category = 'general';
        migrated = true;
      }
      if (item.quantity === undefined) {
        item.quantity = 1;
        migrated = true;
      }
      if (item.price === undefined) {
        item.price = 0;
        migrated = true;
      }
      return item;
    });

    if (migrated) saveStoredTodos(todos);
    return todos;
  } catch (error) {
    console.error('Error al leer de localStorage:', error);
    return [];
  }
}

function saveStoredTodos(todos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (error) {
    console.error('Error al guardar en localStorage:', error);
  }
}

// ==========================================
// Acciones del Formulario
// ==========================================
async function handleAddTodo(event) {
  event.preventDefault();

  const text = todoInput.value.trim();
  const qty = parseInt(todoQty?.value, 10) || 1;
  const price = parseFloat(todoPrice?.value) || 0;

  if (!text) {
    if (inputWrapper) {
      inputWrapper.classList.remove('shake');
      void inputWrapper.offsetWidth;
      inputWrapper.classList.add('shake');
      setTimeout(() => inputWrapper.classList.remove('shake'), 500);
    }
    todoInput.focus();
    return;
  }

  let itemCategory = selectedCategory || 'general';
  if (currentCategoryFilter !== 'all' && (!selectedCategory || selectedCategory === 'general')) {
    itemCategory = currentCategoryFilter;
  }

  const newTodo = {
    id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: text,
    completed: false,
    category: itemCategory,
    quantity: qty,
    price: price,
    store: '',
    createdAt: Date.now(),
  };

  const todos = getStoredTodos();
  todos.unshift(newTodo);
  saveStoredTodos(todos);

  // Si tiene precio, registrar en IndexedDB para enriquecer el catálogo
  if (price > 0 && window.mercadoDB) {
    await window.mercadoDB.recordPrice(text, price, itemCategory);
  }

  // Limpieza del formulario
  todoInput.value = '';
  if (todoQty) todoQty.value = '1';
  if (todoPrice) todoPrice.value = '';
  if (priceHistoryHint) priceHistoryHint.style.display = 'none';
  suggestedPriceValue = null;

  if (window.innerWidth > 768) {
    todoInput.focus();
  }

  triggerHaptic(15);

  if (currentCategoryFilter !== 'all' && currentCategoryFilter !== itemCategory) {
    setCategoryFilter(itemCategory);
  } else {
    renderTodos();
  }
}

function handleListAction(event) {
  const target = event.target;

  // 1. Filtrar al tocar la etiqueta de categoría
  const categoryBadge = target.closest('.category-badge');
  if (categoryBadge) {
    const todoElement = categoryBadge.closest('.todo');
    if (todoElement) {
      const todoId = todoElement.dataset.id;
      const todo = getStoredTodos().find((t) => t.id === todoId);
      if (todo) {
        setCategoryFilter(todo.category);
        return;
      }
    }
  }

  // 2. Editar precio/cantidad al tocar el tag de precio
  const priceTag = target.closest('.item-price-tag');
  if (priceTag) {
    const todoElement = priceTag.closest('.todo');
    if (todoElement) {
      const todoId = todoElement.dataset.id;
      openEditItemModal(todoId);
      return;
    }
  }

  // 3. Botones de acción (Check / Trash)
  const button = target.closest('.action-btn');
  if (!button) return;

  const todoElement = button.closest('.todo');
  if (!todoElement) return;

  const todoId = todoElement.dataset.id;

  if (button.classList.contains('complete-btn')) {
    toggleTodoStatus(todoId);
  } else if (button.classList.contains('trash-btn')) {
    deleteTodoItem(todoId, todoElement);
  }
}

function openEditItemModal(todoId) {
  const todos = getStoredTodos();
  const item = todos.find((t) => t.id === todoId);
  if (!item) return;

  editItemId.value = item.id;
  editItemName.value = item.text;
  editItemQty.value = item.quantity || 1;
  editItemPrice.value = item.price > 0 ? item.price : '';
  editItemStore.value = item.store || '';

  openModal(editItemModal);
}

async function toggleTodoStatus(id) {
  const todos = getStoredTodos();
  let completedItem = null;

  const updatedTodos = todos.map((item) => {
    if (item.id === id) {
      const newStatus = !item.completed;
      if (newStatus && item.price > 0) {
        completedItem = item;
      }
      return { ...item, completed: newStatus };
    }
    return item;
  });

  saveStoredTodos(updatedTodos);

  // Al completar un producto con precio, aseguramos su registro histórico
  if (completedItem && window.mercadoDB) {
    await window.mercadoDB.recordPrice(
      completedItem.text,
      completedItem.price,
      completedItem.category,
      completedItem.store || 'General'
    );
  }

  triggerHaptic(12);
  renderTodos();
}

function deleteTodoItem(id, element) {
  element.classList.add('fall');

  const removeAndSave = () => {
    const todos = getStoredTodos();
    const filteredTodos = todos.filter((item) => item.id !== id);
    saveStoredTodos(filteredTodos);
    renderTodos();
  };

  element.addEventListener('transitionend', removeAndSave, { once: true });
  setTimeout(() => {
    if (element.isConnected) removeAndSave();
  }, 350);
}

function handleClearCompleted() {
  const todos = getStoredTodos();
  const completedCount = todos.filter((t) => t.completed).length;
  if (completedCount === 0) return;

  const confirmed = confirm(
    `¿Deseas eliminar los ${completedCount} producto${completedCount === 1 ? '' : 's'} marcado${completedCount === 1 ? '' : 's'} como comprado${completedCount === 1 ? '' : 's'}?`
  );
  if (!confirmed) return;

  const remainingTodos = todos.filter((item) => !item.completed);
  saveStoredTodos(remainingTodos);
  triggerHaptic([10, 30, 10]);
  renderTodos();
}

function handleShareList() {
  const todos = getStoredTodos();
  if (todos.length === 0) {
    alert('Tu lista de mercado está vacía. Agrega algunos productos para compartirla.');
    return;
  }

  const pending = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  let shareText = `🛒 Mi Lista de Mercado (mercadoya.vercel.app)\n\n`;

  if (pending.length > 0) {
    shareText += `Pendientes (${pending.length}):\n`;
    pending.forEach((t) => {
      const cat = CATEGORIES[t.category]?.label || 'Varios';
      const qtyStr = t.quantity > 1 ? ` (${t.quantity} ud)` : '';
      const priceStr = t.price > 0 ? ` - $${(t.price * t.quantity).toFixed(2)}` : '';
      shareText += `• [ ] ${t.text}${qtyStr} [${cat}]${priceStr}\n`;
    });
  }

  if (completed.length > 0) {
    shareText += `\nComprados (${completed.length}):\n`;
    completed.forEach((t) => {
      const priceStr = t.price > 0 ? ` - $${(t.price * t.quantity).toFixed(2)}` : '';
      shareText += `• [x] ${t.text}${priceStr}\n`;
    });
  }

  const totalSpent = todos.filter((t) => t.completed).reduce((s, t) => s + (t.price || 0) * (t.quantity || 1), 0);
  const totalEstimated = todos.reduce((s, t) => s + (t.price || 0) * (t.quantity || 1), 0);

  if (totalEstimated > 0) {
    shareText += `\n💰 Gasto estimado: $${totalEstimated.toFixed(2)} (En carrito: $${totalSpent.toFixed(2)})`;
  }

  shareText += `\nTotal: ${todos.length} productos`;

  if (navigator.share) {
    navigator
      .share({
        title: 'Lista de Mercado',
        text: shareText,
        url: 'https://mercadoya.vercel.app/',
      })
      .catch(() => {});
  } else {
    navigator.clipboard
      .writeText(shareText)
      .then(() => alert('📋 ¡Lista copiada al portapapeles! Ya puedes pegarla en WhatsApp.'))
      .catch(() => alert('Por favor inténtalo de nuevo.'));
  }
}

// ==========================================
// Gestos Táctiles (Swipe to Complete / Delete)
// ==========================================
function attachSwipeListeners(contentElement, todoId, todoContainer) {
  let startX = 0;
  let startY = 0;
  let currentDeltaX = 0;
  let isHorizontalSwipe = false;
  let isTracking = false;

  const SWIPE_THRESHOLD = 75;

  contentElement.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentDeltaX = 0;
      isHorizontalSwipe = false;
      isTracking = true;
      contentElement.classList.remove('swiping');
    },
    { passive: true }
  );

  contentElement.addEventListener(
    'touchmove',
    (e) => {
      if (!isTracking || e.touches.length !== 1) return;

      const touchX = e.touches[0].clientX;
      const touchY = e.touches[0].clientY;
      const diffX = touchX - startX;
      const diffY = touchY - startY;

      if (!isHorizontalSwipe) {
        if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
          isHorizontalSwipe = true;
          contentElement.classList.add('swiping');
        } else if (Math.abs(diffY) > 8) {
          isTracking = false;
          return;
        }
      }

      if (isHorizontalSwipe) {
        let transformedDiffX = diffX;
        if (Math.abs(diffX) > 120) {
          const excess = Math.abs(diffX) - 120;
          transformedDiffX = (diffX > 0 ? 120 : -120) + Math.sign(diffX) * (excess * 0.3);
        }
        currentDeltaX = transformedDiffX;
        contentElement.style.transform = `translateX(${currentDeltaX}px)`;
      }
    },
    { passive: true }
  );

  const handleTouchEnd = () => {
    if (!isTracking || !isHorizontalSwipe) {
      isTracking = false;
      return;
    }

    isTracking = false;
    contentElement.classList.remove('swiping');

    if (currentDeltaX > SWIPE_THRESHOLD) {
      triggerHaptic(20);
      contentElement.style.transform = 'translateX(0)';
      toggleTodoStatus(todoId);
    } else if (currentDeltaX < -SWIPE_THRESHOLD) {
      triggerHaptic(25);
      contentElement.style.transform = 'translateX(-100%)';
      deleteTodoItem(todoId, todoContainer);
    } else {
      contentElement.style.transform = 'translateX(0)';
    }
  };

  contentElement.addEventListener('touchend', handleTouchEnd, { passive: true });
  contentElement.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

function triggerHaptic(pattern) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

// ==========================================
// Renderizado del DOM y Presupuestos
// ==========================================
function renderTodos() {
  const allTodos = getStoredTodos();

  const filteredTodos = allTodos.filter((item) => {
    if (currentFilter === 'completed' && !item.completed) return false;
    if (currentFilter === 'uncompleted' && item.completed) return false;
    if (currentCategoryFilter !== 'all' && item.category !== currentCategoryFilter) return false;
    return true;
  });

  todoList.innerHTML = '';

  filteredTodos.forEach((todo) => {
    const categoryInfo = CATEGORIES[todo.category] || CATEGORIES.general;

    const todoLi = document.createElement('li');
    todoLi.classList.add('todo');
    if (todo.completed) todoLi.classList.add('completed');
    todoLi.dataset.id = todo.id;

    // Fondos de acción táctil Swipe
    const swipeBgLeft = document.createElement('div');
    swipeBgLeft.className = 'swipe-bg swipe-bg-left';
    swipeBgLeft.innerHTML = '<i class="fas fa-check"></i> <span>Completar</span>';
    todoLi.appendChild(swipeBgLeft);

    const swipeBgRight = document.createElement('div');
    swipeBgRight.className = 'swipe-bg swipe-bg-right';
    swipeBgRight.innerHTML = '<span>Eliminar</span> <i class="fas fa-trash-alt"></i>';
    todoLi.appendChild(swipeBgRight);

    // Contenido deslizable
    const todoContent = document.createElement('div');
    todoContent.classList.add('todo-content');

    const todoMain = document.createElement('div');
    todoMain.classList.add('todo-main');

    const badge = document.createElement('span');
    badge.className = `category-badge ${categoryInfo.badgeClass}`;
    badge.title = 'Toca para filtrar por esta categoría';
    badge.innerHTML = `<i class="fas ${categoryInfo.icon}"></i> ${categoryInfo.label}`;
    todoMain.appendChild(badge);

    const spanText = document.createElement('span');
    spanText.classList.add('todo-item');
    const qtyPrefix = (todo.quantity || 1) > 1 ? `(${todo.quantity}x) ` : '';
    spanText.innerText = `${qtyPrefix}${todo.text}`;
    todoMain.appendChild(spanText);

    todoContent.appendChild(todoMain);

    // Etiqueta de precio interactiva
    const priceTag = document.createElement('button');
    priceTag.type = 'button';
    priceTag.className = 'item-price-tag';
    const unitPrice = parseFloat(todo.price) || 0;
    const qty = parseInt(todo.quantity, 10) || 1;

    if (unitPrice > 0) {
      const subtotal = unitPrice * qty;
      priceTag.innerHTML = `${qty > 1 ? qty + '× ' : ''}$${subtotal.toFixed(2)}`;
      priceTag.title = 'Toca para editar precio y cantidad';
    } else {
      priceTag.classList.add('empty-price');
      priceTag.innerHTML = '<i class="fas fa-tag"></i> +$';
      priceTag.title = 'Toca para asignar precio';
    }
    todoContent.appendChild(priceTag);

    // Botones de acción (≥ 44px)
    const actionsContainer = document.createElement('div');
    actionsContainer.classList.add('todo-actions');

    const completeBtn = document.createElement('button');
    completeBtn.classList.add('action-btn', 'complete-btn');
    completeBtn.setAttribute('aria-label', todo.completed ? 'Marcar como pendiente' : 'Marcar como comprada');
    completeBtn.innerHTML = '<i class="fas fa-check"></i>';
    actionsContainer.appendChild(completeBtn);

    const trashBtn = document.createElement('button');
    trashBtn.classList.add('action-btn', 'trash-btn');
    trashBtn.setAttribute('aria-label', 'Eliminar producto');
    trashBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    actionsContainer.appendChild(trashBtn);

    todoContent.appendChild(actionsContainer);
    todoLi.appendChild(todoContent);

    attachSwipeListeners(todoContent, todo.id, todoLi);
    todoList.appendChild(todoLi);
  });

  // Estado vacío
  if (filteredTodos.length === 0) {
    emptyState.classList.add('visible');
    const emptyTitle = emptyState.querySelector('.empty-title');
    const emptyDesc = emptyState.querySelector('.empty-desc');

    if (currentCategoryFilter !== 'all') {
      const catName = CATEGORIES[currentCategoryFilter]?.label || currentCategoryFilter;
      if (emptyTitle) emptyTitle.innerText = `Sin productos en ${catName}`;
      if (emptyDesc) emptyDesc.innerHTML = 'Toca <strong>"Todas"</strong> arriba para ver el resto de tu lista.';
    } else if (currentFilter !== 'all') {
      if (emptyTitle) emptyTitle.innerText = '¡Filtro al día!';
      if (emptyDesc) emptyDesc.innerText = 'No tienes productos en esta vista.';
    } else {
      if (emptyTitle) emptyTitle.innerText = '¡Lista al día!';
      if (emptyDesc) emptyDesc.innerText = 'No tienes productos en la lista.';
    }
  } else {
    emptyState.classList.remove('visible');
  }

  updateStats(allTodos);
  updateBudgetTracker(allTodos);
}

function updateStats(todos) {
  const total = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;
  const pendingCount = total - completedCount;

  if (currentCategoryFilter !== 'all') {
    const categoryTodos = todos.filter((t) => t.category === currentCategoryFilter);
    const catTotal = categoryTodos.length;
    const catCompleted = categoryTodos.filter((t) => t.completed).length;
    const catName = CATEGORIES[currentCategoryFilter]?.label || currentCategoryFilter;
    todoStats.innerText = `${catCompleted} de ${catTotal} en ${catName}`;
  } else {
    todoStats.innerText = total === 0 ? '0 productos en la lista' : `${completedCount} de ${total} comprados`;
  }

  footerCounter.innerText = `${pendingCount} restante${pendingCount === 1 ? '' : 's'}`;

  if (completedCount > 0) clearCompletedBtn.classList.remove('disabled');
  else clearCompletedBtn.classList.add('disabled');
}

function updateBudgetTracker(todos) {
  const totalEstimated = todos.reduce((sum, t) => sum + (parseFloat(t.price) || 0) * (parseInt(t.quantity, 10) || 1), 0);
  const totalSpent = todos
    .filter((t) => t.completed)
    .reduce((sum, t) => sum + (parseFloat(t.price) || 0) * (parseInt(t.quantity, 10) || 1), 0);

  if (budgetSpent) budgetSpent.innerText = `$${totalSpent.toFixed(2)}`;
  if (budgetEstimated) budgetEstimated.innerText = `de ~$${totalEstimated.toFixed(2)} estimado`;

  if (budgetGoalText) {
    if (currentBudgetGoal > 0) {
      budgetGoalText.innerText = `Meta: $${currentBudgetGoal.toFixed(2)}`;
    } else {
      budgetGoalText.innerText = 'Definir Meta';
    }
  }

  if (budgetProgressFill) {
    let pct = 0;
    budgetProgressFill.classList.remove('warning', 'danger');

    if (currentBudgetGoal > 0) {
      pct = (totalSpent / currentBudgetGoal) * 100;
      if (pct >= 100) {
        budgetProgressFill.classList.add('danger');
      } else if (pct >= 85) {
        budgetProgressFill.classList.add('warning');
      }
    } else if (totalEstimated > 0) {
      pct = (totalSpent / totalEstimated) * 100;
    }

    budgetProgressFill.style.width = `${Math.min(pct, 100)}%`;
  }
}

// ─── Exports globales para receipt-scanner.js ─────────────────────────────
window.getStoredTodos = getStoredTodos;
window.saveStoredTodos = saveStoredTodos;
window.renderTodos = renderTodos;
window.triggerHaptic = triggerHaptic;
