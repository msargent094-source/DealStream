/* DealStream v2 — privacy-first, dependency-free, local browsing history. */
(() => {
  'use strict';
  const SEEN = 'dealstream_seen_v1';
  const SAVED = 'dealstream_saved_v1';
  const TAB = 'dealstream_tab_v1';
  const PREFS = 'dealstream_prefs_v2';
  const SNAPSHOTS = 'dealstream_saved_items_v2';
  const LAST_VISIT = 'dealstream_last_visit_v2';
  const RESUME = 'dealstream_resume_v2';
  const SESSION = 'dealstream_session_v2';
  const CHUNK = 40;
  const DEFAULT = {theme:'system',font:'normal',view:'compact',priceMode:true,threshold:'normal',onlyFollowed:false,followedStores:[],mutedStores:[],mutedKeywords:[],hiddenCategories:[]};
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, val) => { try { localStorage.setItem(key, val); return true; } catch { return false; } };
  const readObj = (key, fallback = {}) => { try { const v = JSON.parse(read(key) || 'null'); return v && typeof v==='object' && !Array.isArray(v) ? v : fallback; } catch { return fallback; } };
  const map = source => Object.assign(Object.create(null), source);
  const list = source => Array.isArray(source) ? source.filter(x => typeof x==='string' && x.length < 100).slice(0, 200) : [];
  const words = source => String(source || '').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0, 150);
  const uniq = source => [...new Map(list(source).map(x=>[x.toLowerCase(),x])).values()];
  const loadPrefs = () => { const v=readObj(PREFS); return {...DEFAULT,...v, followedStores:uniq(v.followedStores),mutedStores:uniq(v.mutedStores),mutedKeywords:uniq(v.mutedKeywords),hiddenCategories:uniq(v.hiddenCategories)}; };
  const persisted = readObj(LAST_VISIT);
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { /* ignore */ }
  const now = Date.now();
  const lastVisit = (session && now - Number(session.started) < 60*60*1000 && Number.isFinite(Number(session.baseline)))
    ? Number(session.baseline) : Number(persisted.time || 0);
  try { sessionStorage.setItem(SESSION, JSON.stringify({started:now,baseline:lastVisit})); } catch { /* ignore */ }
  const st = {data:[], seen:map(readObj(SEEN)), saved:map(readObj(SAVED)), snapshots:map(readObj(SNAPSHOTS)), prefs:loadPrefs(),
    tab:read(TAB)||'unseen', query:'',shown:CHUNK,filtered:[],loaded:false,updated:null,checkedAt:null,loading:false,
    lastY:0,scrolling:false,visible:new Set(),lastVisit, resume:readObj(RESUME),toastUndo:null,toastTimer:null};
  if (!['unseen','all','saved','new'].includes(st.tab)) st.tab='unseen';
  function savedState(){
    const ok=write(SEEN,JSON.stringify(st.seen)) && write(SAVED,JSON.stringify(st.saved)) && write(SNAPSHOTS,JSON.stringify(st.snapshots));
    if(!ok) banner('Your browser is blocking storage. Your seen and saved history may not be retained.');
  }
  function savePrefs(){if(!write(PREFS,JSON.stringify(st.prefs)))banner('Could not store your preferences on this device.');applyAppearance();}
  const fold = x => String(x||'').toLocaleLowerCase('en-AU');
  const contains = (a,b) => fold(a).includes(fold(b));
  const safeUrl = value => { try { const u=new URL(value); return u.protocol==='https:' && ['www.ozbargain.com.au','ozbargain.com.au'].includes(u.hostname) ? u.href : null; } catch { return null; } };
  function clean(raw){
    if(!raw || typeof raw.id!=='string' || typeof raw.title!=='string')return null;
    const url=safeUrl(raw.url), ms=Date.parse(raw.published);
    if(!url || !Number.isFinite(ms))return null;
    return {id:raw.id.slice(0,180),title:raw.title.slice(0,500),url,published:new Date(ms).toISOString(),ms,
      merchant:typeof raw.merchant==='string'?raw.merchant.slice(0,80):'',
      category:typeof raw.category==='string'?raw.category.slice(0,80):'',
      description:typeof raw.description==='string'?raw.description.slice(0,350):''};
  }
  function rel(value){
    const time=Date.parse(value);if(!Number.isFinite(time))return 'Saved earlier';
    const m=Math.max(0,(Date.now()-time)/60000);
    if(m<1)return 'just now';if(m<60)return Math.floor(m)+'m ago';if(m<1440)return Math.floor(m/60)+'h ago';
    if(m<10080)return Math.floor(m/1440)+'d ago';return new Date(time).toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  }
  const make = (tag,cls,value) => {const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=value;return e;};
  function banner(message){const el=$('#banner');el.textContent=message;el.hidden=!message;}
  function toast(message,undo=null){
    clearTimeout(st.toastTimer);st.toastUndo=undo;
    $('#toastText').textContent=message;$('#undoButton').hidden=!undo;$('#toast').hidden=false;
    st.toastTimer=setTimeout(()=>{$('#toast').hidden=true;st.toastUndo=null;},5500);
  }
  function newCount(){return st.lastVisit ? st.data.filter(x=>x.ms>st.lastVisit).length:0;}
  function stats(){
    const unseen=st.data.filter(x=>!st.seen[x.id]).length;
    $('#unseenCount').textContent=unseen.toLocaleString('en-AU');
    $('#newCount').textContent=newCount().toLocaleString('en-AU');
    $('#tabUnseenCount').textContent=unseen.toLocaleString('en-AU');
    $('#tabNewCount').textContent=newCount().toLocaleString('en-AU');
    $('#tabSavedCount').textContent=Object.keys(st.saved).length.toLocaleString('en-AU');
    $('#updateStamp').textContent=st.updated?'Feed checked '+rel(st.updated):'Feed not updated yet';
    $('#updateStamp').title=st.updated?new Date(st.updated).toLocaleString('en-AU'):'';
    $('#feedStatus').textContent=st.checkedAt?'App last checked the published feed at '+new Date(st.checkedAt).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}):'';
    const filterTotal=st.prefs.followedStores.length+st.prefs.mutedStores.length+st.prefs.mutedKeywords.length+st.prefs.hiddenCategories.length+(st.prefs.onlyFollowed?1:0);
    $('#filterCount').textContent=filterTotal;$('#filterCount').hidden=filterTotal===0;
    $('#clearFilterButton').hidden=filterTotal===0;$('#quickActions').hidden=$('#resumeButton').hidden && $('#clearFilterButton').hidden;
  }
  function snapshot(item){return {id:item.id,title:item.title,url:item.url,published:item.published,merchant:item.merchant,category:item.category,description:item.description};}
  function syncSnapshots(){
    let changed=false;
    for(const d of st.data){if(st.saved[d.id]){const json=JSON.stringify(snapshot(d));if(JSON.stringify(st.snapshots[d.id])!==json){st.snapshots[d.id]=snapshot(d);changed=true;}}}
    if(changed)savedState();
  }
  function archivedSaved(){
    const present=new Set(st.data.map(d=>d.id));
    return Object.keys(st.saved).filter(id=>!present.has(id)).map(id=>{
      const snap=clean(st.snapshots[id]);if(snap)return snap;
      if(!/^\d{1,12}$/.test(id))return null;
      // Older v1 records saved only the ID. Keep them accessible even without title metadata.
      return {id,title:'Saved OzBargain deal #'+id,url:'https://www.ozbargain.com.au/node/'+id,
        published:null,ms:0,merchant:'OzBargain',category:'Previously saved',description:''};
    }).filter(Boolean);
  }
  function passes(item){
    if(st.tab==='saved')return true; // Saved items stay available even if their store/category is now muted.
    const p=st.prefs,m=fold(item.merchant),c=fold(item.category),text=fold(item.title+' '+item.description);
    if(p.onlyFollowed && !p.followedStores.some(x=>fold(x)===m))return false;
    if(p.mutedStores.some(x=>fold(x)===m))return false;
    if(p.hiddenCategories.some(x=>fold(x)===c))return false;
    if(p.mutedKeywords.some(x=>text.includes(fold(x))))return false;
    return true;
  }
  function filtered(){
    const base=st.tab==='saved' ? [...st.data,...archivedSaved()].filter(x=>st.saved[x.id]).sort((a,b)=>Number(st.saved[b.id]||0)-Number(st.saved[a.id]||0)) : st.data;
    const q=fold(st.query.trim());
    return base.filter(x=>{
      if(st.tab==='unseen'&&st.seen[x.id])return false;
      if(st.tab==='new'&&(!st.lastVisit||x.ms<=st.lastVisit))return false;
      if(!passes(x))return false;
      return !q||[x.title,x.merchant,x.category,x.description].some(v=>fold(v).includes(q));
    });
  }
  function markSeen(id,card){
    if(st.seen[id])return false;
    st.seen[id]=Date.now();savedState();if(card)card.classList.add('is-seen');stats();return true;
  }
  function unsee(id){delete st.seen[id];savedState();render(true);}
  function saveDeal(id){
    const prev=st.saved[id]||null,snap=st.snapshots[id]||null;
    if(prev){delete st.saved[id];delete st.snapshots[id];}
    else {st.saved[id]=Date.now();const item=st.data.find(d=>d.id===id) || st.filtered.find(d=>d.id===id);if(item)st.snapshots[id]=snapshot(item);}
    savedState();render(false);
    return ()=>{if(prev){st.saved[id]=prev;if(snap)st.snapshots[id]=snap;}else{delete st.saved[id];delete st.snapshots[id];}savedState();render(false);};
  }
  function followStore(store){
    if(!store || store==='OzBargain')return;
    const old=[...st.prefs.followedStores];
    const exists=old.some(x=>fold(x)===fold(store));
    st.prefs.followedStores=exists?old.filter(x=>fold(x)!==fold(store)):[...old,store];
    savePrefs();render(false);toast((exists?'Unfollowed ':'Following ')+store,()=>{st.prefs.followedStores=old;savePrefs();render(false);});
  }
  function action(label,fn,className=''){const b=make('button','card-action '+className,label);b.type='button';b.addEventListener('click',fn);return b;}
  function enableSwipe(el,id){
    let start=null, suppressClickUntil=0;
    el.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    el.addEventListener('touchstart',e=>{
      if(e.touches.length!==1 || e.target.closest('button,input,textarea')){start=null;return;}
      const t=e.touches[0];start={x:t.clientX,y:t.clientY,dx:0,dy:0};
    },{passive:true});
    el.addEventListener('touchmove',e=>{
      if(!start)return;const t=e.touches[0];start.dx=t.clientX-start.x;start.dy=t.clientY-start.y;
      if(Math.abs(start.dx)>24 && Math.abs(start.dx)>Math.abs(start.dy)*1.5){
        if(e.cancelable)e.preventDefault();
        el.classList.toggle('drag-right',start.dx>0);el.classList.toggle('drag-left',start.dx<0);
      }else{el.classList.remove('drag-right','drag-left');}
    },{passive:false});
    el.addEventListener('touchend',()=>{
      if(!start)return;const {dx,dy}=start;start=null;el.classList.remove('drag-right','drag-left');
      if(Math.abs(dx)<90 || Math.abs(dx)<Math.abs(dy)*1.6)return;
      suppressClickUntil=Date.now()+650;
      if(dx>0){const before=st.seen[id];if(markSeen(id,el))toast('Deal marked as seen',()=>{if(!before)unsee(id);});}
      else {const restore=saveDeal(id);toast(st.saved[id]?'Saved deal':'Removed saved deal',restore);}
    },{passive:true});
    el.addEventListener('touchcancel',()=>{start=null;el.classList.remove('drag-right','drag-left');});
  }
  function card(item){
    const seen=Boolean(st.seen[item.id]),saved=Boolean(st.saved[item.id]);
    const c=make('article','deal-card'+(seen?' is-seen':'')+(st.prefs.view==='compact'?' is-compact':''));c.dataset.dealId=item.id;
    const top=make('div','card-top');
    const store=make('button','merchant-button'+(st.prefs.followedStores.some(x=>fold(x)===fold(item.merchant))?' is-followed':''),item.merchant||'OzBargain');
    store.type='button';store.title='Follow or unfollow '+(item.merchant||'store');store.setAttribute('aria-label',store.title);
    store.addEventListener('click',()=>followStore(item.merchant));top.append(store,make('span','card-time',rel(item.published)));c.append(top);
    const title=make('h3','card-title'),link=make('a','',item.title);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
    link.addEventListener('click',()=>markSeen(item.id,c));title.append(link);c.append(title);
    if(st.prefs.priceMode){const price=item.title.match(/(?:AU\s*)?\$\s*\d[\d,]*(?:\.\d{1,2})?/i);if(price)c.append(make('span','price-chip',price[0]));}
    if(item.description&&st.prefs.view==='detailed')c.append(make('p','card-description',item.description));
    const bottom=make('div','card-bottom');bottom.append(make('span','card-category',seen?'✓ Viewed':item.category||'New deal'));
    const buttons=make('div','card-actions');
    const save=action(saved?'★ Saved':'☆ Save',()=>saveDeal(item.id),saved?'saved':'');save.setAttribute('aria-pressed',String(saved));save.setAttribute('aria-label',(saved?'Remove saved deal: ':'Save deal: ')+item.title);buttons.append(save);
    if(st.tab==='all'&&seen)buttons.append(action('Unsee',()=>unsee(item.id)));
    const open=make('a','card-action open','Open ↗');open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';open.addEventListener('click',()=>markSeen(item.id,c));buttons.append(open);
    bottom.append(buttons);c.append(bottom);
    c.append(make('span','swipe-indicator left','✓ Seen'),make('span','swipe-indicator right','★ Save'));
    enableSwipe(c,item.id);return c;
  }
  function showResume(){
    const id=st.resume.id,idx=id?st.filtered.findIndex(d=>d.id===id):-1;
    $('#resumeButton').hidden=idx<1;$('#quickActions').hidden=$('#resumeButton').hidden&&$('#clearFilterButton').hidden;
  }
  function render(reset=false){
    if(reset){st.shown=CHUNK;st.visible.clear();}st.filtered=filtered();
    const box=$('#dealList'),frag=document.createDocumentFragment();
    for(const item of st.filtered.slice(0,st.shown))frag.append(card(item));box.replaceChildren(frag);
    const n=st.filtered.length;
    $('#resultCount').textContent=st.loaded?'Showing '+Math.min(n,st.shown).toLocaleString('en-AU')+' of '+n.toLocaleString('en-AU')+' deals':'Loading…';
    $('#emptyState').hidden=!st.loaded||n>0;
    if(!$('#emptyState').hidden){
      $('#emptyTitle').textContent=st.query?'No matching deals':st.tab==='unseen'?'All caught up!':st.tab==='saved'?'Nothing saved yet':st.tab==='new'?'No new deals since your last visit':'Nothing to show';
      $('#emptyDescription').textContent=st.query?'Try another search.':'More deals will appear as the published feed updates. You can change filters or view all deals.';
      $('#emptyAction').textContent=st.query?'Clear search':'Show all deals';
    }
    stats();showResume();
  }
  function changeTab(name){
    st.tab=['unseen','new','saved','all'].includes(name)?name:'unseen';write(TAB,st.tab);
    $$('.tab').forEach(el=>{const active=el.dataset.tab===st.tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
    st.visible.clear();window.scrollTo(0,0);render(true);
  }
  function applyAppearance(){
    const p=st.prefs;
    if(['light','dark'].includes(p.theme))document.documentElement.dataset.theme=p.theme;else delete document.documentElement.dataset.theme;
    document.documentElement.dataset.font=['normal','large','extra'].includes(p.font)?p.font:'normal';
    $('#layoutButton').textContent=p.view==='compact'?'Detailed':'Compact';
    const isDark=p.theme==='dark'||(p.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]').setAttribute('content',isDark?'#101216':'#f6f5f3');
  }
  function splitLines(values){return values.join('\n');}
  function fillFilters(){
    $('#onlyFollowedCheckbox').checked=st.prefs.onlyFollowed;
    $('#followedStoresInput').value=splitLines(st.prefs.followedStores);
    $('#mutedStoresInput').value=splitLines(st.prefs.mutedStores);
    $('#mutedKeywordsInput').value=splitLines(st.prefs.mutedKeywords);
    const cats=[...new Set([...st.data.map(x=>x.category),...st.prefs.hiddenCategories])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
    const holder=$('#categoryFilters');holder.replaceChildren();
    for(const name of cats){
      const hidden=st.prefs.hiddenCategories.some(x=>fold(x)===fold(name));
      const btn=make('button','category-option'+(hidden?' is-hidden':''),name);btn.type='button';btn.dataset.category=name;btn.setAttribute('aria-pressed',String(hidden));
      btn.addEventListener('click',()=>{btn.classList.toggle('is-hidden');btn.setAttribute('aria-pressed',String(btn.classList.contains('is-hidden')));});
      holder.append(btn);
    }
  }
  function applyFilters(){
    st.prefs.onlyFollowed=$('#onlyFollowedCheckbox').checked;
    st.prefs.followedStores=uniq(words($('#followedStoresInput').value));
    st.prefs.mutedStores=uniq(words($('#mutedStoresInput').value));
    st.prefs.mutedKeywords=uniq(words($('#mutedKeywordsInput').value));
    st.prefs.hiddenCategories=$$('.category-option.is-hidden').map(el=>el.dataset.category);
    savePrefs();$('#filtersDialog').close();render(true);window.scrollTo(0,0);
  }
  function clearFilters(){
    st.prefs.onlyFollowed=false;st.prefs.followedStores=[];st.prefs.mutedStores=[];st.prefs.mutedKeywords=[];st.prefs.hiddenCategories=[];
    savePrefs();render(true);
  }
  function refresh(manual=false){
    if(st.loading)return;st.loading=true;const btn=$('#refreshButton');btn.disabled=true;btn.classList.add('is-busy');
    const before=new Set(st.data.map(x=>x.id)),hadFeed=st.loaded;
    fetch('./data/deals.json?t='+Date.now(),{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();if(!data||!Array.isArray(data.items))throw new Error('Invalid feed');
      const uniqMap=new Map();for(const raw of data.items){const d=clean(raw);if(d)uniqMap.set(d.id,d);}
      st.data=[...uniqMap.values()].sort((a,b)=>b.ms-a.ms);
      st.updated=typeof data.updatedAt==='string'&&!Number.isNaN(Date.parse(data.updatedAt))?data.updatedAt:null;
      st.loaded=true;st.checkedAt=Date.now();syncSnapshots();banner(st.updated?'':'The feed has not been initialized. Run the GitHub update workflow.');
      if(manual)window.scrollTo(0,0);
      render(true);
      if(manual){const additions=hadFeed?st.data.filter(x=>!before.has(x.id)).length:0;
        toast(additions?`${additions} newly published deal${additions===1?'':'s'} loaded`:'You have the latest published feed');}
    }).catch(()=>{
      st.loaded=true;st.checkedAt=Date.now();
      banner('Could not check the published feed. '+(st.data.length?'Your current deals are still available.':'Check your internet connection and GitHub Pages deployment.'));
      render(true);
    }).finally(()=>{st.loading=false;btn.disabled=false;btn.classList.remove('is-busy');});
  }
  const threshold = () => ({early:.7,normal:.45,careful:.2}[st.prefs.threshold]||.45);
  function trackScroll(){
    if(st.scrolling)return;st.scrolling=true;
    requestAnimationFrame(()=>{
      st.scrolling=false;const y=window.scrollY,h=window.innerHeight,down=y>st.lastY;
      if(down && y>40){let changed=false;
        for(const c of $$('.deal-card')){
          const id=c.dataset.dealId,r=c.getBoundingClientRect();
          if(r.top<h*.9&&r.bottom>0)st.visible.add(id);
          if(!st.seen[id] && st.visible.has(id) && r.bottom<h*threshold()){
            st.seen[id]=Date.now();c.classList.add('is-seen');changed=true;
          }
        }
        if(changed){savedState();stats();}
      }else{
        for(const c of $$('.deal-card')){const r=c.getBoundingClientRect();if(r.top<h*.9&&r.bottom>0)st.visible.add(c.dataset.dealId);}
      }
      $('#topButton').hidden=y<400;st.lastY=y;
    });
  }
  function savePosition(){
    const item=$$('.deal-card').find(c=>{const r=c.getBoundingClientRect();return r.bottom>innerHeight*.35&&r.top<innerHeight*.9;});
    if(item){st.resume={id:item.dataset.dealId,tab:st.tab,time:Date.now()};write(RESUME,JSON.stringify(st.resume));}
    write(LAST_VISIT,JSON.stringify({time:Date.now()}));
  }
  function resume(){
    const idx=st.filtered.findIndex(d=>d.id===st.resume.id);if(idx<0)return;
    st.shown=Math.max(st.shown,idx+10);render(false);
    const card=$$('.deal-card').find(c=>c.dataset.dealId===st.resume.id);
    if(card)card.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function exportHistory(){
    const json=JSON.stringify({type:'dealstream-history',version:2,exportedAt:new Date().toISOString(),seen:st.seen,saved:st.saved,savedItems:st.snapshots,prefs:st.prefs},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=make('a');a.href=url;a.download='dealstream-backup.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    $('#settingsMessage').textContent='Backup prepared. Save the JSON somewhere safe.';
  }
  async function importHistory(file){
    if(!file)return;if(file.size>12000000)throw new Error('Backup is too large');
    const v=JSON.parse(await file.text());
    if(!v||v.type!=='dealstream-history'||![1,2].includes(v.version)||!v.seen||!v.saved||typeof v.seen!=='object'||typeof v.saved!=='object'||Array.isArray(v.seen)||Array.isArray(v.saved))throw new Error('Not a valid DealStream backup');
    for(const [kind,source] of [['seen',v.seen],['saved',v.saved]]){
      let n=0;for(const [id,t] of Object.entries(source)){
        if(++n>60000)break;if(id.length<=180 && (typeof t==='string'||typeof t==='number'))st[kind][id]=t;
      }
    }
    if(v.version===2&&v.savedItems&&typeof v.savedItems==='object'&&!Array.isArray(v.savedItems)){
      let n=0;for(const [id,item] of Object.entries(v.savedItems)){if(++n>60000)break;const d=clean(item);if(d&&d.id===id&&st.saved[id])st.snapshots[id]=snapshot(d);}
    }
    if(v.version===2&&v.prefs&&typeof v.prefs==='object'&&!Array.isArray(v.prefs)){
      st.prefs={...DEFAULT,...v.prefs,followedStores:uniq(v.prefs.followedStores),mutedStores:uniq(v.prefs.mutedStores),mutedKeywords:uniq(v.prefs.mutedKeywords),hiddenCategories:uniq(v.prefs.hiddenCategories)};
      savePrefs();fillSettings();
    }
    syncSnapshots();savedState();render(true);$('#settingsMessage').textContent='Backup imported; existing history was preserved.';
  }
  function fillSettings(){
    $('#themeSelect').value=['system','light','dark'].includes(st.prefs.theme)?st.prefs.theme:'system';
    $('#fontSelect').value=['normal','large','extra'].includes(st.prefs.font)?st.prefs.font:'normal';
    $('#viewSelect').value=['compact','detailed'].includes(st.prefs.view)?st.prefs.view:'compact';
    $('#thresholdSelect').value=['early','normal','careful'].includes(st.prefs.threshold)?st.prefs.threshold:'normal';
    $('#priceModeCheckbox').checked=Boolean(st.prefs.priceMode);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    applyAppearance();fillSettings();
    $$('.tab').forEach(el=>el.addEventListener('click',()=>changeTab(el.dataset.tab)));
    $$('.tab').forEach(el=>{const active=el.dataset.tab===st.tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});
    $('#searchInput').addEventListener('input',e=>{st.query=e.target.value;render(true);});
    $('#refreshButton').addEventListener('click',()=>refresh(true));
    $('#layoutButton').addEventListener('click',()=>{st.prefs.view=st.prefs.view==='compact'?'detailed':'compact';$('#viewSelect').value=st.prefs.view;savePrefs();render(false);});
    $('#filtersButton').addEventListener('click',()=>{fillFilters();$('#filtersDialog').showModal();});
    $('#settingsButton').addEventListener('click',()=>{$('#settingsMessage').textContent='';fillSettings();$('#settingsDialog').showModal();});
    $$('[data-close]').forEach(el=>el.addEventListener('click',()=>document.getElementById(el.dataset.close).close()));
    for(const [id,key] of [['themeSelect','theme'],['fontSelect','font'],['viewSelect','view'],['thresholdSelect','threshold']]){
      $('#'+id).addEventListener('change',e=>{st.prefs[key]=e.target.value;savePrefs();render(false);});
    }
    $('#priceModeCheckbox').addEventListener('change',e=>{st.prefs.priceMode=e.target.checked;savePrefs();render(false);});
    $('#applyFiltersButton').addEventListener('click',applyFilters);
    $('#resetFiltersButton').addEventListener('click',()=>{clearFilters();fillFilters();});
    $('#clearFilterButton').addEventListener('click',clearFilters);
    $('#emptyAction').addEventListener('click',()=>{if(st.query){st.query='';$('#searchInput').value='';render(true);}else changeTab('all');});
    $('#topButton').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    $('#resumeButton').addEventListener('click',resume);
    $('#exportButton').addEventListener('click',exportHistory);
    $('#importButton').addEventListener('click',()=>$('#importFile').click());
    $('#importFile').addEventListener('change',async e=>{try{await importHistory(e.target.files[0]);}catch(err){$('#settingsMessage').textContent='Import failed: '+err.message;}e.target.value='';});
    $('#resetButton').addEventListener('click',()=>{if(!confirm('Make all previously viewed deals unseen? Saved deals will be kept.'))return;st.seen=Object.create(null);savedState();render(true);$('#settingsMessage').textContent='Seen history reset. Saved deals were kept.';});
    $('#undoButton').addEventListener('click',()=>{if(st.toastUndo)st.toastUndo();st.toastUndo=null;$('#toast').hidden=true;});
    $('#toastClose').addEventListener('click',()=>{$('#toast').hidden=true;st.toastUndo=null;});
    window.addEventListener('scroll',trackScroll,{passive:true});
    window.addEventListener('pagehide',savePosition);
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&st.shown<st.filtered.length){st.shown+=CHUNK;render(false);}},{rootMargin:'500px'});
    observer.observe($('#loadMoreSentinel'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(st.prefs.theme==='system')applyAppearance();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&st.checkedAt&&Date.now()-st.checkedAt>5*60*1000)refresh(false);});
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.scrollTo(0,0);render(true);refresh(false);
  });
})();
