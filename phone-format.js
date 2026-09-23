(function mountRussianPhoneFormat(){
  const isPhone=(input)=>input instanceof HTMLInputElement && !input.disabled && (input.type==='tel'||/phone|телефон|mobile|мобиль/i.test(`${input.id} ${input.name}`)||/^\s*\+?7(?:\s|\(|$)/.test(input.placeholder||''));;
  const format=(value)=>{
    const raw=String(value||'');
    let digits=raw.replace(/\D/g,'');
    if (!digits) return raw.trim()==='+7' ? '+7 ' : '';
    if (digits[0]==='8') digits=digits.slice(1);
    else if (digits[0]==='7') digits=digits.slice(1);
    digits=digits.slice(0,10);
    const groups=[digits.slice(0,3),digits.slice(3,6),digits.slice(6,8),digits.slice(8,10)].filter(Boolean);
    let result='+7';
    if(groups[0]) result+=` (${groups[0]}`+(groups[0].length===3?') ':'');
    if(groups[1]) result+=groups[1];
    if(groups[2]) result+=`-${groups[2]}`;
    if(groups[3]) result+=`-${groups[3]}`;
    return result;
  };
  const mount=()=>document.querySelectorAll('input').forEach((input)=>{
    if(!isPhone(input)||input.dataset.ruPhoneReady==='1') return;
    input.dataset.ruPhoneReady='1'; input.inputMode='tel'; input.autocomplete=input.autocomplete||'tel';
    const apply=()=>{const before=input.value;const next=format(before);if(next!==before){const end=input.selectionStart===before.length;input.value=next;if(end)input.setSelectionRange(next.length,next.length);}};
    input.addEventListener('focus',()=>{if(!input.value.trim()) input.value='+7 ';});
    input.addEventListener('input',apply); input.addEventListener('paste',()=>setTimeout(apply,0));
    input.addEventListener('blur',()=>{apply();if(input.value.trim()==='+7')input.value='';});
  });
  mount(); new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
