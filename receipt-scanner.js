/**
 * receipt-scanner.js - Escáner de Facturas y Auditor de Compras (100% Offline)
 * Procesa fotos de tickets de supermercado mediante Canvas y Tesseract.js en el cliente,
 * compara lo comprado con lo facturado y actualiza la lista y el histórico de precios.
 */

class ReceiptScanner {
  constructor() {
    this.worker = null;
    this.isWorkerReady = false;
    this.currentResults = null;

    // Diccionario de abreviaturas frecuentes en recibos de supermercados hispanos
    this.abbreviations = {
      'lch': 'leche',
      'desl': 'deslactosada',
      'deslact': 'deslactosada',
      'ent': 'entera',
      'sem': 'semidesnatada',
      'pllo': 'pollo',
      'mzn': 'manzana',
      'mzna': 'manzana',
      'plat': 'platano',
      'huev': 'huevo',
      'jbn': 'jabon',
      'det': 'detergente',
      'arrz': 'arroz',
      'crv': 'cerveza',
      'cer': 'cerveza',
      'agu': 'agua',
      'ref': 'refresco',
      'gas': 'gaseosa',
      'panad': 'panaderia',
      'lact': 'lacteos'
    };

    this.init();
  }

  init() {
    this.cacheDOM();
    this.bindEvents();
  }

  cacheDOM() {
    this.scanBtn = document.getElementById('scan-receipt-btn');
    this.fileInput = document.getElementById('receipt-file-input');
    this.receiptModal = document.getElementById('receipt-modal');
    this.modalTitle = document.getElementById('receipt-modal-title');
    this.scanningView = document.getElementById('receipt-scanning-view');
    this.auditView = document.getElementById('receipt-audit-view');
    this.progressBar = document.getElementById('ocr-progress-fill');
    this.progressText = document.getElementById('ocr-progress-text');
    this.imagePreview = document.getElementById('receipt-image-preview');
    this.auditContainer = document.getElementById('audit-results-container');
    this.applyBtn = document.getElementById('apply-audit-btn');
    this.metricsSummary = document.getElementById('audit-metrics-summary');
  }

  bindEvents() {
    // Al pulsar el botón "Factura", abrir selector/cámara nativa del teléfono
    this.scanBtn?.addEventListener('click', () => {
      if (this.fileInput) {
        this.fileInput.value = ''; // Reset
        this.fileInput.click();
      }
    });

    // Procesar foto al seleccionarla
    this.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        this.processReceiptImage(file);
      }
    });

    // Botón para aplicar auditoría a la lista
    this.applyBtn?.addEventListener('click', () => {
      this.applyAuditToShoppingList();
    });
  }

  /**
   * Preprocesamiento de la imagen con Canvas para optimizar el contraste de tickets térmicos
   */
  async processReceiptImage(file) {
    this.openModal();
    this.showScanningView('Optimizando imagen...');

    try {
      const img = await this.loadImage(file);
      const canvas = this.preprocessCanvas(img);

      if (this.imagePreview) {
        this.imagePreview.src = img.src;
        this.imagePreview.style.display = 'block';
      }

      this.showScanningView('Iniciando lector OCR en el dispositivo...');
      const rawText = await this.runOCR(canvas);

      this.showScanningView('Analizando productos y precios...');
      const parsedItems = this.parseReceiptText(rawText);

      // Si no detectó suficientes líneas legibles, ofrecer alternativa
      if (parsedItems.length === 0) {
        this.showManualFallback(rawText);
        return;
      }

      // Comparar con la lista activa de la app
      const activeTodos = window.getStoredTodos ? window.getStoredTodos() : [];
      const auditResults = this.compareReceiptWithList(parsedItems, activeTodos);

      this.currentResults = auditResults;
      this.renderAuditView(auditResults);
    } catch (error) {
      console.error('Error procesando factura:', error);
      this.showError('No se pudo procesar la imagen. Asegúrate de enfocar bien el ticket con suficiente iluminación.');
    }
  }

  loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  preprocessCanvas(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Redimensionar para rendimiento móvil rápido (máx 1400px ancho)
    const MAX_WIDTH = 1400;
    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    // Escala de grises con contraste moderado para conservar detalles del ticket.
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const grayscale = Math.max(0, Math.min(255, (gray - 128) * 1.1 + 128));
      d[i] = grayscale;
      d[i + 1] = grayscale;
      d[i + 2] = grayscale;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Ejecución de OCR en el cliente usando Tesseract.js
   */
  async runOCR(canvas) {
    if (!window.Tesseract) {
      // Carga dinámica de la librería si no estuviese en el HTML
      await this.loadTesseractScript();
    }

    const { createWorker } = window.Tesseract;
    const worker = await createWorker('spa', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && this.progressBar && this.progressText) {
          const pct = Math.round(m.progress * 100);
          this.progressBar.style.width = `${pct}%`;
          this.progressText.innerText = `Leyendo texto de factura... ${pct}%`;
        }
      }
    });

    const ret = await worker.recognize(canvas);
    await worker.terminate();
    return ret.data.text || '';
  }

  loadTesseractScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo cargar la librería OCR'));
      document.head.appendChild(script);
    });
  }

  /**
   * Parser inteligente de recibos (extrae productos y precios de líneas de texto)
   */
  parseReceiptText(rawText) {
    const lines = rawText.split('\n');
    const items = [];

    // Palabras ignoradas (encabezados de ticket, NIF, impuestos, etc.)
    const ignoreKeywords = [
      'total', 'subtotal', 'iva', 'factura', 'ticket', 'cajero', 'fecha', 'hora',
      'tarjeta', 'visa', 'mastercard', 'gracias', 'visita', 'cambio', 'entregado',
      'cif', 'nif', 'supermercado', 'caja', 'terminal', 'importe', 'dto', 'descuento'
    ];

    // Expresión regular para detectar precios al final de la línea: ej. "12.50", "3,40", "1.99"
    const priceRegex = /(\d+[\.,]\d{2})\s*$/;

    for (let line of lines) {
      line = line.trim();
      if (line.length < 4) continue;

      const lower = line.toLowerCase();
      const hasIgnore = ignoreKeywords.some((kw) => lower.startsWith(kw) || lower.includes(` ${kw} `));
      if (hasIgnore) continue;

      const match = line.match(priceRegex);
      if (match) {
        const priceStr = match[1].replace(',', '.');
        const price = parseFloat(priceStr);
        let name = line.substring(0, match.index).trim();

        // Limpiar códigos de barras o números al inicio
        name = name.replace(/^[\d\s\-\*]+/, '').trim();

        if (name.length >= 2 && price > 0 && price < 500) {
          items.push({
            name: name,
            normalizedName: this.normalizeString(name),
            price: price,
            rawLine: line
          });
        }
      }
    }

    return items;
  }

  normalizeString(str) {
    let clean = (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();

    // Expansión de abreviaturas
    const words = clean.split(/\s+/).map((w) => this.abbreviations[w] || w);
    return words.join(' ');
  }

  /**
   * Algoritmo de comparación (Planificado vs Facturado)
   */
  compareReceiptWithList(ticketItems, listItems) {
    const matches = [];
    const unlisted = [];
    const matchedListIds = new Set();
    const matchedTicketIndices = new Set();

    // 1. Buscar coincidencias entre cada ítem del ticket y la lista de compras
    ticketItems.forEach((ticketItem, ticketIdx) => {
      let bestMatch = null;
      let highestScore = 0;

      listItems.forEach((listItem) => {
        if (matchedListIds.has(listItem.id)) return;

        const score = this.calculateSimilarity(ticketItem.normalizedName, this.normalizeString(listItem.text));
        if (score > highestScore && score >= 0.45) {
          highestScore = score;
          bestMatch = listItem;
        }
      });

      if (bestMatch) {
        matchedListIds.add(bestMatch.id);
        matchedTicketIndices.add(ticketIdx);
        matches.push({
          listItem: bestMatch,
          ticketItem: ticketItem,
          confidence: highestScore
        });
      } else {
        unlisted.push(ticketItem);
      }
    });

    // 2. Determinar los que estaban en la lista pero no aparecieron en la factura
    const missing = listItems.filter((item) => !matchedListIds.has(item.id));

    // Cálculos de totales
    const totalTicket = ticketItems.reduce((sum, item) => sum + item.price, 0);
    const plannedMatchedTotal = matches.reduce((sum, m) => sum + (m.listItem.price > 0 ? m.listItem.price * (m.listItem.quantity || 1) : m.ticketItem.price), 0);
    const impulseTotal = unlisted.reduce((sum, item) => sum + item.price, 0);

    return {
      matches,
      unlisted,
      missing,
      totalTicket,
      plannedMatchedTotal,
      impulseTotal
    };
  }

  /**
   * Cálculo de similitud léxica con soporte de palabras compartidas
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    if (str1.includes(str2) || str2.includes(str1)) return 0.85;

    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);

    let commonWords = 0;
    words1.forEach((w) => {
      if (w.length > 2 && words2.includes(w)) commonWords++;
    });

    if (commonWords > 0) {
      return (2 * commonWords) / (words1.length + words2.length);
    }

    return 0;
  }

  // ==========================================
  // Renderizado de Resultados en el Modal
  // ==========================================

  renderAuditView(data) {
    this.hideScanningView();
    if (!this.auditContainer || !this.auditView) return;

    this.auditView.style.display = 'flex';
    if (this.modalTitle) {
      this.modalTitle.innerHTML = '<i class="fas fa-receipt"></i> Auditoría: Comprado vs Facturado';
    }

    // Métricas en cabecera
    if (this.metricsSummary) {
      this.metricsSummary.innerHTML = `
        <div class="audit-stat-chip stat-match">
          <i class="fas fa-check-circle"></i>
          <span><strong>${data.matches.length}</strong> Coincidentes</span>
        </div>
        <div class="audit-stat-chip stat-impulse">
          <i class="fas fa-exclamation-triangle"></i>
          <span><strong>${data.unlisted.length}</strong> Imprevistos (+$${data.impulseTotal.toFixed(2)})</span>
        </div>
        <div class="audit-stat-chip stat-missing">
          <i class="fas fa-question-circle"></i>
          <span><strong>${data.missing.length}</strong> No encontrados</span>
        </div>
      `;
    }

    let html = '';

    // 1. Coincidentes (Verde)
    if (data.matches.length > 0) {
      html += `
        <div class="audit-group">
          <h3 class="audit-group-title text-success"><i class="fas fa-check"></i> En tu lista y facturados (${data.matches.length})</h3>
          <div class="audit-cards-list">
      `;
      data.matches.forEach((m, idx) => {
        html += `
          <div class="audit-card card-match">
            <div class="audit-card-info">
              <span class="audit-card-name">${m.listItem.text}</span>
              <span class="audit-card-sub">En ticket: "${m.ticketItem.name}"</span>
            </div>
            <div class="audit-card-price">
              <span class="audit-price-tag">$${m.ticketItem.price.toFixed(2)}</span>
              <label class="audit-checkbox-label">
                <input type="checkbox" class="audit-match-check" data-index="${idx}" checked />
                <span class="custom-check"></span>
              </label>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // 2. Compras no planificadas / Impulso (Rojo / Naranja)
    if (data.unlisted.length > 0) {
      html += `
        <div class="audit-group">
          <h3 class="audit-group-title text-impulse"><i class="fas fa-shopping-cart"></i> En la factura pero NO en tu lista (${data.unlisted.length})</h3>
          <p class="audit-group-desc">Productos cobrados que no habías planificado comprar:</p>
          <div class="audit-cards-list">
      `;
      data.unlisted.forEach((u, idx) => {
        html += `
          <div class="audit-card card-impulse">
            <div class="audit-card-info">
              <span class="audit-card-name">${u.name}</span>
              <span class="audit-card-sub">Cobrado en ticket</span>
            </div>
            <div class="audit-card-price">
              <span class="audit-price-tag impulse-price">+$${u.price.toFixed(2)}</span>
              <label class="audit-add-label" title="¿Agregar a tu histórico?">
                <input type="checkbox" class="audit-unlisted-check" data-index="${idx}" checked />
                <span>Registrar</span>
              </label>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    // 3. Faltantes (Amarillo)
    if (data.missing.length > 0) {
      html += `
        <div class="audit-group">
          <h3 class="audit-group-title text-missing"><i class="fas fa-clock"></i> En tu lista pero no detectados en factura (${data.missing.length})</h3>
          <div class="audit-cards-list">
      `;
      data.missing.forEach((miss) => {
        html += `
          <div class="audit-card card-missing">
            <span class="audit-card-name">${miss.text}</span>
            <span class="audit-badge-missing">Pendiente</span>
          </div>
        `;
      });
      html += `</div></div>`;
    }

    this.auditContainer.innerHTML = html;
  }

  /**
   * Aplica los resultados confirmados de la auditoría a la lista de compras y a IndexedDB
   */
  async applyAuditToShoppingList() {
    if (!this.currentResults) return;

    const todos = window.getStoredTodos ? window.getStoredTodos() : [];
    const matchChecks = document.querySelectorAll('.audit-match-check:checked');
    const unlistedChecks = document.querySelectorAll('.audit-unlisted-check:checked');

    let updatedCount = 0;

    // 1. Actualizar ítems coincidentes a "Completado" y registrar precio real
    for (const chk of matchChecks) {
      const idx = parseInt(chk.dataset.index, 10);
      const match = this.currentResults.matches[idx];
      if (match) {
        const target = todos.find((t) => t.id === match.listItem.id);
        if (target) {
          target.completed = true;
          target.price = match.ticketItem.price;
          updatedCount++;

          if (window.mercadoDB) {
            await window.mercadoDB.recordPrice(target.text, target.price, target.category, 'Factura');
          }
        }
      }
    }

    // 2. Registrar compras de impulso seleccionadas
    for (const chk of unlistedChecks) {
      const idx = parseInt(chk.dataset.index, 10);
      const unlisted = this.currentResults.unlisted[idx];
      if (unlisted) {
        const newImpulseItem = {
          id: `impulse_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: unlisted.name,
          completed: true,
          category: 'general',
          quantity: 1,
          price: unlisted.price,
          store: 'Factura',
          createdAt: Date.now()
        };
        todos.unshift(newImpulseItem);
        updatedCount++;

        if (window.mercadoDB) {
          await window.mercadoDB.recordPrice(unlisted.name, unlisted.price, 'general', 'Factura');
        }
      }
    }

    if (window.saveStoredTodos) {
      window.saveStoredTodos(todos);
    }

    if (window.renderTodos) {
      window.renderTodos();
    }

    this.closeModal();

    if (window.triggerHaptic) {
      window.triggerHaptic([20, 50, 20]);
    }

    alert(`✅ ¡Auditoría aplicada con éxito! Se actualizaron ${updatedCount} productos con sus precios reales de factura.`);
  }

  showManualFallback(rawText) {
    this.hideScanningView();
    if (!this.auditContainer || !this.auditView) return;
    this.auditView.style.display = 'flex';

    this.auditContainer.innerHTML = `
      <div class="empty-state visible" style="padding: 1.5rem 0;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2.2rem; color: #ff9500;"></i>
        <p class="empty-title" style="margin-top: 0.5rem;">No se detectaron precios claros</p>
        <p class="empty-desc">La imagen puede estar borrosa, con reflejos o poca luz. Puedes intentar tomar otra foto con mejor iluminación y plana.</p>
        <div style="width: 100%; margin-top: 1rem; text-align: left;">
          <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);">Texto detectado del ticket:</label>
          <textarea style="width: 100%; height: 90px; border-radius: 12px; border: 1px solid var(--item-border); background: var(--item-bg); padding: 0.5rem; font-family: monospace; font-size: 0.75rem; margin-top: 0.35rem; color: var(--text-primary); resize: none;" readonly>${rawText || '(Vacío)'}</textarea>
        </div>
      </div>
    `;

    if (this.applyBtn) this.applyBtn.style.display = 'none';
  }

  showError(msg) {
    this.hideScanningView();
    if (!this.auditContainer || !this.auditView) return;
    this.auditView.style.display = 'flex';
    this.auditContainer.innerHTML = `
      <div class="empty-state visible">
        <i class="fas fa-times-circle" style="font-size: 2.5rem; color: var(--destructive-color);"></i>
        <p class="empty-title" style="margin-top: 0.5rem;">Error en la lectura</p>
        <p class="empty-desc">${msg}</p>
      </div>
    `;
    if (this.applyBtn) this.applyBtn.style.display = 'none';
  }

  showScanningView(stepText) {
    if (this.scanningView) this.scanningView.style.display = 'flex';
    if (this.auditView) this.auditView.style.display = 'none';
    if (this.progressText) this.progressText.innerText = stepText;
    if (this.applyBtn) this.applyBtn.style.display = 'none';
    if (this.modalTitle) this.modalTitle.innerHTML = '<i class="fas fa-camera"></i> Escaneando Factura...';
  }

  hideScanningView() {
    if (this.scanningView) this.scanningView.style.display = 'none';
    if (this.applyBtn) this.applyBtn.style.display = 'block';
  }

  openModal() {
    if (this.receiptModal) {
      this.receiptModal.classList.add('active');
      this.receiptModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }

  closeModal() {
    if (this.receiptModal) {
      this.receiptModal.classList.remove('active');
      this.receiptModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }
  }
}

// Instanciar escáner al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  window.receiptScanner = new ReceiptScanner();
});
