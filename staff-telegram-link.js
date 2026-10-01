(function mountStaffTelegramLink(){
  const read=()=>{try{return JSON.parse(localStorage.getItem('crm_session_user')||'{}');}catch(_){return{};}};
  const mount=()=>{
    const host=document.querySelector('.user'); if(!host)return;
    const user=read(); const value=String(user.telegram||user.telegramUrl||'').trim();
    let link=host.querySelector('.staff-telegram-link');
    if(!value){link?.remove();return;}
    if(!link){link=document.createElement('a');link.className='staff-telegram-link';link.target='_blank';link.rel='noopener noreferrer';link.addEventListener('click',(event)=>event.stopPropagation());host.append(link);}
    const href=value.startsWith('@')?'https://t.me/'+value.slice(1):value;
    if(link.getAttribute('href')!==href)link.setAttribute('href',href);
    if(link.textContent!=='Telegram')link.textContent='Telegram';
    if(link.title!=='Открыть Telegram сотрудника')link.title='Открыть Telegram сотрудника';
  };
  mount(); new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
