/**
 * MercadoYa - Vanilla JS (ES6+)
 * Módulo de Precios, Presupuestos e Histórico con IndexedDB (100% Offline).
 */

// ==========================================
// Constantes y Categorías
// ==========================================
const CATEGORIES = {
  general: { label: 'Varios', icon: 'fa-box', badgeClass: 'badge-general' },
  frutas: { label: 'Frutas y Verduras', icon: 'fa-apple-alt', badgeClass: 'badge-frutas' },
  lacteos: { label: 'Lácteos y Huevos', icon: 'fa-egg', badgeClass: 'badge-lacteos' },
  carnes: { label: 'Carnes y Pescados', icon: 'fa-drumstick-bite', badgeClass: 'badge-carnes' },
  panaderia: { label: 'Panadería', icon: 'fa-bread-slice', badgeClass: 'badge-panaderia' },
  despensa: { label: 'Despensa', icon: 'fa-basket-shopping', badgeClass: 'badge-despensa' },
  limpieza: { label: 'Limpieza y Aseo', icon: 'fa-pump-soap', badgeClass: 'badge-limpieza' },
  bebidas: { label: 'Bebidas', icon: 'fa-wine-bottle', badgeClass: 'badge-bebidas' }
};

// ==========================================
// Motor Inteligente de Clasificación de Productos
// ==========================================

// Reglas de desambiguación para frases compuestas (prioridad máxima)
const COMPOUND_RULES = [
  // Bebidas preparadas / jugos / refrescos
  { regex: /\b(jugo|zumo|nectar|agua|refresco|gaseosa|batido|smoothie|soda)\s+de\s+[a-z]+/i, category: 'bebidas' },
  { regex: /\b(leche\s+de\s+(soya|soja|almendra|coco|avena|arroz))\b/i, category: 'bebidas' },
  { regex: /\b(te\s+de\s+[a-z]+|infusion\s+de\s+[a-z]+|aromatica)\b/i, category: 'bebidas' },
  { regex: /\b(cafe\s+con\s+leche|cappuccino|capuchino|mocaccino)\b/i, category: 'bebidas' },
  
  // Lácteos (alta precedencia para crema/suero de leche)
  { regex: /\b(crema|suero)\s+de\s+leche\b/i, category: 'lacteos' },
  { regex: /\b(leche)\s+(entera|deslactosada|descremada|semidescremada|en\s+polvo|condensada|evaporada)\b/i, category: 'lacteos' },
  { regex: /\b(queso)\s+[a-z]+/i, category: 'lacteos' },

  // Despensa: salsas, mermeladas, conservas, aceites
  { regex: /\b(salsa|pasta|pure|concentrado|aderezo)\s+de\s+[a-z]+/i, category: 'despensa' },
  { regex: /\b(mermelada|dulce|arequipe|manjar|confitura)\s+de\s+[a-z]+/i, category: 'despensa' },
  { regex: /\b(aceite|vinagre)\s+de\s+[a-z]+/i, category: 'despensa' },
  { regex: /\b(harina|sopa|caldo)\s+de\s+[a-z]+/i, category: 'despensa' },
  { regex: /\b(arroz\s+con\s+[a-z]+|pasta\s+con\s+[a-z]+)\b/i, category: 'despensa' },
  { regex: /\b(atun|sardina|salmon|pollo)\s+en\s+(lata|aceite|agua)\b/i, category: 'despensa' },
];

// Diccionario exhaustivo por categoría con términos singulares base
const KEYWORD_MAP = {
  frutas: [
    // Frutas
    'manzana', 'banana', 'banano', 'platano', 'pera', 'naranja', 'limon', 'lima', 'fresa', 'frutilla',
    'uva', 'tomate', 'jitomate', 'aguacate', 'palta', 'sandia', 'patilla', 'melon', 'pina', 'anana',
    'mango', 'mandarina', 'mora', 'kiwi', 'durazno', 'melocoton', 'ciruela', 'maracuya', 'lulo',
    'guanabana', 'guayaba', 'papaya', 'coco', 'arandano', 'frambuesa', 'granadilla', 'pitahaya',
    'uchuva', 'toronja', 'higo', 'cereza', 'guama', 'zapote', 'chontaduro', 'borojo', 'curuba',
    'tamarindo', 'mamey', 'carambolo', 'pomelo', 'damasco', 'albaricoque',
    // Verduras, hortalizas y tubérculos
    'lechuga', 'papa', 'patata', 'cebolla', 'zanahoria', 'espinaca', 'brocoli', 'pepino', 'pepinillo',
    'ajo', 'cilantro', 'perejil', 'apio', 'pimenton', 'pimiento', 'aji', 'chile', 'remolacha', 'betabel',
    'coliflor', 'repollo', 'col', 'berenjena', 'calabacin', 'zucchini', 'calabaza', 'ahuyama', 'zapallo',
    'esparrago', 'champinon', 'seta', 'hongo', 'jengibre', 'yuca', 'mandioca', 'arracacha', 'name',
    'habichuela', 'judia', 'arveja', 'guisante', 'ejote', 'rabano', 'acelga', 'alcachofa', 'puerro',
    'cebollin', 'verdeo', 'batata', 'camote', 'elote', 'choclo', 'mazorca', 'rucula', 'albahaca',
    'menta', 'hierbabuena', 'romero', 'tomillo fresco', 'oregano fresco', 'nopal', 'verdura', 'hortaliza'
  ],
  lacteos: [
    'leche', 'queso', 'yogur', 'yogurt', 'huevo', 'mantequilla', 'ghee', 'crema de leche', 'nata',
    'suero', 'parmesano', 'mozzarella', 'cuajada', 'quesillo', 'ricota', 'ricotta', 'requeson',
    'kumis', 'leche condensada', 'leche evaporada', 'margarina', 'cheddar', 'gouda', 'brie',
    'provolone', 'gruyere', 'quesito', 'lecherita', 'leche en polvo'
  ],
  carnes: [
    'carne', 'pollo', 'res', 'cerdo', 'puerco', 'chancho', 'ternera', 'pechuga', 'muslo', 'alita',
    'ala de pollo', 'pescado', 'atun', 'salmon', 'trucha', 'tilapia', 'mojarra', 'sardina', 'corvina',
    'bagre', 'bocachico', 'robalo', 'marisco', 'camaron', 'langostino', 'calamar', 'pulpo', 'molida',
    'bistec', 'bife', 'filete', 'costilla', 'lomo', 'chuleta', 'tocino', 'tocineta', 'panceta',
    'bacon', 'jamon', 'salchicha', 'chorizo', 'morcilla', 'butifarra', 'salchichon', 'mortadela',
    'pavo', 'cordero', 'cabrito', 'callo', 'mondongo', 'higado', 'molleja', 'albondiga', 'hamburguesa'
  ],
  panaderia: [
    'pan', 'bagel', 'tostada', 'tortilla', 'panqueque', 'croissant', 'arepa', 'medialuna', 'bolillo',
    'telera', 'baguette', 'ciabatta', 'mogolla', 'almojabana', 'pandebono', 'bunuelo', 'ponque',
    'bizcocho', 'torta', 'pastel', 'queque', 'magdalena', 'muffin', 'waffle', 'masa de hojaldre',
    'brazo de reina', 'pan dulce', 'pan tajado', 'pan arabe', 'pita', 'roscon'
  ],
  despensa: [
    'arroz', 'pasta', 'fideo', 'espagueti', 'macarron', 'harina', 'avena', 'cereal', 'galleta',
    'frijol', 'frejol', 'poroto', 'lenteja', 'garbanzo', 'azucar', 'sal', 'aceite', 'vinagre',
    'mayonesa', 'mostaza', 'salsa', 'ketchup', 'catsup', 'conserva', 'enlatado', 'maiz pira',
    'palomitas', 'miel', 'panela', 'chocolate', 'cocoa', 'milo', 'cafe', 'te en bolsa', 'hierba mate',
    'polvo de hornear', 'levadura', 'gelatina', 'flan', 'comino', 'pimienta', 'canela', 'clavo',
    'laurel', 'achiote', 'curcuma', 'colorante', 'vainilla', 'sopa instantanea', 'ramen', 'atun lata',
    'caldo maggi', 'cubito', 'nueces', 'almendras', 'mani', 'cacahuate', 'pistachos', 'pasas'
  ],
  limpieza: [
    'jabon', 'detergente', 'cloro', 'lejia', 'lavandina', 'blanqueador', 'lavaloza', 'lavavajilla',
    'papel higienico', 'papel de cocina', 'toalla higienica', 'panal', 'shampoo', 'champu',
    'acondicionador', 'pasta dental', 'crema dental', 'cepillo de dientes', 'enjuague bucal',
    'desodorante', 'antitranspirante', 'limpiador', 'desinfectante', 'suavizante', 'suavitel',
    'esponja', 'esponjilla', 'trapero', 'trapeador', 'mopa', 'escoba', 'recogedor', 'balde',
    'bolsa de basura', 'guantes de caucho', 'bayetilla', 'limpiavidrios', 'cera para piso',
    'ambientador', 'insecticida', 'afeitadora', 'rastrillo', 'espuma de afeitar', 'crema de afeitar',
    'algodon', 'copitos', 'toallitas humedas'
  ],
  bebidas: [
    'agua', 'agua mineral', 'agua con gas', 'jugo', 'zumo', 'gaseosa', 'refresco', 'soda', 'coca cola',
    'pepsi', 'sprite', 'fanta', 'quatro', 'postobon', 'colombiana', 'cerveza', 'vino', 'champagne',
    'sidra', 'licor', 'aguardiente', 'ron', 'whisky', 'vodka', 'tequila', 'ginebra', 'energetica',
    'red bull', 'monster', 'gatorade', 'powerade', 'malta', 'pony malta', 'kombucha', 'bebida hidratante'
  ]
};

/**
 * Normaliza una cadena de texto para comparación léxica uniforme.
 * Remueve acentos, diacríticos y caracteres no alfanuméricos.
 * @param {string} text
 * @returns {string}
 */
function normalizeCategoryText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lematizador simple en español para singularizar palabras.
 * Convierte plurales regulares a su forma canónica singular.
 * @param {string} word
 * @returns {string}
 */
function lemmatizeSpanishWord(word) {
  if (!word || word.length <= 3) return word;
  
  // Palabras invariables que no deben alterarse
  const INVARIABLES = new Set(['arroz', 'res', 'gas', 'queso', 'anana', 'maiz', 'compas', 'pais']);
  if (INVARIABLES.has(word)) return word;

  // Plurales en -ces -> -z (ej: nueces -> nuez, peces -> pez)
  if (word.endsWith('ces') && word.length > 4) {
    return word.slice(0, -3) + 'z';
  }

  // Plurales en -es con consonante previa (ej: limones -> limon, frijoles -> frijol, tomates -> tomate, carnes -> carne)
  if (word.endsWith('es') && word.length > 4) {
    const base = word.slice(0, -2);
    // Casos como tomates -> tomate, carnes -> carne, aguacates -> aguacate
    if (/[aeiou]t|[aeiou]rn|[aeiou]d|[aeiou]g/.test(base)) {
      return base + 'e';
    }
    // Casos como limones -> limon, frijoles -> frijol, champiñones -> champiñon
    return base;
  }

  // Plurales regulares en -s precedidos de vocal (ej: manzanas -> manzana, peras -> pera, huevos -> huevo)
  if (word.endsWith('s') && /[aeiou]/.test(word[word.length - 2])) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Detecta la categoría óptima para un producto aplicando:
 * 1. Reglas compuestas de máxima precedencia
 * 2. Lematización de cada término ingresado
 * 3. Búsqueda por coincidencia en diccionario extenso
 * @param {string} text - Nombre o descripción del producto
 * @returns {string} - Código de categoría ('frutas', 'carnes', 'lacteos', etc.)
 */
function detectProductCategory(text) {
  if (!text || typeof text !== 'string') return 'general';
  const rawClean = normalizeCategoryText(text);
  if (!rawClean) return 'general';

  // 1. Evaluar reglas compuestas prioritarias (evita que "jugo de naranja" caiga en frutas)
  for (const rule of COMPOUND_RULES) {
    if (rule.regex.test(rawClean)) {
      return rule.category;
    }
  }

  // 2. Extraer y lematizar las palabras del texto ingresado
  const words = rawClean.split(' ').filter((w) => w.length > 1);
  const lemmatizedWords = words.map(lemmatizeSpanishWord);
  const searchTokens = Array.from(new Set([...words, ...lemmatizedWords]));

  // 3. Buscar la mejor coincidencia en el diccionario
  let bestCategory = 'general';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const keyword of keywords) {
      const normKeyword = normalizeCategoryText(keyword);
      
      // Coincidencia con frase multi-palabra (ej: "crema de leche", "papel higienico")
      if (normKeyword.includes(' ')) {
        if (rawClean.includes(normKeyword)) {
          const score = normKeyword.length * 2;
          if (score > bestScore) {
            bestScore = score;
            bestCategory = category;
          }
        }
      } else {
        // Coincidencia con palabra lematizada
        const lemmatizedKeyword = lemmatizeSpanishWord(normKeyword);
        for (const token of searchTokens) {
          if (token === normKeyword || token === lemmatizedKeyword) {
            const score = normKeyword.length + 5;
            if (score > bestScore) {
              bestScore = score;
              bestCategory = category;
            }
          }
        }
      }
    }
  }

  return bestCategory;
}

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
const editItemCategory = document.getElementById('edit-item-category');
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

/**
 * Inicializa la aplicación, carga la meta de presupuesto y renderiza los productos.
 */
async function initApp() {
  initEventListeners();
  initModalListeners();
  if (window.mercadoDB) {
    currentBudgetGoal = await window.mercadoDB.getBudgetSetting();
  }
  renderTodos();
}

/**
 * Registra el Service Worker de la PWA para soporte 100% offline.
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          console.log('SW activo:', reg.scope);
          reg.update(); // Fuerza al navegador a comprobar actualizaciones de inmediato
        })
        .catch((err) => console.warn('SW error:', err));
    });
  }
}

/**
 * Supervisa el estado de la conexión a internet y actualiza el indicador visual.
 */
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
/**
 * Configura los escuchadores de eventos para el formulario, lista, filtros y chips.
 */
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
/**
 * Configura los eventos de interacción y envío de los modales Cupertino.
 */
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
    const newCategory = editItemCategory ? editItemCategory.value : 'general';
    const newQty = parseInt(editItemQty.value, 10) || 1;
    const newPrice = parseFloat(editItemPrice.value) || 0;
    const newStore = editItemStore.value.trim();

    if (!newName) return;

    const todos = getStoredTodos();
    const targetItem = todos.find((t) => t.id === id);
    if (targetItem) {
      targetItem.text = newName;
      targetItem.category = newCategory;
      targetItem.quantity = newQty;
      targetItem.price = newPrice;
      targetItem.store = newStore;

      saveStoredTodos(todos);

      // Si tiene precio, registrar en el histórico de IndexedDB
      if (newPrice > 0 && window.mercadoDB) {
        await window.mercadoDB.recordPrice(newName, newPrice, newCategory, newStore || 'General');
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

/**
 * Abre un modal Cupertino y bloquea el scroll del fondo.
 * @param {HTMLElement} modalEl - Elemento overlay del modal
 */
function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('active');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra un modal Cupertino y restablece el scroll.
 * @param {HTMLElement} modalEl - Elemento overlay del modal
 */
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

/**
 * Carga el catálogo completo desde IndexedDB y lo renderiza en el modal de precios.
 */
async function loadPriceHistoryCatalog() {
  if (!historyItemsContainer) return;
  historyItemsContainer.innerHTML = '<p class="modal-desc">Cargando catálogo...</p>';

  if (window.mercadoDB) {
    cachedCatalog = await window.mercadoDB.getAllCatalog();
  }

  renderPriceHistoryList(cachedCatalog);
}

/**
 * Renderiza la lista visual de productos con precios históricos y tendencias.
 * @param {Array<Object>} items - Lista de artículos del catálogo
 */
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

/**
 * Filtra los productos del catálogo histórico por nombre o tienda.
 * @param {string} query - Término de búsqueda ingresado
 */
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
/**
 * Aplica un filtro de categoría sobre la lista y actualiza el estado de los chips.
 * @param {string} categoryKey - Código de categoría ('all', 'frutas', 'carnes', etc.)
 */
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

  // 1. Consulta de catálogo previo en IndexedDB para aprender de la memoria del usuario
  let rememberedCategory = null;
  if (text.length >= 2 && window.mercadoDB) {
    const info = await window.mercadoDB.getLatestProductInfo(text);
    if (info) {
      if (info.category && CATEGORIES[info.category]) {
        rememberedCategory = info.category;
      }
      if (info.lastPrice > 0) {
        suggestedPriceValue = info.lastPrice;
        if (hintName) hintName.innerText = info.displayName;
        if (hintPrice) hintPrice.innerText = `$${info.lastPrice.toFixed(2)}`;
        if (priceHistoryHint) priceHistoryHint.style.display = 'flex';
      }
    }
  }

  // 2. Autocategorización inteligente (Prioridad: Aprendizaje del usuario > Algoritmo léxico)
  if (!manualCategorySelected || currentCategoryFilter === 'all') {
    const matchedCategory = rememberedCategory || detectProductCategory(text);
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

  if (!rememberedCategory && text.length < 3) {
    if (priceHistoryHint) priceHistoryHint.style.display = 'none';
    suggestedPriceValue = null;
  }
}

// ==========================================
// Almacenamiento Local (LocalStorage)
// ==========================================
/**
 * Obtiene la lista de compras almacenada en LocalStorage con migración de versiones previas.
 * @returns {Array<Object>} Lista de tareas/productos normalizados
 */
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

/**
 * Guarda la lista de productos en LocalStorage de forma segura.
 * @param {Array<Object>} todos - Lista de productos a persistir
 */
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
/**
 * Procesa la adición de un nuevo producto desde el formulario.
 * Valida texto, asigna categoría inteligente y persiste en LocalStorage e IndexedDB.
 * @param {Event} event - Evento de envío de formulario
 */
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

/**
 * Maneja las acciones delegadas en la lista: filtro por badge, edición por precio, completar y eliminar.
 * @param {MouseEvent} event
 */
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

/**
 * Abre el modal de edición con los datos actuales del producto.
 * @param {string} todoId - ID del producto
 */
function openEditItemModal(todoId) {
  const todos = getStoredTodos();
  const item = todos.find((t) => t.id === todoId);
  if (!item) return;

  editItemId.value = item.id;
  editItemName.value = item.text;
  if (editItemCategory) editItemCategory.value = item.category || 'general';
  editItemQty.value = item.quantity || 1;
  editItemPrice.value = item.price > 0 ? item.price : '';
  editItemStore.value = item.store || '';

  openModal(editItemModal);
}

/**
 * Alterna el estado de completado de un producto y registra su precio en el catálogo si aplica.
 * @param {string} id - ID del producto
 */
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

/**
 * Elimina un producto de la lista con animación de caída suave.
 * @param {string} id - ID del producto
 * @param {HTMLElement} element - Nodo DOM del elemento
 */
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

/**
 * Solicita confirmación y elimina en bloque todos los productos comprados.
 */
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

/**
 * Comparte la lista de compras formateada mediante la Web Share API o portapapeles.
 */
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
/**
 * Agrega gestos táctiles de deslizamiento (Swipe) para completar (derecha) o borrar (izquierda).
 * @param {HTMLElement} contentElement - Elemento que recibe el arrastre táctil
 * @param {string} todoId - ID del producto
 * @param {HTMLElement} todoContainer - Contenedor padre de la tarea
 */
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

/**
 * Dispara una respuesta háptica en dispositivos móviles compatibles.
 * @param {number|Array<number>} pattern - Duración en milisegundos o patrón de vibración
 */
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
/**
 * Renderiza la lista completa de productos en el DOM aplicando filtros activos de estado y categoría.
 */
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

/**
 * Actualiza los contadores de productos y el estado del botón de limpieza.
 * @param {Array<Object>} todos - Lista de productos cargados
 */
function updateStats(todos) {
  const total = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;
  const pendingCount = total - completedCount;

  if (currentCategoryFilter !== 'all') {
    const categoryTodos = todos.filter((t) => t.category === currentCategoryFilter);
    const catTotal = categoryTodos.length;
    const catCompleted = categoryTodos.filter((t) => t.completed).length;
    const catPending = catTotal - catCompleted;
    const catName = CATEGORIES[currentCategoryFilter]?.label || currentCategoryFilter;
    todoStats.innerText = `${catCompleted} de ${catTotal} en ${catName}`;
    footerCounter.innerText = `${catPending} restante${catPending === 1 ? '' : 's'}`;
  } else {
    todoStats.innerText = total === 0 ? '0 productos en la lista' : `${completedCount} de ${total} comprados`;
    footerCounter.innerText = `${pendingCount} restante${pendingCount === 1 ? '' : 's'}`;
  }

  if (completedCount > 0) clearCompletedBtn.classList.remove('disabled');
  else clearCompletedBtn.classList.add('disabled');
}

/**
 * Calcula en tiempo real el gasto acumulado en el carrito y actualiza la barra de progreso.
 * @param {Array<Object>} todos - Lista de productos cargados
 */
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
window.detectProductCategory = detectProductCategory;
window.CATEGORIES = CATEGORIES;
