'use strict';

const PURCHASE_UNIT_FACTORS = { г: { г: 1, кг: 0.001 }, кг: { кг: 1, г: 1000 }, мл: { мл: 1, л: 0.001 }, л: { л: 1, мл: 1000 }, шт: { шт: 1 }, порция: { порция: 1 }, уп: { уп: 1 }, упаковка: { упаковка: 1 } };

/** PostgreSQL repositories. They are optional so the local demo can run without a database. */
class OrderRepository {
  constructor(pool) { this.pool = pool; }
  async listOpen(venueId, includeClosed = false) {
    const { rows } = await this.pool.query(`SELECT o.id, o.table_id AS "tableId", o.status, o.vip_minimum AS "minimumOrderTotal", o.notes, o.created_at AS "createdAt", o.guest_id AS "guestId", g.full_name AS "guestName", g.phone AS "guestPhone",
      o.closed_at AS "closedAt", COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.order_id=o.id AND pay.status IN ('paid','partially_paid')),0) AS "finalTotal",
      COALESCE(json_agg(json_build_object('id', oi.id, 'productId', oi.product_id, 'name', p.name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'station', oi.station, 'status', oi.status)) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o LEFT JOIN guests g ON g.id=o.guest_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id
      WHERE o.venue_id=$1 ${includeClosed ? '' : "AND o.status IN ('open','in_progress','ready')"} GROUP BY o.id, g.full_name, g.phone ORDER BY o.created_at DESC`, [venueId]);
    return rows.map((row) => ({ ...row, finalTotal: Number(row.finalTotal || 0) }));
  }
  async create(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.tableId) { const active = await client.query(`SELECT id FROM orders WHERE venue_id=$1 AND table_id=$2 AND status IN ('open','in_progress','ready') LIMIT 1`, [input.venueId, input.tableId]); if (active.rows[0]) throw new Error('table_has_active_order'); }
      const { rows } = await client.query('INSERT INTO orders (venue_id, table_id, opened_by, reservation_id, vip_minimum, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, table_id AS "tableId", status, vip_minimum AS "minimumOrderTotal", notes, created_at AS "createdAt"', [input.venueId, input.tableId || null, input.openedBy, input.reservationId || null, input.vipMinimum || 0, input.notes || null]);
      if (input.tableId) await client.query(`UPDATE tables t SET status='occupied'::table_status FROM zones z WHERE t.id=$1 AND t.zone_id=z.id AND z.venue_id=$2 AND t.status <> 'blocked'`, [input.tableId, input.venueId]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

class InventoryRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId) {
    const { rows } = await this.pool.query(`SELECT i.id, i.name, i.short_name AS "shortName", i.department, i.subdepartment, i.category, i.item_type AS "itemType", i.unit, i.purchase_unit AS "purchaseUnit", i.pack_multiplier AS "packMultiplier", i.cost, i.supplier, i.barcode, i.note, i.min_stock AS "minLevel",
      COALESCE(SUM(CASE WHEN sm.direction IN ('in','transfer','adjustment') THEN sm.quantity WHEN sm.direction IN ('out','waste') THEN -sm.quantity ELSE 0 END),0) AS "onHand"
      FROM ingredients i LEFT JOIN stock_movements sm ON sm.ingredient_id=i.id AND sm.venue_id=i.venue_id
      WHERE i.venue_id=$1 AND i.is_marked=true GROUP BY i.id ORDER BY i.department,i.name`, [venueId]);
    const movements = await this.pool.query(`SELECT sm.id, sm.ingredient_id AS "itemId", i.name AS "itemName", sm.quantity, sm.direction, sm.reason, sm.created_at AS "createdAt"
      FROM stock_movements sm JOIN ingredients i ON i.id=sm.ingredient_id WHERE sm.venue_id=$1 ORDER BY sm.created_at DESC LIMIT 20`, [venueId]);
    return { items: rows.map((row) => ({ ...row, onHand: Number(row.onHand), minLevel: Number(row.minLevel), cost: Number(row.cost || 0), packMultiplier: Number(row.packMultiplier || 1) })), movements: movements.rows };
  }
  async create(venueId, input) {
    const { rows } = await this.pool.query(`INSERT INTO ingredients (venue_id,name,short_name,department,subdepartment,category,item_type,unit,purchase_unit,pack_multiplier,cost,min_stock,supplier,barcode,note,is_marked)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)
      RETURNING id,name,short_name AS "shortName",department,subdepartment,category,item_type AS "itemType",unit,purchase_unit AS "purchaseUnit",pack_multiplier AS "packMultiplier",cost,min_stock AS "minLevel",supplier,barcode,note`, [venueId, input.name, input.shortName || null, input.department || 'inventory', input.subdepartment || '', input.category || 'Без категории', input.itemType || 'ingredient', input.unit, input.purchaseUnit || null, input.packMultiplier || 1, input.cost || 0, input.minLevel || 0, input.supplier || null, input.barcode || null, input.note || null]);
    return rows[0];
  }
  async update(venueId, id, input) {
    if (input.unit !== undefined) {
      const existing = await this.pool.query('SELECT unit FROM ingredients WHERE id=$1 AND venue_id=$2', [id, venueId]);
      if (existing.rows[0] && existing.rows[0].unit !== input.unit) {
        const history = await this.pool.query('SELECT 1 FROM stock_movements WHERE ingredient_id=$1 AND venue_id=$2 LIMIT 1', [id, venueId]);
        if (history.rowCount) throw new Error('inventory_unit_has_movements');
      }
    }
    const fields = []; const values = [id, venueId]; const allowed = [['name','name'],['shortName','short_name'],['department','department'],['subdepartment','subdepartment'],['category','category'],['itemType','item_type'],['unit','unit'],['purchaseUnit','purchase_unit'],['packMultiplier','pack_multiplier'],['cost','cost'],['minLevel','min_stock'],['supplier','supplier'],['barcode','barcode'],['note','note']];
    for (const [key, column] of allowed) if (input[key] !== undefined) { values.push(input[key]); fields.push(`${column}=$${values.length}`); }
    if (!fields.length) return null;
    const { rows } = await this.pool.query(`UPDATE ingredients SET ${fields.join(',')} WHERE id=$1 AND venue_id=$2 AND is_marked=true RETURNING id,name,short_name AS "shortName",department,subdepartment,category,item_type AS "itemType",unit,purchase_unit AS "purchaseUnit",pack_multiplier AS "packMultiplier",cost,min_stock AS "minLevel",supplier,barcode,note`, values);
    return rows[0] || null;
  }
  async archive(venueId, id) { const { rows } = await this.pool.query('UPDATE ingredients SET is_marked=false WHERE id=$1 AND venue_id=$2 AND is_marked=true RETURNING id,name', [id, venueId]); return rows[0] || null; }
  async move(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: itemRows } = await client.query('SELECT id,name,unit FROM ingredients WHERE id=$1 AND venue_id=$2 AND is_marked=true FOR UPDATE', [input.ingredientId, input.venueId]);
      const item = itemRows[0];
      if (!item) throw new Error('inventory_item_not_found');
      if (input.unit && item.unit !== input.unit) throw new Error('inventory_unit_changed');
      const { rows: balanceRows } = await client.query("SELECT COALESCE(SUM(CASE WHEN direction IN ('in','transfer','adjustment') THEN quantity WHEN direction IN ('out','waste') THEN -quantity ELSE 0 END),0)::numeric AS value FROM stock_movements WHERE venue_id=$1 AND ingredient_id=$2", [input.venueId, input.ingredientId]);
      const onHandBefore = Number(balanceRows[0]?.value || 0);
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('invalid_movement_quantity');
      if (['out','waste'].includes(input.direction) && onHandBefore + 0.000001 < quantity) {
        const error = new Error('insufficient_stock'); error.code = 'insufficient_stock'; error.onHand = onHandBefore; throw error;
      }
      const { rows } = await client.query(`INSERT INTO stock_movements (venue_id, ingredient_id, direction, quantity, reason, created_by)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, ingredient_id AS "itemId", quantity, direction, reason, created_at AS "createdAt"`, [input.venueId, input.ingredientId, input.direction, quantity, input.reason || null, input.createdBy || null]);
      const sign = ['out','waste'].includes(input.direction) ? -1 : 1;
      const result = { ...rows[0], itemName: item.name, unit: item.unit, onHandBefore, onHandAfter: Number((onHandBefore + sign * quantity).toFixed(6)) };
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async receive(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: itemRows } = await client.query('SELECT id,name,unit,cost FROM ingredients WHERE id=$1 AND venue_id=$2 AND is_marked=true FOR UPDATE', [input.ingredientId, input.venueId]);
      const item = itemRows[0];
      if (!item) throw new Error('inventory_item_not_found');
      if (item.unit !== input.stockUnit) throw new Error('inventory_unit_changed');
      const quantity = Number(input.quantity);
      const factor = Number(input.conversionFactor);
      const unitCost = Number(input.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(factor) || factor <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error('invalid_supply');
      const { rows: balanceRows } = await client.query("SELECT COALESCE(SUM(CASE WHEN direction IN ('in','transfer','adjustment') THEN quantity WHEN direction IN ('out','waste') THEN -quantity ELSE 0 END),0)::numeric AS value FROM stock_movements WHERE venue_id=$1 AND ingredient_id=$2", [input.venueId, input.ingredientId]);
      const onHandBefore = Number(balanceRows[0]?.value || 0);
      const onHandAfter = onHandBefore + quantity;
      const normalizedUnitCost = unitCost / factor;
      const weightedCost = onHandAfter > 0 ? (Math.max(0, onHandBefore) * Number(item.cost || 0) + quantity * normalizedUnitCost) / onHandAfter : normalizedUnitCost;
      const { rows } = await client.query(`INSERT INTO stock_movements (venue_id, ingredient_id, direction, quantity, reason, created_by)
        VALUES ($1,$2,'in',$3,$4,$5) RETURNING id,ingredient_id AS "itemId",quantity,direction,reason,created_at AS "createdAt"`, [input.venueId, input.ingredientId, quantity, input.reason || null, input.createdBy || null]);
      await client.query('UPDATE ingredients SET cost=$1 WHERE id=$2 AND venue_id=$3', [Math.round(weightedCost * 100) / 100, input.ingredientId, input.venueId]);
      const result = { ...rows[0], itemName: item.name, unit: item.unit, onHandBefore, onHandAfter: Number(onHandAfter.toFixed(6)), weightedCost: Math.round(weightedCost * 100) / 100 };
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async setProductImage(venueId, productId, imageUrl) {
    const { rows } = await this.pool.query('UPDATE products SET image_url=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,name,image_url AS "imageUrl"', [imageUrl, productId, venueId]);
    return rows[0] || null;
  }
}

class PurchaseDocumentRepository {
  constructor(pool) { this.pool = pool; }
  static async assertSourceAutoOrder(client, venueId, sourceAutoOrderId) {
    if (!sourceAutoOrderId) return;
    const { rows } = await client.query('SELECT id,status,lines FROM inventory_auto_orders WHERE id=$1 AND venue_id=$2 FOR UPDATE', [sourceAutoOrderId, venueId]);
    if (!rows[0]) throw new Error('invalid_source_auto_order');
    if (!['sent', 'partially_received'].includes(rows[0].status)) throw new Error('source_auto_order_not_open');
    return rows[0];
  }
  static async assertAutoOrderAllocation(client, order, venueId, documentId, lines) {
    if (!order) return;
    const orderLines = Array.isArray(order.lines) ? order.lines : [];
    const orderedByItem = new Map(orderLines.map((line) => [String(line.itemId), line]));
    const requested = new Map();
    for (const line of lines) {
      const itemId = String(line.ingredientId);
      const ordered = orderedByItem.get(itemId);
      if (!ordered) throw new Error('purchase_item_not_in_auto_order');
      if (String(line.stockUnit) !== String(ordered.unit)) throw new Error('auto_order_unit_mismatch');
      requested.set(itemId, (requested.get(itemId) || 0) + Number(line.stockQuantity || 0));
    }
    const { rows } = await client.query(`SELECT l.ingredient_id AS "ingredientId",COALESCE(SUM(l.stock_quantity),0)::numeric AS reserved
      FROM inventory_purchase_documents d JOIN inventory_purchase_document_lines l ON l.document_id=d.id
      WHERE d.source_auto_order_id=$1 AND d.venue_id=$2 AND d.status='draft' AND d.id<>COALESCE($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
      GROUP BY l.ingredient_id`, [order.id, venueId, documentId || null]);
    const reservedByItem = new Map(rows.map((row) => [String(row.ingredientId), Number(row.reserved || 0)]));
    for (const [itemId, quantity] of requested) {
      const ordered = orderedByItem.get(itemId);
      const remaining = Number(ordered.quantity || 0) - Number(ordered.receivedQuantity || 0) - Number(reservedByItem.get(itemId) || 0);
      if (quantity > remaining + 0.000001) {
        const error = new Error('purchase_quantity_exceeds_auto_order');
        error.ingredientId = itemId;
        error.remaining = Math.max(0, remaining);
        throw error;
      }
    }
  }
  static lineForItem(line, item) {
    const purchaseUnit = String(item.purchaseUnit || '').trim().toLocaleLowerCase('ru-RU');
    const sourceUnit = String(line.unit || '').trim();
    const packageFactor = purchaseUnit && sourceUnit.toLocaleLowerCase('ru-RU') === purchaseUnit ? Number(item.packMultiplier || 1) : null;
    const factor = packageFactor || PURCHASE_UNIT_FACTORS[sourceUnit]?.[item.unit];
    if (!factor) { const error = new Error('invalid_purchase_unit'); error.ingredientId = line.ingredientId; error.sourceUnit = line.unit; error.targetUnit = item.unit; throw error; }
    const stockQuantity = Number((Number(line.quantity) * factor).toFixed(6));
    const receiptUnitCost = Number((Number(line.unitCost) / factor).toFixed(6));
    return { ...line, stockUnit: item.unit, packMultiplier: factor, stockQuantity, receiptUnitCost, lineTotal: Number((Number(line.quantity) * Number(line.unitCost)).toFixed(2)) };
  }
  static mapDocument(row) {
    if (!row) return null;
    return { ...row, lineCount: Number(row.lineCount || 0), totalCost: Number(row.totalCost || 0), lines: (row.lines || []).map((line) => ({ ...line, quantity: Number(line.quantity), packMultiplier: Number(line.packMultiplier), stockQuantity: Number(line.stockQuantity), unitCost: Number(line.unitCost), receiptUnitCost: Number(line.receiptUnitCost), lineTotal: Number(line.lineTotal) })) };
  }
  async list(venueId, status) {
    const params = [venueId];
    const statusClause = status ? ` AND d.status=$${params.push(status)}` : '';
    const { rows } = await this.pool.query(`SELECT d.id,d.venue_id AS "venueId",d.supplier_name AS "supplierName",d.document_number AS "documentNumber",d.document_date AS "documentDate",d.recorded_at AS "recordedAt",d.status,d.note,d.source_auto_order_id AS "sourceAutoOrderId",d.created_by AS "createdBy",d.posted_by AS "postedBy",d.posted_at AS "postedAt",COUNT(l.id)::int AS "lineCount",COALESCE(SUM(l.line_total),0) AS "totalCost",COALESCE(json_agg(json_build_object('id',l.id,'ingredientId',l.ingredient_id,'ingredientName',l.ingredient_name_snapshot,'stockUnit',l.stock_unit,'quantity',l.quantity,'unit',l.unit,'packMultiplier',l.pack_multiplier,'stockQuantity',l.stock_quantity,'unitCost',l.unit_cost,'receiptUnitCost',l.receipt_unit_cost,'lineTotal',l.line_total,'sourceMovementId',l.source_movement_id) ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL),'[]'::json) AS lines
      FROM inventory_purchase_documents d LEFT JOIN inventory_purchase_document_lines l ON l.document_id=d.id
      WHERE d.venue_id=$1${statusClause} GROUP BY d.id ORDER BY d.document_date DESC,d.recorded_at DESC`, params);
    return rows.map(PurchaseDocumentRepository.mapDocument);
  }
  async get(venueId, id, client = this.pool) {
    const { rows } = await client.query(`SELECT d.id,d.venue_id AS "venueId",d.supplier_name AS "supplierName",d.document_number AS "documentNumber",d.document_date AS "documentDate",d.recorded_at AS "recordedAt",d.status,d.note,d.source_auto_order_id AS "sourceAutoOrderId",d.created_by AS "createdBy",d.posted_by AS "postedBy",d.posted_at AS "postedAt",COUNT(l.id)::int AS "lineCount",COALESCE(SUM(l.line_total),0) AS "totalCost",COALESCE(json_agg(json_build_object('id',l.id,'ingredientId',l.ingredient_id,'ingredientName',l.ingredient_name_snapshot,'stockUnit',l.stock_unit,'quantity',l.quantity,'unit',l.unit,'packMultiplier',l.pack_multiplier,'stockQuantity',l.stock_quantity,'unitCost',l.unit_cost,'receiptUnitCost',l.receipt_unit_cost,'lineTotal',l.line_total,'sourceMovementId',l.source_movement_id) ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL),'[]'::json) AS lines
      FROM inventory_purchase_documents d LEFT JOIN inventory_purchase_document_lines l ON l.document_id=d.id WHERE d.id=$1 AND d.venue_id=$2 GROUP BY d.id`, [id, venueId]);
    return PurchaseDocumentRepository.mapDocument(rows[0]);
  }
  async saveDraft(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sourceOrder = await PurchaseDocumentRepository.assertSourceAutoOrder(client, input.venueId, input.sourceAutoOrderId);
      const { rows } = await client.query(`INSERT INTO inventory_purchase_documents (venue_id,supplier_name,document_number,document_date,note,source_auto_order_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [input.venueId, input.supplierName, input.documentNumber || null, input.documentDate, input.note || null, input.sourceAutoOrderId || null, input.createdBy || null]);
      const documentId = rows[0].id;
      const normalizedLines = [];
      for (const line of input.lines || []) {
        const item = await client.query('SELECT id,name,unit,purchase_unit AS "purchaseUnit",pack_multiplier AS "packMultiplier" FROM ingredients WHERE id=$1 AND venue_id=$2 AND is_marked=true', [line.ingredientId, input.venueId]);
        if (!item.rows[0]) { const error = new Error('purchase_ingredient_not_found'); error.ingredientId = line.ingredientId; throw error; }
        const normalized = PurchaseDocumentRepository.lineForItem(line, item.rows[0]);
        normalizedLines.push({ ...normalized, ingredientId: item.rows[0].id, stockUnit: item.rows[0].unit });
        await client.query(`INSERT INTO inventory_purchase_document_lines (document_id,venue_id,ingredient_id,ingredient_name_snapshot,stock_unit,quantity,unit,pack_multiplier,stock_quantity,unit_cost,receipt_unit_cost,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [documentId, input.venueId, item.rows[0].id, item.rows[0].name, normalized.stockUnit, normalized.quantity, normalized.unit, normalized.packMultiplier, normalized.stockQuantity, normalized.unitCost, normalized.receiptUnitCost, normalized.lineTotal]);
      }
      await PurchaseDocumentRepository.assertAutoOrderAllocation(client, sourceOrder, input.venueId, documentId, normalizedLines);
      const document = await this.get(input.venueId, documentId, client);
      await client.query('COMMIT');
      return document;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async updateDraft(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT id,status FROM inventory_purchase_documents WHERE id=$1 AND venue_id=$2 FOR UPDATE', [input.id, input.venueId]);
      if (!current.rows[0]) { const error = new Error('purchase_document_not_found'); throw error; }
      if (current.rows[0].status !== 'draft') { const error = new Error('purchase_document_not_draft'); throw error; }
      const sourceOrder = await PurchaseDocumentRepository.assertSourceAutoOrder(client, input.venueId, input.sourceAutoOrderId);
      await client.query('UPDATE inventory_purchase_documents SET supplier_name=$1,document_number=$2,document_date=$3,note=$4,source_auto_order_id=$5 WHERE id=$6 AND venue_id=$7', [input.supplierName, input.documentNumber || null, input.documentDate, input.note || null, input.sourceAutoOrderId || null, input.id, input.venueId]);
      await client.query('DELETE FROM inventory_purchase_document_lines WHERE document_id=$1', [input.id]);
      const normalizedLines = [];
      for (const line of input.lines || []) {
        const item = await client.query('SELECT id,name,unit,purchase_unit AS "purchaseUnit",pack_multiplier AS "packMultiplier" FROM ingredients WHERE id=$1 AND venue_id=$2 AND is_marked=true', [line.ingredientId, input.venueId]);
        if (!item.rows[0]) { const error = new Error('purchase_ingredient_not_found'); error.ingredientId = line.ingredientId; throw error; }
        const normalized = PurchaseDocumentRepository.lineForItem(line, item.rows[0]);
        normalizedLines.push({ ...normalized, ingredientId: item.rows[0].id, stockUnit: item.rows[0].unit });
        await client.query(`INSERT INTO inventory_purchase_document_lines (document_id,venue_id,ingredient_id,ingredient_name_snapshot,stock_unit,quantity,unit,pack_multiplier,stock_quantity,unit_cost,receipt_unit_cost,line_total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [input.id, input.venueId, item.rows[0].id, item.rows[0].name, normalized.stockUnit, normalized.quantity, normalized.unit, normalized.packMultiplier, normalized.stockQuantity, normalized.unitCost, normalized.receiptUnitCost, normalized.lineTotal]);
      }
      await PurchaseDocumentRepository.assertAutoOrderAllocation(client, sourceOrder, input.venueId, input.id, normalizedLines);
      const document = await this.get(input.venueId, input.id, client);
      await client.query('COMMIT');
      return document;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
  async post(venueId, id, actorId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const docResult = await client.query('SELECT id,status,supplier_name AS "supplierName",document_number AS "documentNumber",source_auto_order_id AS "sourceAutoOrderId" FROM inventory_purchase_documents WHERE id=$1 AND venue_id=$2 FOR UPDATE', [id, venueId]);
      const doc = docResult.rows[0];
      if (!doc) { const error = new Error('purchase_document_not_found'); throw error; }
      if (doc.status !== 'draft') { const error = new Error('purchase_document_not_postable'); error.status = doc.status; throw error; }
      const sourceOrder = await PurchaseDocumentRepository.assertSourceAutoOrder(client, venueId, doc.sourceAutoOrderId);
      const lines = await client.query(`SELECT l.*,i.cost AS current_cost,i.unit AS current_stock_unit,i.purchase_unit AS current_purchase_unit,i.pack_multiplier AS current_pack_multiplier FROM inventory_purchase_document_lines l JOIN ingredients i ON i.id=l.ingredient_id AND i.venue_id=l.venue_id WHERE l.document_id=$1 AND l.venue_id=$2 ORDER BY l.ingredient_id,l.id FOR UPDATE OF l,i`, [id, venueId]);
      if (!lines.rowCount) { const error = new Error('purchase_document_empty'); throw error; }
      const staleUnit = lines.rows.find((line) => {
        const purchaseUnit = String(line.current_purchase_unit || '').trim().toLocaleLowerCase('ru-RU');
        const sourceUnit = String(line.unit || '').trim();
        const factor = purchaseUnit && sourceUnit.toLocaleLowerCase('ru-RU') === purchaseUnit
          ? Number(line.current_pack_multiplier || 1)
          : PURCHASE_UNIT_FACTORS[sourceUnit]?.[line.current_stock_unit];
        return line.stock_unit !== line.current_stock_unit || !factor || Number(line.pack_multiplier) !== Number(factor);
      });
      if (staleUnit) { const error = new Error('purchase_item_unit_changed'); error.ingredientId = staleUnit.ingredient_id; throw error; }
      if (sourceOrder) {
        await PurchaseDocumentRepository.assertAutoOrderAllocation(client, sourceOrder, venueId, id, lines.rows.map((line) => ({ ingredientId: line.ingredient_id, stockUnit: line.stock_unit, stockQuantity: line.stock_quantity })));
      }
      const movementIds = [];
      let totalCost = 0;
      const currentCosts = new Map(lines.rows.map((line) => [line.ingredient_id, Number(line.current_cost || 0)]));
      for (const line of lines.rows) {
        const movement = await client.query(`INSERT INTO stock_movements (venue_id,ingredient_id,direction,quantity,reason,created_by) VALUES ($1,$2,'in',$3,$4,$5) RETURNING id`, [venueId, line.ingredient_id, line.stock_quantity, `Поставка по документу ${doc.document_number || id}`, actorId || null]);
        const onHand = await client.query("SELECT COALESCE(SUM(CASE WHEN direction IN ('in','transfer','adjustment') THEN quantity WHEN direction IN ('out','waste') THEN -quantity ELSE 0 END),0)::numeric AS value FROM stock_movements WHERE venue_id=$1 AND ingredient_id=$2", [venueId, line.ingredient_id]);
        const oldOnHand = Number(onHand.rows[0]?.value || 0) - Number(line.stock_quantity);
        const newOnHand = Number(onHand.rows[0]?.value || 0);
        const nextCost = newOnHand > 0 ? ((Math.max(0, oldOnHand) * Number(currentCosts.get(line.ingredient_id) || 0)) + (Number(line.stock_quantity) * Number(line.receipt_unit_cost))) / newOnHand : Number(line.receipt_unit_cost);
        await client.query('UPDATE ingredients SET cost=$1 WHERE id=$2 AND venue_id=$3', [Math.round(nextCost * 100) / 100, line.ingredient_id, venueId]);
        currentCosts.set(line.ingredient_id, Math.round(nextCost * 100) / 100);
        await client.query('UPDATE inventory_purchase_document_lines SET source_movement_id=$1 WHERE id=$2', [movement.rows[0].id, line.id]);
        movementIds.push(movement.rows[0].id); totalCost += Number(line.line_total || 0);
      }
      await client.query('UPDATE inventory_purchase_documents SET status=\'posted\',posted_by=$1,posted_at=now() WHERE id=$2 AND venue_id=$3', [actorId || null, id, venueId]);
      if (sourceOrder) {
        const receivedByItem = new Map();
        for (const line of lines.rows) receivedByItem.set(String(line.ingredient_id), (receivedByItem.get(String(line.ingredient_id)) || 0) + Number(line.stock_quantity || 0));
        const nextLines = (Array.isArray(sourceOrder.lines) ? sourceOrder.lines : []).map((line) => ({ ...line, receivedQuantity: Number((Number(line.receivedQuantity || 0) + (receivedByItem.get(String(line.itemId)) || 0)).toFixed(6)) }));
        const fullyReceived = nextLines.length > 0 && nextLines.every((line) => Number(line.receivedQuantity || 0) >= Number(line.quantity || 0) - 0.000001);
        const nextStatus = fullyReceived ? 'received' : 'partially_received';
        await client.query('UPDATE inventory_auto_orders SET status=$1,lines=$2::jsonb,updated_at=now() WHERE id=$3 AND venue_id=$4', [nextStatus, JSON.stringify(nextLines), sourceOrder.id, venueId]);
      }
      const document = await this.get(venueId, id, client);
      await client.query('COMMIT');
      return { document, movementIds, totalCost: Math.round(totalCost * 100) / 100 };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  }
}

class ProductRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId) {
    const { rows } = await this.pool.query(`SELECT id,name,category,sale_price AS price,category AS station,search_aliases AS aliases,image_url AS "imageUrl"
      FROM products WHERE venue_id=$1 AND is_active=true ORDER BY name`, [venueId]);
    return rows.map((row) => ({ ...row, price: Number(row.price), aliases: row.aliases || [] }));
  }
  async create(input) {
    const { rows } = await this.pool.query(`INSERT INTO products (venue_id,name,category,sale_price,search_aliases,image_url)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,name,category,sale_price AS price,category AS station,search_aliases AS aliases,image_url AS "imageUrl"`,
      [input.venueId, input.name, input.category, input.price, input.aliases, input.imageUrl || null]);
    return rows[0] ? { ...rows[0], price: Number(rows[0].price), aliases: rows[0].aliases || [] } : null;
  }
  async update(venueId, id, input) {
    const fields = []; const values = [id, venueId];
    for (const [column, value] of [['name', input.name], ['category', input.category], ['sale_price', input.price], ['search_aliases', input.aliases], ['image_url', input.imageUrl]]) {
      if (value !== undefined) { values.push(value); fields.push(`${column}=$${values.length}`); }
    }
    if (!fields.length) return null;
    const { rows } = await this.pool.query(`UPDATE products SET ${fields.join(',')} WHERE id=$1 AND venue_id=$2 AND is_active=true
      RETURNING id,name,category,sale_price AS price,category AS station,search_aliases AS aliases,image_url AS "imageUrl"`, values);
    return rows[0] ? { ...rows[0], price: Number(rows[0].price), aliases: rows[0].aliases || [] } : null;
  }
  async deactivate(venueId, id) {
    const { rows } = await this.pool.query('UPDATE products SET is_active=false WHERE id=$1 AND venue_id=$2 AND is_active=true RETURNING id,name', [id, venueId]);
    return rows[0] || null;
  }
}

class ReservationRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId, date) {
    const params = [venueId];
    const dateClause = date ? ` AND r.starts_at::date=$2` : '';
    if (date) params.push(date);
    const { rows } = await this.pool.query(`SELECT r.id, g.full_name AS "guestName", g.phone, r.starts_at::date AS date, to_char(r.starts_at,'HH24:MI') AS time,
      r.table_id AS "tableId", t.name AS "tableName", r.guests_count AS guests, r.deposit_paid AS deposit, r.status, r.notes
      FROM reservations r LEFT JOIN guests g ON g.id=r.guest_id LEFT JOIN tables t ON t.id=r.table_id
      WHERE r.venue_id=$1${dateClause} ORDER BY r.starts_at`, params);
    return rows;
  }
  async create(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const guest = input.clientId ? await client.query('SELECT id FROM guests WHERE id=$1 AND venue_id=$2', [input.clientId, input.venueId]) : await client.query(`INSERT INTO guests (venue_id, phone, full_name) VALUES ($1,$2,$3) ON CONFLICT (venue_id, phone) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`, [input.venueId, input.phone || null, input.guestName]); if (!guest.rows[0]) throw new Error('guest_not_found');
      const { rows } = await client.query(`INSERT INTO reservations (venue_id, table_id, guest_id, starts_at, guests_count, deposit_required, deposit_paid, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$6,'confirmed',$7) RETURNING id`, [input.venueId, input.tableId, guest.rows[0].id, `${input.date}T${input.time}:00`, input.guests || 1, input.deposit || 0, input.notes || null]);
      await client.query('UPDATE tables t SET status=$1 FROM zones z WHERE t.id=$2 AND t.zone_id=z.id AND z.venue_id=$3', ['reserved', input.tableId, input.venueId]);
      await client.query('COMMIT');
      return { ...input, id: rows[0].id, status: 'confirmed' };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

class AuditRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId, filters = {}) {
    const params = [venueId];
    const clauses = ['a.venue_id=$1'];
    if (filters.action) { params.push(filters.action); clauses.push(`a.action=$${params.length}`); }
    if (filters.entityType) { params.push(filters.entityType); clauses.push(`a.entity_type=$${params.length}`); }
    if (filters.from) { params.push(filters.from); clauses.push(`a.created_at >= $${params.length}::date`); }
    if (filters.to) { params.push(filters.to); clauses.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`); }
    const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 300);
    params.push(limit);
    const { rows } = await this.pool.query(`SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId", a.actor_id AS "actorId", COALESCE(u.full_name, 'система') AS actor, a.before_data AS "beforeData", a.after_data AS "afterData", a.created_at AS "createdAt" FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE ${clauses.join(' AND ')} ORDER BY a.created_at DESC LIMIT $${params.length}`, params);
    return rows;
  }
  async record(input) {
    await this.pool.query(`INSERT INTO audit_events (venue_id, actor_id, action, entity_type, entity_id, before_data, after_data) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [input.venueId, input.actorId || null, input.action, input.entityType, input.entityId || null, input.beforeData || null, input.afterData || null]);
  }
}

class SessionRepository {
  constructor(pool) { this.pool = pool; }
  async create(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO auth_sessions (user_id,device_id,token_hash,expires_at,active_venue_id) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,active_venue_id=COALESCE(EXCLUDED.active_venue_id,auth_sessions.active_venue_id),created_at=now()`, [input.userId, input.deviceId, input.tokenHash, input.expiresAt, input.activeVenueId || null]);
      await client.query(`WITH ranked AS (SELECT token_hash,row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS position FROM auth_sessions WHERE user_id=$1 AND expires_at>now()) DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM ranked WHERE position>2)`, [input.userId]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async get(tokenHash) {
    const { rows } = await this.pool.query(`SELECT s.id,u.id AS "userId",u.organization_id AS "organizationId",COALESCE(s.active_venue_id,u.venue_id) AS "venueId",u.full_name AS name,u.role,u.avatar_url AS "avatarUrl",u.telegram_url AS telegram,u.phone_numbers AS "phoneNumbers",u.permission_scopes AS "permissionScopes"
      FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true`, [tokenHash]);
    return rows[0] || null;
  }
  async setActiveVenue(tokenHash, venueId) { await this.pool.query('UPDATE auth_sessions SET active_venue_id=$1 WHERE token_hash=$2', [venueId, tokenHash]); }
  async remove(tokenHash) { await this.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [tokenHash]); }
}

function createRepositories(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) return null;
  let pg;
  try { pg = require('pg'); } catch { return null; }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX || 10), idleTimeoutMillis: 30000 });
  return { pool, orders: new OrderRepository(pool), inventory: new InventoryRepository(pool), purchaseDocuments: new PurchaseDocumentRepository(pool), products: new ProductRepository(pool), reservations: new ReservationRepository(pool), audit: new AuditRepository(pool), sessions: new SessionRepository(pool) };
}

function createOrderRepository(databaseUrl = process.env.DATABASE_URL) { return createRepositories(databaseUrl)?.orders || null; }

module.exports = { OrderRepository, InventoryRepository, PurchaseDocumentRepository, ProductRepository, ReservationRepository, AuditRepository, SessionRepository, createRepositories, createOrderRepository };
