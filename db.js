/**
 * db.js - Gestor de Base de Datos Local con IndexedDB
 * 100% Offline, privado y sin dependencias externas.
 * Administra el histórico de precios, catálogo de productos y metas de presupuesto.
 */

const DB_NAME = 'MercadoAppDB';
const DB_VERSION = 1;

class MercadoDB {
  constructor() {
    this.db = null;
    this.isReady = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Almacén para el catálogo general de productos (último precio, menor precio, categoría)
        if (!db.objectStoreNames.contains('catalog')) {
          const catalogStore = db.createObjectStore('catalog', { keyPath: 'normalizedName' });
          catalogStore.createIndex('category', 'category', { unique: false });
          catalogStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }

        // Almacén para el histórico detallado de compras y variaciones de precio
        if (!db.objectStoreNames.contains('price_history')) {
          const historyStore = db.createObjectStore('price_history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('normalizedName', 'normalizedName', { unique: false });
          historyStore.createIndex('date', 'date', { unique: false });
        }

        // Almacén para ajustes de presupuesto y moneda
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.warn('Error al abrir IndexedDB, usando fallback:', event.target.error);
        resolve(null);
      };
    });
  }

  normalizeName(name) {
    let clean = (name || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ');

    // Singularización simple de palabras en español para unificar catálogo
    const words = clean.split(' ').map((word) => {
      if (word.length <= 3) return word;
      const INVARIABLES = new Set(['arroz', 'res', 'gas', 'queso', 'anana', 'maiz']);
      if (INVARIABLES.has(word)) return word;
      if (word.endsWith('ces') && word.length > 4) return word.slice(0, -3) + 'z';
      if (word.endsWith('es') && word.length > 4) {
        const base = word.slice(0, -2);
        if (/[aeiou]t|[aeiou]rn|[aeiou]d|[aeiou]g/.test(base)) return base + 'e';
        return base;
      }
      if (word.endsWith('s') && /[aeiou]/.test(word[word.length - 2])) return word.slice(0, -1);
      return word;
    });

    return words.join(' ').trim();
  }

  /**
   * Guarda o actualiza un precio para un producto en el catálogo y añade un registro histórico.
   */
  async recordPrice(productName, price, category = 'general', store = 'General') {
    if (!productName || !price || isNaN(price) || price <= 0) return null;
    await this.isReady;

    const normalized = this.normalizeName(productName);
    const numPrice = parseFloat(price);
    const now = Date.now();

    if (!this.db) {
      // Fallback a localStorage si IndexedDB no está disponible
      this._saveFallbackPrice(normalized, productName, numPrice, category, now);
      return;
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['catalog', 'price_history'], 'readwrite');
      const catalogStore = tx.objectStore('catalog');
      const historyStore = tx.objectStore('price_history');

      // 1. Obtener registro previo para calcular tendencias
      const getReq = catalogStore.get(normalized);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        let trend = 'same'; // 'up' | 'down' | 'same'
        let minPrice = numPrice;
        let maxPrice = numPrice;

        if (existing) {
          if (numPrice > existing.lastPrice) trend = 'up';
          else if (numPrice < existing.lastPrice) trend = 'down';

          minPrice = Math.min(existing.minPrice || numPrice, numPrice);
          maxPrice = Math.max(existing.maxPrice || numPrice, numPrice);
        }

        // 2. Guardar en catálogo
        catalogStore.put({
          normalizedName: normalized,
          displayName: productName.trim(),
          category: category,
          lastPrice: numPrice,
          minPrice: minPrice,
          maxPrice: maxPrice,
          previousPrice: existing ? existing.lastPrice : numPrice,
          trend: trend,
          lastUpdated: now,
          store: store
        });

        // 3. Agregar entrada al histórico
        historyStore.add({
          normalizedName: normalized,
          displayName: productName.trim(),
          price: numPrice,
          category: category,
          store: store,
          date: now
        });
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  /**
   * Busca en el catálogo el último precio conocido de un producto.
   */
  async getLatestProductInfo(productName) {
    if (!productName) return null;
    await this.isReady;
    const normalized = this.normalizeName(productName);

    if (!this.db) {
      return this._getFallbackPrice(normalized);
    }

    return new Promise((resolve) => {
      const tx = this.db.transaction(['catalog'], 'readonly');
      const store = tx.objectStore('catalog');
      const req = store.get(normalized);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  /**
   * Obtiene todos los productos registrados en el catálogo de precios.
   */
  async getAllCatalog() {
    await this.isReady;
    if (!this.db) return this._getAllFallback();

    return new Promise((resolve) => {
      const tx = this.db.transaction(['catalog'], 'readonly');
      const store = tx.objectStore('catalog');
      const req = store.getAll();

      req.onsuccess = () => {
        const items = req.result || [];
        // Ordenar por última actualización
        items.sort((a, b) => b.lastUpdated - a.lastUpdated);
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  }

  /**
   * Obtiene el histórico completo de variaciones de un producto específico.
   */
  async getProductHistory(productName) {
    if (!productName) return [];
    await this.isReady;
    const normalized = this.normalizeName(productName);

    if (!this.db) return [];

    return new Promise((resolve) => {
      const tx = this.db.transaction(['price_history'], 'readonly');
      const store = tx.objectStore('price_history');
      const index = store.index('normalizedName');
      const req = index.getAll(normalized);

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => b.date - a.date);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  /**
   * Guarda o consulta la meta de presupuesto del usuario.
   */
  async getBudgetSetting() {
    const raw = localStorage.getItem('mercado_budget_goal');
    return raw ? parseFloat(raw) : 0;
  }

  async setBudgetSetting(amount) {
    localStorage.setItem('mercado_budget_goal', amount ? parseFloat(amount) : 0);
  }

  // --- Fallback LocalStorage ---
  _saveFallbackPrice(normalized, name, price, category, now) {
    try {
      const catalog = JSON.parse(localStorage.getItem('mercado_catalog_fallback') || '{}');
      catalog[normalized] = {
        normalizedName: normalized,
        displayName: name,
        category,
        lastPrice: price,
        minPrice: price,
        maxPrice: price,
        lastUpdated: now
      };
      localStorage.setItem('mercado_catalog_fallback', JSON.stringify(catalog));
    } catch (_) {}
  }

  _getFallbackPrice(normalized) {
    try {
      const catalog = JSON.parse(localStorage.getItem('mercado_catalog_fallback') || '{}');
      return catalog[normalized] || null;
    } catch (_) {
      return null;
    }
  }

  _getAllFallback() {
    try {
      const catalog = JSON.parse(localStorage.getItem('mercado_catalog_fallback') || '{}');
      return Object.values(catalog);
    } catch (_) {
      return [];
    }
  }
}

// Instancia global disponible en la app
window.mercadoDB = new MercadoDB();
