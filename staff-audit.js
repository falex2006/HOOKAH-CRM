(function installStaffProfileAudit(){
  if(window.__staffProfileAuditInstalled)return;
  window.__staffProfileAuditInstalled=true;
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(key==='crm_session_user'){
      try{
        const before=JSON.parse(this.getItem(key)||'{}'); const after=JSON.parse(value||'{}');
        const fields=['avatarUrl','avatar_url','avatar','telegram','telegramUrl','phone','phones'];
        const changed=fields.filter((field)=>JSON.stringify(before[field]??null)!==JSON.stringify(after[field]??null));
        if(changed.length){
          const current=JSON.parse(this.getItem('territory_crm_audit_log')||'[]');
          current.unshift({id:'profile-'+Date.now(),type:'staff_profile_updated',createdAt:new Date().toISOString(),actor:before.username||after.username||'Сотрудник',fields:changed});
          original.call(this,'territory_crm_audit_log',JSON.stringify(current.slice(0,200)));
        }
      }catch(_){}
    }
    return original.call(this,key,value);
  };
})();
