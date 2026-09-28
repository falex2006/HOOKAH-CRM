import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const createStart = source.indexOf("if (pathname === '/api/inventory/subdepartments' && req.method === 'POST') {");
const createEnd = source.indexOf('const inventorySubdepartmentPath =', createStart);
const patchStart = source.indexOf('if (inventorySubdepartmentPath && req.method === \'PATCH\') {', createEnd);
const patchEnd = source.indexOf('if (inventorySubdepartmentPath && req.method === \'DELETE\') {', patchStart);
const categoryCreateStart = source.indexOf("if (pathname === '/api/product-categories' && req.method === 'POST') {");
const categoryCreateEnd = source.indexOf('const productCategoryPath =', categoryCreateStart);
const categoryPatchStart = source.indexOf('if (productCategoryPath && req.method === \'PATCH\') {', categoryCreateEnd);
const categoryPatchEnd = source.indexOf('if (productCategoryPath && req.method === \'DELETE\') {', categoryPatchStart);
const departmentStart = source.indexOf('const inventoryDepartmentPath =', source.indexOf("if (pathname === '/api/inventory/departments' && req.method === 'POST')"));
const departmentEnd = source.indexOf("if (pathname === '/api/product-categories' && req.method === 'GET')", departmentStart);
assert.ok(createStart >= 0 && createEnd > createStart, 'subdepartment create API handler is present');
assert.ok(patchStart >= 0 && patchEnd > patchStart, 'subdepartment update API handler is present');
assert.ok(categoryCreateStart >= 0 && categoryCreateEnd > categoryCreateStart, 'product-category create API handler is present');
assert.ok(categoryPatchStart >= 0 && categoryPatchEnd > categoryPatchStart, 'product-category update API handler is present');
assert.ok(departmentStart >= 0 && departmentEnd > departmentStart, 'department archive API handler is present');

const createRoute = source.slice(createStart, createEnd);
const patchRoute = `const inventorySubdepartmentPath = pathname.match(/^\\/api\\/inventory\\/subdepartments\\/([^/]+)$/);${source.slice(patchStart, patchEnd)}`;
const categoryCreateRoute = source.slice(categoryCreateStart, categoryCreateEnd);
const categoryPatchRoute = `const productCategoryPath = pathname.match(/^\\/api\\/product-categories\\/([^/]+)$/);${source.slice(categoryPatchStart, categoryPatchEnd)}`;
const departmentRoute = source.slice(departmentStart, departmentEnd);
const mockPool = (query) => ({ connect: async () => ({ query: (sql, params) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(String(sql).trim()) ? Promise.resolve({ rows: [] }) : query(sql, params), release() {} }) });
const call = async ({ route, pathname, method = 'POST', input = {}, pool, user = { permissions: ['inventory'] } }) => {
  let response;
  const json = (_res, status, data) => { response = { status, data }; return response; };
  const denyUnless = (req, res, permission) => {
    if (req.user?.permissions?.includes(permission)) return false;
    json(res, 403, { error: 'forbidden' }); return true;
  };
  const body = async () => input;
  const handler = new Function('pathname','req','res','url','repositories','venueDbId','denyUnless','body','json','recordAudit',
    `return (async()=>{${route}})();`);
  await handler(pathname, { method, user }, {}, new URL(`http://localhost${pathname}`), { pool }, 'venue-1', denyUnless, body, json, () => {});
  return response;
};

const activeDepartmentPool = mockPool(async (sql, params) => {
    assert.deepEqual(params, ['venue-1', 'bar'], 'department lookup is scoped to the active venue');
    assert.match(sql, /is_active=true/);
    assert.match(sql, /FOR UPDATE/, 'parent is locked during creation');
    return { rows: [{ '?column?': 1 }] };
});
const valid = await call({ route: createRoute, pathname: '/api/inventory/subdepartments', pool: mockPool(async (sql, params) => {
    if (sql.startsWith('SELECT 1 FROM inventory_departments')) return activeDepartmentPool.connect().then((client) => client.query(sql, params));
    assert.match(sql, /INSERT INTO inventory_subdepartments/);
    return { rows: [{ id: 'sub-1', departmentCode: 'bar', name: 'Холодильник', active: true }] };
  }),
  input: { departmentCode: 'bar', name: 'Холодильник' },
});
assert.equal(valid.status, 201);
assert.equal(valid.data.departmentCode, 'bar');

const missingParent = await call({ route: createRoute, pathname: '/api/inventory/subdepartments', pool: mockPool(async () => ({ rows: [] })), input: { departmentCode: 'missing', name: 'Подцех' } });
assert.equal(missingParent.status, 400);
assert.equal(missingParent.data.error, 'inventory_department_not_found');

const unavailableParent = await call({ route: createRoute, pathname: '/api/inventory/subdepartments', pool: mockPool(async () => { throw new Error('database unavailable'); }), input: { departmentCode: 'bar', name: 'Подцех' } });
assert.equal(unavailableParent.status, 503);
assert.equal(unavailableParent.data.error, 'inventory_hierarchy_unavailable');

const duplicate = await call({ route: createRoute, pathname: '/api/inventory/subdepartments', pool: mockPool(async (sql) => {
  if (sql.startsWith('SELECT 1 FROM inventory_departments')) return { rows: [{ '?column?': 1 }] };
  const error = new Error('duplicate'); error.code = '23505'; throw error;
}), input: { departmentCode: 'bar', name: 'Холодильник' } });
assert.equal(duplicate.status, 409);
assert.equal(duplicate.data.error, 'inventory_subdepartment_exists');

const tooLongCode = await call({ route: createRoute, pathname: '/api/inventory/subdepartments', input: { departmentCode: 'x'.repeat(49), name: 'Подцех' } });
assert.equal(tooLongCode.status, 400);
assert.equal(tooLongCode.data.error, 'invalid_inventory_subdepartment');

const movedSubdepartment = await call({ route: patchRoute, pathname: '/api/inventory/subdepartments/sub-1', method: 'PATCH', pool: mockPool(async (sql) => {
  if (sql.startsWith('SELECT 1 FROM inventory_departments')) return { rows: [{ '?column?': 1 }] };
  if (sql.startsWith('SELECT id,department_code')) return { rows: [{ id: 'sub-1', departmentCode: 'bar', name: 'Холодильник' }] };
  if (sql.startsWith('UPDATE inventory_subdepartments SET name=')) return { rows: [{ id: 'sub-1', departmentCode: 'bar', name: 'Холодильник', active: true }] };
  throw new Error(`Unexpected subdepartment PATCH query: ${sql}`);
}), input: { departmentCode: 'bar', name: 'Холодильник' } });
assert.equal(movedSubdepartment.status, 200);
assert.match(patchRoute, /SELECT 1 FROM inventory_departments[^;]+FOR UPDATE[\s\S]+SELECT id,department_code AS "departmentCode"[^;]+FOR UPDATE/,
  'update locks target parent before the subdepartment row');

const inactiveMoveTarget = await call({ route: patchRoute, pathname: '/api/inventory/subdepartments/sub-1', method: 'PATCH', pool: mockPool(async (sql) => {
  if (sql.startsWith('SELECT 1 FROM inventory_departments')) return { rows: [] };
  throw new Error(`Inactive parent must stop before child query: ${sql}`);
}), input: { departmentCode: 'inactive', name: 'Холодильник' } });
assert.equal(inactiveMoveTarget.status, 400);
assert.equal(inactiveMoveTarget.data.error, 'inventory_department_not_found');

const tooLongPatchCode = await call({ route: patchRoute, pathname: '/api/inventory/subdepartments/sub-1', method: 'PATCH', input: { departmentCode: 'x'.repeat(49), name: 'Холодильник' } });
assert.equal(tooLongPatchCode.status, 400);
assert.equal(tooLongPatchCode.data.error, 'invalid_inventory_subdepartment');

const categoryCreated = await call({ route: categoryCreateRoute, pathname: '/api/product-categories', pool: mockPool(async (sql) => {
  if (sql.startsWith('SELECT 1 FROM inventory_departments')) { assert.match(sql, /FOR UPDATE/); return { rows: [{ '?column?': 1 }] }; }
  if (sql.startsWith('INSERT INTO product_categories')) return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Сиропы', department: 'bar', active: true }] };
  throw new Error(`Unexpected product-category create query: ${sql}`);
}), input: { name: 'Сиропы', department: 'bar' } });
assert.equal(categoryCreated.status, 201);

const categoryUpdated = await call({ route: categoryPatchRoute, pathname: '/api/product-categories/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', method: 'PATCH', pool: mockPool(async (sql) => {
  if (sql.startsWith('SELECT 1 FROM inventory_departments')) { assert.match(sql, /FOR UPDATE/); return { rows: [{ '?column?': 1 }] }; }
  if (sql.startsWith('SELECT id,name,department FROM product_categories')) return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Сиропы', department: 'bar' }] };
  if (sql.startsWith('UPDATE product_categories SET name=')) return { rows: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Безалкогольные сиропы', department: 'bar', active: true }] };
  if (sql.startsWith('UPDATE ingredients SET category=')) return { rows: [] };
  throw new Error(`Unexpected product-category update query: ${sql}`);
}), input: { name: 'Безалкогольные сиропы', department: 'bar' } });
assert.equal(categoryUpdated.status, 200);
assert.match(categoryPatchRoute, /SELECT 1 FROM inventory_departments[^;]+FOR UPDATE[\s\S]+SELECT id,name,department FROM product_categories[^;]+FOR UPDATE/,
  'product-category update locks target parent before the category row');

let archiveQueries = 0;
const inUse = await call({ route: departmentRoute, pathname: '/api/inventory/departments/bar', method: 'DELETE', pool: mockPool(async (sql) => {
  archiveQueries += 1;
  if (sql.includes('FOR UPDATE')) return { rows: [{ '?column?': 1 }] };
  assert.match(sql, /inventory_subdepartments/);
  return { rows: [{ used: true }] };
}), input: {} });
assert.equal(inUse.status, 409);
assert.equal(inUse.data.error, 'inventory_department_in_use');
assert.equal(archiveQueries, 2, 'department row is locked and active children are checked before rollback');

console.log('INVENTORY HIERARCHY API QA: PASS (parent validation/locking, tenant scoping, duplicate/error handling, active-child protection)');
