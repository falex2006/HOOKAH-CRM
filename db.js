'use strict';

/** PostgreSQL repositories. They are optional so the local demo can run without a database. */
class OrderRepository {
  constructor(pool) { this.pool = pool; }
  async listOpen(venueId) {
    const { rows } = await this.pool.query(`SELECT o.*, COALESCE(json_agg(json_build_object('id', oi.id, 'productId', oi.product_id, 'quantity', oi.quantity, 'unitPrice', oi.unit_price, 'station', oi.station)) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.venue_id=$1 AND o.status IN ('open','in_progress','ready') GROUP BY o.id ORDER BY o.created_at DESC`, [venueId]);
    return rows;
  }
  async create(input) {
    const { rows } = await this.pool.query('INSERT INTO orders (venue_id, table_id, opened_by, reservation_id, vip_minimum) VALUES ($1,$2,$3,$4,$5) RETURNING *', [input.venueId, input.tableId || null, input.openedBy, input.reservationId || null, input.vipMinimum || 0]);
    return rows[0];
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
      await client.query('UPDATE tables SET status=$1 WHERE id=$2', ['reserved', input.tableId]);
      await client.query('COMMIT');
      return { ...input, id: rows[0].id, status: 'confirmed' };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

class AuditRepository {
  constructor(pool) { this.pool = pool; }
  async list(venueId) {
    const { rows } = await this.pool.query(`SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", actor_id AS "actorId", before_data AS "beforeData", after_data AS "afterData", created_at AS "createdAt" FROM audit_events WHERE venue_id=$1 ORDER BY created_at DESC LIMIT 100`, [venueId]);
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
    const { rows } = await this.pool.query(`SELECT s.id,u.id AS "userId",u.full_name AS name,u.role
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
  return { pool, orders: new OrderRepository(pool), inventory: new InventoryRepository(pool), reservations: new ReservationRepository(pool), audit: new AuditRepository(pool), sessions: new SessionRepository(pool) };
}

function createOrderRepository(databaseUrl = process.env.DATABASE_URL) { return createRepositories(databaseUrl)?.orders || null; }

module.exports = { OrderRepository, InventoryRepository, ReservationRepository, AuditRepository, SessionRepository, createRepositories, createOrderRepository };
