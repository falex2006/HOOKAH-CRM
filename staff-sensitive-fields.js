(function mountSensitiveStaffFields(){
  const role=()=>{try{return JSON.parse(localStorage.getItem('crm_session_user')||'{}').role||'';}catch(_){return'';}};
  const allowed=()=>['owner','admin','manager'].includes(role());
  const mount=()=>{
    if(!allowed())return;
    document.querySelectorAll('form').forEach((form)=>{
      if(form.dataset.sensitiveStaffReady==='1')return;
      const signature=(form.textContent+' '+form.innerHTML).toLowerCase();
      if(!/(сотруд|staff|employee|роль|role)/.test(signature))return;
      const block=document.createElement('details'); block.className='staff-sensitive-fields'; block.innerHTML='<summary>Паспортные данные — ограниченный доступ</summary><div class="staff-sensitive-fields__grid"><label>Серия и номер<input name="passport_number" autocomplete="off" inputmode="numeric"></label><label>Дата выдачи<input type="date" name="passport_issued_at"></label><label class="staff-sensitive-fields__wide">Кем выдан<input name="passport_issuer" autocomplete="off"></label></div><small>Данные доступны только владельцу и уполномоченному управляющему и записываются в аудит.</small>';
      const anchor=form.querySelector('.staff-phone-list, input[name*="telegram" i], input[type="tel"]'); (anchor?.parentElement||form).after(block); form.dataset.sensitiveStaffReady='1';
    });
  };
  mount(); new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
