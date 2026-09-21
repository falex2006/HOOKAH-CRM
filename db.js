'use strict';

/** PostgreSQL repositories. They are optional so the local demo can run without a database. */
class OrderRepository {
  constructor(pool) { this.pool = pool; }
  async listOpen(venueId, includeClosed = false) {
    const { rows } = await this.pool.query(`SELECT o.id, o.table_id AS "tableId", o.status, o.vip_minimum AS "minimumOrderTotal", o.notes, o.created_at AS "createdAt", o.guest_id AS "guestId", g.full_name AS "guestName", g.phone AS "guestPhone",
      o.closed_at AS "closedAt", COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.order_id=o.id AND pay.status IN ('paid','partially_paid')),0) AS "finalTotal",
      COALESCE(json_agg(json_build_object('id', oi.id, 'productId', oi.product_id, 'name', p.name, 'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'station', oi.station, 'status', oi.status)) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o LEFT JOIN guests g ON g.id=o.guest_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id
      WHERE o.venue_id=$1 ${includeClosed ? '' : "AND o.status IN ('open','in_progress','ready')"} GROUP BY o.id ORDER BY o.created_at DESC`, [venueId]);
    return rows.map((row) => ({ ...row, finalTotal: Number(row.finalTotal || 0) }));
  }
  async create(input) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (input.tableId) { const active = await client.query(`SELECT id FROM orders WHERE venue_id=$1 AND table_id=$2 AND status IN ('open','in_progress','ready') LIMIT 1`, [input.venueId, input.tableId]); if (active.rows[0]) throw new Error('table_has_active_order'); }
      const { rows } = await client.query('INSERT INTO orders (venue_id, table_id, opened_by, reservation_id, vip_minimum, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, table_id AS "tableId", status, vip_minimum AS "minimumOrderTotal", notes, created_at AS "createdAt"', [input.venueId, input.tableId || null, input.openedBy, input.reservationId || null, input.vipMinimum || 0, input.notes || null]);
      if (input.tableId) await client.query(`UPDATE tables SET status='occupied' WHERE id=$1 AND venue_id=$2 AND status <> 'blocked'`, [input.tableId, input.venueId]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

class InventoryRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId) {
    const { rows } = await this.pool.query(`SELECT i.id, i.name, i.category, i.unit, i.min_stock AS "minLevel",
      COALESCE(SUM(CASE WHEN sm.direction IN ('in','transfer','adjustment') THEN sm.quantity WHEN sm.direction IN ('out','waste') THEN -sm.quantity ELSE 0 END),0) AS "onHand"
      FROM ingredients i LEFT JOIN stock_movements sm ON sm.ingredient_id=i.id AND sm.venue_id=i.venue_id
      WHERE i.venue_id=$1 GROUP BY i.id ORDER BY i.name`, [venueId]);
    const movements = await this.pool.query(`SELECT sm.id, sm.ingredient_id AS "itemId", i.name AS "itemName", sm.quantity, sm.direction, sm.reason, sm.created_at AS "createdAt"
      FROM stock_movements sm JOIN ingredients i ON i.id=sm.ingredient_id WHERE sm.venue_id=$1 ORDER BY sm.created_at DESC LIMIT 20`, [venueId]);
    return { items: rows.map((row) => ({ ...row, onHand: Number(row.onHand), minLevel: Number(row.minLevel) })), movements: movements.rows };
  }
  async move(input) {
    const { rows } = await this.pool.query(`INSERT INTO stock_movements (venue_id, ingredient_id, direction, quantity, reason, created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, ingredient_id AS "itemId", quantity, direction, reason, created_at AS "createdAt"`, [input.venueId, input.ingredientId, input.direction, input.quantity, input.reason || null, input.createdBy || null]);
    return rows[0];
  }
  async setProductImage(venueId, productId, imageUrl) {
    const { rows } = await this.pool.query('UPDATE products SET image_url=$1 WHERE id=$2 AND venue_id=$3 RETURNING id,name,image_url AS "imageUrl"', [imageUrl, productId, venueId]);
    return rows[0] || null;
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
      const guest = await client.query(`INSERT INTO guests (phone, full_name) VALUES ($1,$2) ON CONFLICT (phone) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`, [input.phone || null, input.guestName]);
      const { rows } = await client.query(`INSERT INTO reservations (venue_id, table_id, guest_id, starts_at, guests_count, deposit_required, deposit_paid, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$6,'confirmed',$7) RETURNING id`, [input.venueId, input.tableId, guest.rows[0].id, `${input.date}T${input.time}:00`, input.guests || 1, input.deposit || 0, input.notes || null]);
      await client.query('UPDATE tables SET status=$1 WHERE id=$2 AND venue_id=$3', ['reserved', input.tableId, input.venueId]);
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
    await this.pool.query('INSERT INTO auth_sessions (user_id,token_hash,expires_at) VALUES ($1,$2,$3)', [input.userId, input.tokenHash, input.expiresAt]);
  }
  async get(tokenHash) {
    const { rows } = await this.pool.query(`SELECT s.id,u.id AS "userId",u.full_name AS name,u.role,u.avatar_url AS "avatarUrl",u.telegram_url AS telegram,u.phone_numbers AS "phoneNumbers"
      FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.is_active=true`, [tokenHash]);
    return rows[0] || null;
  }
  async remove(tokenHash) { await this.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [tokenHash]); }
}

function createRepositories(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) return null;
  let pg;
  try { pg = require('pg'); } catch { return null; }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX || 10), idleTimeoutMillis: 30000 });
  return { pool, orders: new OrderRepository(pool), inventory: new InventoryRepository(pool), products: new ProductRepository(pool), reservations: new ReservationRepository(pool), audit: new AuditRepository(pool), sessions: new SessionRepository(pool) };
}

function createOrderRepository(databaseUrl = process.env.DATABASE_URL) { return createRepositories(databaseUrl)?.orders || null; }

module.exports = { OrderRepository, InventoryRepository, ProductRepository, ReservationRepository, AuditRepository, SessionRepository, createRepositories, createOrderRepository };
