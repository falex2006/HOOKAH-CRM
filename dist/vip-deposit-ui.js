(function mountVipDepositNotice(){
  const money=(value)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Math.round(value))+' ₽';
  const tableId=()=>{
    const selected=document.querySelector('.table.sel,[data-table-id].active,[data-table-id][aria-selected="true"],.table.active,.table-card.active');
    if(!selected)return null; const raw=selected?.dataset?.tableId||selected?.id||selected?.textContent;
    const text=String(raw).toLowerCase();
    if(!text.includes('vip'))return null;
    return /2|вип\s*2|vip\s*2/.test(text)?'vip-room-2':'vip-room-1';
  };
  const total=()=>{
    if(Number.isFinite(Number(window.crmOrderTotal)))return Number(window.crmOrderTotal);
    const selectors=['[data-order-total]','[data-total]','#order-total','.order-total','.cart-total','.total'];
    for(const selector of selectors){const node=document.querySelector(selector);if(node){const value=Number(String(node.dataset?.orderTotal||node.dataset?.total||node.textContent).replace(/[^0-9,.-]/g,'').replace(',','.'));if(Number.isFinite(value))return value;}}
    return 0;
  };
  const show=()=>{
    const id=tableId(); if(!id||!window.crmVipDeposit)return;
    const result=window.crmVipDeposit.calculate(id,total());
    let banner=document.querySelector('.vip-deposit-notice');
    if(!banner){banner=document.createElement('div');banner.className='vip-deposit-notice';document.body.append(banner);}
    banner.classList.toggle('is-hidden',!result.requiresMinimum);
    if(result.requiresMinimum)banner.innerHTML='<strong>VIP-депозит</strong><span>Заказ '+money(result.current)+' из минимума '+money(result.minimum)+'. При закрытии будет добавлено: <b>'+money(result.shortfall)+'</b>.</span>';
  };
  const bind=()=>document.querySelectorAll('button,[role="button"]').forEach((button)=>{if(button.dataset.vipNoticeReady==='1')return;if(!/(оплатить|оплата|pay)/i.test(button.textContent||''))return;button.dataset.vipNoticeReady='1';button.addEventListener('click',()=>setTimeout(show,0));});
  bind(); show(); new MutationObserver(()=>{bind();show();}).observe(document.body,{childList:true,subtree:true});
  window.crmVipDepositUI={refresh:show};
})();
