import { readFileSync, existsSync } from 'node:fs';

const portal = readFileSync(new URL('../portal.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const migrations = [
  '018_inventory_departments.sql',
  '023_inventory_subdepartments.sql',
  '026_inventory_subdepartments_catalog.sql',
];
for (const file of migrations) {
  if (!existsSync(new URL(`../migrations/${file}`, import.meta.url))) throw new Error(`missing migration: ${file}`);
}
if (!portal.includes('inventory-subdepartment-options')) throw new Error('inventory item form has no subdepartment options');
if (!portal.includes('syncInventoryHierarchyOptions')) throw new Error('inventory hierarchy option sync is missing');
if (!portal.includes('Выберите подцех из справочника выбранного цеха')) throw new Error('inventory hierarchy UX validation is missing');
if (!server.includes('validateInventoryHierarchy')) throw new Error('inventory hierarchy API validation is missing');
if (!server.includes("inventory_department_not_found") || !server.includes("inventory_subdepartment_not_found")) throw new Error('inventory hierarchy error contract is missing');
console.log('INVENTORY HIERARCHY CONTRACT: PASS');
