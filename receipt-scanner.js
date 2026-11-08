/**
 * receipt-scanner.js - Escáner de Facturas y Auditor de Compras
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
      const canvases = [
        { canvas: this.preprocessCanvas(img), pageSegMode: '6' },
        { canvas: this.preprocessCanvas(img, true), pageSegMode: '11' }
      ];

      if (this.imagePreview) {
        this.imagePreview.src = img.src;
        this.imagePreview.style.display = 'block';
      }

      this.showScanningView('Iniciando lector OCR local...');
      const ocrTexts = await this.runOCR(canvases);

      this.showScanningView('Analizando productos y precios...');
      const candidates = ocrTexts.map((text) => ({
        text,
        items: this.parseReceiptText(text)
      }));
      const bestCandidate = candidates.reduce((best, candidate) => {
        const score = (items) => items.reduce((total, item) => {
          return total + 10 + (item.confidence === 'high' ? 2 : item.confidence === 'medium' ? 1 : 0);
        }, 0);
        return score(candidate.items) > score(best.items) ? candidate : best;
      });
      const { text: rawText, items: parsedItems } = bestCandidate;
      const expectedCounts = ocrTexts
        .map((text) => this.extractExpectedItemCount(text))
        .filter(Number.isInteger);
      const expectedItemCount = expectedCounts.length ? Math.max(...expectedCounts) : null;

      // Si no detectó suficientes líneas legibles, ofrecer alternativa
      if (parsedItems.length === 0) {
        this.showManualFallback(rawText);
        return;
      }

      // Comparar con la lista activa de la app
      const activeTodos = window.getStoredTodos ? window.getStoredTodos() : [];
      const auditResults = this.compareReceiptWithList(parsedItems, activeTodos);
      auditResults.expectedItemCount = expectedItemCount;
      auditResults.detectedItemCount = parsedItems.length;

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

  preprocessCanvas(img, useThreshold = false) {
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

    // Generate grayscale and thresholded images locally to handle different receipt paper and lighting.
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const grayscale = new Uint8Array(width * height);
    const histogram = new Uint32Array(256);

    for (let pixel = 0; pixel < grayscale.length; pixel++) {
      const offset = pixel * 4;
      const gray = 0.299 * d[offset] + 0.587 * d[offset + 1] + 0.114 * d[offset + 2];
      const adjusted = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.1 + 128)));
      grayscale[pixel] = adjusted;
      histogram[adjusted]++;
    }

    let threshold = 0;
    if (useThreshold) {
      const pixelCount = grayscale.length;
      let weightedSum = 0;
      for (let value = 0; value < histogram.length; value++) {
        weightedSum += value * histogram[value];
      }

      let backgroundWeight = 0;
      let backgroundSum = 0;
      let maxVariance = 0;
      for (let value = 0; value < histogram.length; value++) {
        backgroundWeight += histogram[value];
        if (backgroundWeight === 0) continue;

        const foregroundWeight = pixelCount - backgroundWeight;
        if (foregroundWeight === 0) break;

        backgroundSum += value * histogram[value];
        const backgroundMean = backgroundSum / backgroundWeight;
        const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight;
        const variance = backgroundWeight * foregroundWeight *
          (backgroundMean - foregroundMean) ** 2;

        if (variance > maxVariance) {
          maxVariance = variance;
          threshold = value;
        }
      }
    }

    for (let pixel = 0; pixel < grayscale.length; pixel++) {
      const offset = pixel * 4;
      const value = useThreshold
        ? (grayscale[pixel] > threshold ? 255 : 0)
        : grayscale[pixel];
      d[offset] = value;
      d[offset + 1] = value;
      d[offset + 2] = value;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  /**
   * Ejecución de OCR en el cliente usando Tesseract.js
   */
  async runOCR(canvases) {
    if (!window.Tesseract) {
      // Carga dinámica de la librería si no estuviese en el HTML
      await this.loadTesseractScript();
    }

    const { createWorker } = window.Tesseract;
    const worker = await createWorker({
      logger: (m) => {
        if (m.status === 'recognizing text' && this.progressBar && this.progressText) {
          const pct = Math.round(m.progress * 100);
          this.progressBar.style.width = `${pct}%`;
          this.progressText.innerText = `Leyendo texto de factura... ${pct}%`;
        }
      }
    });

    this.worker = worker;

    try {
      await worker.loadLanguage('spa');
      await worker.initialize('spa');
      this.isWorkerReady = true;

      const results = [];
      for (const [index, variant] of canvases.entries()) {
        await worker.setParameters({ tessedit_pageseg_mode: variant.pageSegMode });
        if (this.progressText) {
          this.progressText.innerText = `Probando lectura ${index + 1} de ${canvases.length}...`;
        }
        const ret = await worker.recognize(variant.canvas);
        results.push(ret.data.text || '');
      }
      return results;
    } finally {
      this.isWorkerReady = false;
      this.worker = null;
      await worker.terminate();
    }
  }

  extractExpectedItemCount(rawText) {
    const match = rawText.match(/\bTOTAL\s+[A-ZÁÉÍÓÚÑ]{0,8}\s*:?\s*(\d{1,3})\b/i);
    return match ? parseInt(match[1], 10) : null;
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

    const usesGroupedThousands = (rawText.match(/\b\d{1,3}[.,]\d{3}\b/g) || []).length >= 2;
    const amountAtEnd = /(?:[$€]\s*)?(\d[\d.,]*)\s*$/;
    const quantityUnit = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(UN|UND|UNID|U|KG|KGS|G|GR|L|LT|ML|LB)\b/i;

    for (let line of lines) {
      line = line.trim();
      if (line.length < 4) continue;

      const lower = line.toLowerCase();
      const hasIgnore = ignoreKeywords.some((kw) => lower.startsWith(kw));
      if (hasIgnore) continue;

      const totalMatch = line.match(amountAtEnd);
      if (!totalMatch) continue;

      const lineTotal = this.parseReceiptAmount(totalMatch[1]);
      if (!Number.isFinite(lineTotal) || lineTotal <= 0 || lineTotal > 100000000) continue;

      let beforeTotal = line.slice(0, totalMatch.index).trim();
      const quantityMatch = beforeTotal.match(quantityUnit);
      let name = '';
      let quantity = 1;
      let unit = 'UN';
      let unitPrice = lineTotal;
      let hasSeparateUnitPrice = false;

      if (quantityMatch) {
        name = beforeTotal.slice(0, quantityMatch.index).trim();
        quantity = parseFloat(quantityMatch[1].replace(',', '.'));
        unit = quantityMatch[2].toUpperCase();

        const trailingAmount = beforeTotal.slice(quantityMatch.index + quantityMatch[0].length).match(amountAtEnd);
        if (trailingAmount) {
          unitPrice = this.parseReceiptAmount(trailingAmount[1]);
          hasSeparateUnitPrice = Number.isFinite(unitPrice) && unitPrice > 0;
        } else if (quantity > 0) {
          unitPrice = lineTotal / quantity;
        }
      } else {
        const trailingAmount = beforeTotal.match(amountAtEnd);
        if (trailingAmount) {
          beforeTotal = beforeTotal.slice(0, trailingAmount.index).trim();
        }
        name = beforeTotal;
      }

      name = name
        .replace(/^\d{6,14}\s+/, '')
        .replace(/^\d{1,3}\s+/, '')
        .replace(/^[\d\s#*.-]+/, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (name.length < 2 || !/[a-záéíóúñ]{2}/i.test(name)) continue;

      const expectedLineTotal = unitPrice * quantity;
      const amountDifference = Math.abs(expectedLineTotal - lineTotal);
      const confidence = quantityMatch && hasSeparateUnitPrice &&
        amountDifference <= Math.max(2, lineTotal * 0.02)
        ? 'high'
        : quantityMatch && hasSeparateUnitPrice
          ? 'low'
          : 'medium';
      const ambiguousLocale = usesGroupedThousands &&
        /[.,]\d{1,2}$/.test(totalMatch[1]);

      items.push({
        name,
        normalizedName: this.normalizeString(name),
        price: lineTotal,
        lineTotal,
        unitPrice,
        quantity,
        unit,
        confidence: ambiguousLocale ? 'low' : confidence,
        needsReview: ambiguousLocale || confidence !== 'high',
        priceRaw: totalMatch[1],
        rawLine: line
      });
    }

    return items;
  }

  parseReceiptAmount(rawAmount) {
    let value = String(rawAmount || '').replace(/[^\d.,]/g, '');
    if (!value || !/\d/.test(value)) return NaN;

    const lastDot = value.lastIndexOf('.');
    const lastComma = value.lastIndexOf(',');
    const lastSeparator = Math.max(lastDot, lastComma);

    if (lastSeparator === -1) return Number(value);

    const separator = value[lastSeparator];
    const digitsAfter = value.length - lastSeparator - 1;
    const separatorCount = (value.match(/[.,]/g) || []).length;

    if (separatorCount > 1) {
      const integerPart = value.slice(0, lastSeparator).replace(/[.,]/g, '');
      const decimalPart = value.slice(lastSeparator + 1);
      if (digitsAfter === 3) return Number(integerPart + decimalPart);
      return Number(`${integerPart}.${decimalPart}`);
    }

    const integerPart = value.slice(0, lastSeparator);
    const fractionalPart = value.slice(lastSeparator + 1);
    if (digitsAfter === 3) return Number(integerPart + fractionalPart);
    if (digitsAfter <= 2) return Number(`${integerPart}.${fractionalPart}`);
    return separator === '.' ? Number(value.replace(/\./g, '')) : Number(value.replace(/,/g, ''));
  }

  formatReceiptCurrency(amount) {
    return `$${new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 2
    }).format(amount)}`;
  }

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
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
    const totalTicket = ticketItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const plannedMatchedTotal = matches.reduce((sum, m) => sum + (m.listItem.price > 0 ? m.listItem.price * (m.listItem.quantity || 1) : m.ticketItem.lineTotal), 0);
    const impulseTotal = unlisted.reduce((sum, item) => sum + item.lineTotal, 0);

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
          <span><strong>${data.unlisted.length}</strong> Imprevistos (+${this.formatReceiptCurrency(data.impulseTotal)})</span>
        </div>
        <div class="audit-stat-chip stat-missing">
          <i class="fas fa-question-circle"></i>
          <span><strong>${data.missing.length}</strong> No encontrados</span>
        </div>
      `;
    }

    const incompleteReceipt = data.expectedItemCount && data.detectedItemCount < data.expectedItemCount;
    let html = `
      <div class="audit-review-notice ${incompleteReceipt ? 'audit-review-warning' : ''}">
        <strong>${incompleteReceipt ? 'Lectura incompleta' : 'Revisa antes de confirmar'}</strong>
        <span>${incompleteReceipt
          ? `La factura indica ${data.expectedItemCount} artículos; el OCR detectó ${data.detectedItemCount}. Puede haber líneas faltantes.`
          : 'El OCR puede equivocarse. Confirma manualmente cada línea que quieras registrar.'}</span>
      </div>
    `;

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
              <span class="audit-card-name">${this.escapeHTML(m.listItem.text)}</span>
              <span class="audit-card-sub">En factura: "${this.escapeHTML(m.ticketItem.name)}"</span>
              ${m.ticketItem.confidence !== 'high' ? '<span class="audit-confidence-warning">Verifica el importe</span>' : ''}
              <label class="audit-review-field">Total de la línea
                <input type="text" inputmode="decimal" class="audit-match-total" data-index="${idx}" value="${m.ticketItem.lineTotal}" aria-label="Total de factura para ${this.escapeHTML(m.listItem.text)}" />
              </label>
            </div>
            <div class="audit-card-price">
              <span class="audit-price-tag">${this.formatReceiptCurrency(m.ticketItem.lineTotal)}</span>
              <label class="audit-add-label">
                <input type="checkbox" class="audit-match-check" data-index="${idx}" />
                <span class="custom-check"></span>
                <span>Confirmar</span>
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
              <label class="audit-review-field">Producto detectado
                <input type="text" class="audit-edit-name" data-index="${idx}" value="${this.escapeHTML(u.name)}" aria-label="Nombre del producto detectado" />
              </label>
              <span class="audit-card-sub">${u.quantity} ${this.escapeHTML(u.unit)} · Total de línea</span>
              ${u.confidence !== 'high' ? '<span class="audit-confidence-warning">Verifica nombre e importe</span>' : ''}
              <label class="audit-review-field">Total de la línea
                <input type="text" inputmode="decimal" class="audit-unlisted-total" data-index="${idx}" value="${u.lineTotal}" aria-label="Total de factura para producto detectado" />
              </label>
            </div>
            <div class="audit-card-price">
              <span class="audit-price-tag impulse-price">+${this.formatReceiptCurrency(u.lineTotal)}</span>
              <label class="audit-add-label" title="¿Agregar a tu histórico?">
                <input type="checkbox" class="audit-unlisted-check" data-index="${idx}" />
                <span>Confirmar</span>
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
            <span class="audit-card-name">${this.escapeHTML(miss.text)}</span>
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
    const matchChecks = [...document.querySelectorAll('.audit-match-check:checked')];
    const unlistedChecks = [...document.querySelectorAll('.audit-unlisted-check:checked')];
    if (matchChecks.length + unlistedChecks.length === 0) {
      alert('Confirma al menos una línea revisada antes de aplicarla.');
      return;
    }

    const reviewedMatches = matchChecks.map((checkbox) => {
      const idx = parseInt(checkbox.dataset.index, 10);
      const match = this.currentResults.matches[idx];
      const amountInput = this.auditContainer.querySelector(`.audit-match-total[data-index="${idx}"]`);
      const lineTotal = this.parseReceiptAmount(amountInput?.value);
      return { match, lineTotal };
    });
    const reviewedUnlisted = unlistedChecks.map((checkbox) => {
      const idx = parseInt(checkbox.dataset.index, 10);
      const item = this.currentResults.unlisted[idx];
      const card = checkbox.closest('.audit-card');
      const name = card?.querySelector('.audit-edit-name')?.value.trim();
      const lineTotal = this.parseReceiptAmount(card?.querySelector('.audit-unlisted-total')?.value);
      return { item, name, lineTotal };
    });

    if (reviewedMatches.some(({ match, lineTotal }) => !match || !Number.isFinite(lineTotal) || lineTotal <= 0) ||
      reviewedUnlisted.some(({ item, name, lineTotal }) => !item || !name || !Number.isFinite(lineTotal) || lineTotal <= 0)) {
      alert('Revisa que cada producto confirmado tenga un nombre y un importe válido.');
      return;
    }

    let updatedCount = 0;

    // 1. Actualizar ítems coincidentes a "Completado" y registrar precio real
    for (const { match, lineTotal } of reviewedMatches) {
      const target = todos.find((t) => t.id === match.listItem.id);
      if (target) {
        const quantityIsEach = match.ticketItem.unit === 'UN' && Number.isInteger(match.ticketItem.quantity);
        const quantity = quantityIsEach ? match.ticketItem.quantity : 1;
        const actualPrice = quantityIsEach ? lineTotal / quantity : lineTotal;
        target.completed = true;
        target.quantity = quantity;
        target.price = actualPrice;
        updatedCount++;

        if (window.mercadoDB) {
          await window.mercadoDB.recordPrice(target.text, actualPrice, target.category, 'Factura');
        }
      }
    }

    // 2. Registrar compras de impulso seleccionadas
    for (const { item, name, lineTotal } of reviewedUnlisted) {
      const quantityIsEach = item.unit === 'UN' && Number.isInteger(item.quantity);
      const quantity = quantityIsEach ? item.quantity : 1;
      const actualPrice = quantityIsEach ? lineTotal / quantity : lineTotal;
      const newImpulseItem = {
        id: `impulse_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: name,
        completed: true,
        category: 'general',
        quantity,
        price: actualPrice,
        store: 'Factura',
        createdAt: Date.now()
      };
      todos.unshift(newImpulseItem);
      updatedCount++;

      if (window.mercadoDB) {
        await window.mercadoDB.recordPrice(name, actualPrice, 'general', 'Factura');
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
          <textarea style="width: 100%; height: 90px; border-radius: 12px; border: 1px solid var(--item-border); background: var(--item-bg); padding: 0.5rem; font-family: monospace; font-size: 0.75rem; margin-top: 0.35rem; color: var(--text-primary); resize: none;" readonly>${this.escapeHTML(rawText || '(Vacío)')}</textarea>
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
        <p class="empty-desc">${this.escapeHTML(msg)}</p>
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
