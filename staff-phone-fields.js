(function mountStaffPhoneList(){
  const mount=()=>{
    const inputs=[...document.querySelectorAll('input[type="tel"], input[name*="phone" i], input[name*="телефон" i]')];
    inputs.forEach((input)=>{
      const form=input.closest('form')||input.parentElement;
      if(!form||form.dataset.staffPhonesReady==='1') return;
      const signature=(form.textContent+' '+form.innerHTML).toLowerCase();
      if(!/(сотруд|staff|employee|роль|role)/.test(signature)) return;
      form.dataset.staffPhonesReady='1';
      const rows=document.createElement('div');
      rows.className='staff-phone-list';
      rows.innerHTML='<div class="staff-phone-list__header"><strong>Телефоны</strong><button type="button" class="staff-phone-list__add">Добавить номер</button></div><div class="staff-phone-list__rows"></div><input type="hidden" name="phones_json" class="staff-phone-list__value">';
      input.parentElement?.after(rows);
      input.style.display='none';
      const list=rows.querySelector('.staff-phone-list__rows');
      const hidden=rows.querySelector('.staff-phone-list__value');
      const initial=input.value?{label:'Рабочий',number:input.value,primary:true}:{label:'Рабочий',number:'',primary:true};
      const read=()=>[...list.querySelectorAll('.staff-phone-row')].map((row)=>({label:row.querySelector('select')?.value||'Дополнительный',number:row.querySelector('input[type="tel"]')?.value?.trim()||'',primary:!!row.querySelector('input[type="radio"]')?.checked})).filter((item)=>item.number);
      const sync=()=>{const value=read(); hidden.value=JSON.stringify(value); try{localStorage.setItem('territory_crm_staff_profile_draft',hidden.value);}catch(_) {}};
      const add=(item={label:'Дополнительный',number:'',primary:false})=>{
        const row=document.createElement('div');
        row.className='staff-phone-row';
        row.innerHTML='<select aria-label="Тип телефона"><option>Рабочий</option><option>Личный</option><option>Резервный</option><option>Дополнительный</option></select><input type="tel" placeholder="+7 (___) ___-__-__" aria-label="Номер телефона"><label><input type="radio" name="staff_primary_phone" aria-label="Основной"> основной</label><button type="button" class="staff-phone-row__remove" aria-label="Удалить номер">×</button>';
        row.querySelector('select').value=item.label||'Дополнительный';
        row.querySelector('input[type="tel"]').value=item.number||'';
        row.querySelector('input[type="radio"]').checked=!!item.primary;
        row.addEventListener('input',sync); row.addEventListener('change',sync);
        row.querySelector('.staff-phone-row__remove').addEventListener('click',()=>{if(list.children.length>1){row.remove();sync();}});
        list.append(row);
      };
      add(initial);
      rows.querySelector('.staff-phone-list__add').addEventListener('click',()=>add());
      form.addEventListener('submit',sync); sync();
    });
  };
  mount();
  new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
