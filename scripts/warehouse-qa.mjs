import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://127.0.0.1:3107';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw Error('Use isolated local QA server');
let checks = 0;
async function req(path, method='GET', data, status=200) {
 const response = await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
 const result = await response.json(); assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(result)}`); checks++; return result;
}
const fields={name:'QA — Сироп',unit:'мл',department:'bar',itemType:'ingredient',cost:0.5,minLevel:20,packMultiplier:1000,purchaseUnit:'бутылка'};
const item=await req('/api/inventory/items','POST',fields,201);
try {
 await req('/api/inventory/items','POST',{...fields,packMultiplier:0},400);
 await req(`/api/inventory/items/${item.id}`,'PATCH',{onHand:999,id:'hijack'},400);
 await req(`/api/inventory/items/${item.id}`,'PATCH',{cost:-1},400);
 await req(`/api/inventory/items/${item.id}`,'PATCH',{name:'QA — Сироп обновлён',itemType:'consumable',purchaseUnit:'канистра',packMultiplier:500});
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:100,reason:'QA поставка'},201);
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:-30,reason:'QA списание'},201);
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:-100,reason:'QA сверх остатка'},409);
 const stock=await req('/api/inventory'); assert.equal(stock.items.find(x=>x.id===item.id).onHand,70); checks++;
 await req(`/api/inventory/items/${item.id}`,'PATCH',{unit:'кг'},409);
 await req(`/api/inventory/items/${item.id}`,'DELETE',undefined,409);
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:-70,reason:'QA очистка'},201);
 const supply=await req('/api/inventory/supplies','POST',{itemId:item.id,quantity:2,unit:'л',unitCost:100,supplier:'QA поставщик'},201);
 assert.equal(supply.sourceUnit,'л'); assert.equal(supply.unit,'мл'); checks++;
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:-2000,reason:'QA очистка поставки'},201);
 const autoOrder = await req('/api/inventory/auto-orders');
 assert.ok(autoOrder.items.some((entry) => entry.id === item.id), 'low stock item must appear in auto-order suggestions'); checks++;
 const request = await req('/api/inventory/auto-orders','POST',{items:[{itemId:item.id,quantity:500}],note:'QA автозаказ'},201);
 assert.equal(request.status,'sent'); assert.equal(request.lines[0].receivedQuantity,0); checks++;
 const partially = await req(`/api/inventory/auto-orders/${request.id}`,'PATCH',{status:'partially_received',receipts:[{itemId:item.id,quantity:250}]},200);
 assert.equal(partially.status,'partially_received'); assert.equal(partially.lines[0].receivedQuantity,250); checks++;
 const received = await req(`/api/inventory/auto-orders/${request.id}`,'PATCH',{status:'received'},200);
 assert.equal(received.status,'received'); assert.equal(received.lines[0].receivedQuantity,500); checks++;
 const afterReceipt = await req('/api/inventory'); assert.equal(afterReceipt.items.find((entry) => entry.id === item.id).onHand,500); checks++;
 const repeated = await req(`/api/inventory/auto-orders/${request.id}`,'PATCH',{status:'received'},200);
 assert.equal(repeated.lines[0].receivedQuantity,500); assert.equal((await req('/api/inventory')).items.find((entry) => entry.id === item.id).onHand,500); checks++;
 await req(`/api/inventory/auto-orders/${request.id}`,'PATCH',{status:'cancelled'},409);
 await req(`/api/inventory/auto-orders/${request.id}`,'PATCH',{status:'received',receipts:[{itemId:item.id,quantity:1}]},409);
 await req('/api/inventory/movements','POST',{itemId:item.id,delta:-500,reason:'QA очистка автозаказа'},201);
} finally { await req(`/api/inventory/items/${item.id}`,'DELETE'); }
const category=await req('/api/product-categories','POST',{name:'QA категория',department:'bar'},201);
const product=await req('/api/products','POST',{name:'QA напиток',category:category.name,price:150},201);
await req(`/api/products/${product.id}`,'PATCH',{price:175});
await req(`/api/products/${product.id}`,'DELETE');
await req(`/api/product-categories/${category.id}`,'DELETE');
const recipe=await req('/api/recipes','POST',{name:'QA рецепт',ingredients:[{name:'вода',quantity:'100 мл'}]},201);
await req(`/api/recipes/${recipe.id}`,'PATCH',{name:'QA рецепт изменён',technology:'Смешать'});
await req(`/api/recipes/${recipe.id}`,'PATCH',{name:'Should not persist',technology:'x'.repeat(4001)},400);
assert.equal((await req('/api/recipes')).items.find(x=>x.id===recipe.id).name,'QA рецепт изменён');checks++;
await req(`/api/recipes/${recipe.id}`,'DELETE');
const costItem=await req('/api/inventory/items','POST',{name:'QA — Вода',unit:'мл',itemType:'ingredient',cost:0.5},201);
try {
 const costRecipe=await req('/api/recipes','POST',{name:'QA конвертация',ingredients:[{ingredientId:costItem.id,name:costItem.name,quantity:'2 л'}]},201);
 const cost=await req(`/api/recipes/${costRecipe.id}/cost`);
 assert.equal(cost.lines[0].quantity,2000); assert.equal(cost.lines[0].unit,'мл'); assert.equal(cost.totalCost,1000); checks++;
 await req(`/api/recipes/${costRecipe.id}`,'DELETE');
} finally { await req(`/api/inventory/items/${costItem.id}`,'DELETE'); }
console.log(`WAREHOUSE QA: ${checks} checks passed`);
