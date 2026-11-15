/* DealStream v3 — private browsing history, safe updates and personalised deal tracking. */
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
  const BACKUP_META = 'dealstream_backup_meta_v3';
  const DWELL_MS = 550;
  const HISTORY_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;
  const CHUNK = 40;
  const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
  const DEFAULT = {palette:'red',customAccent:'#b92e3d',theme:'system',font:'normal',view:'compact',priceMode:true,threshold:'normal',onlyFollowed:false,followedStores:[],mutedStores:[],mutedKeywords:[],hiddenCategories:[],favoriteKeywords:[],quietAlerts:true,priceFilter:'any',customMax:''};
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, val) => { try { localStorage.setItem(key, val); return true; } catch { return false; } };
  const readObj = (key, fallback = {}) => { try { const v = JSON.parse(read(key) || 'null'); return v && typeof v==='object' && !Array.isArray(v) ? v : fallback; } catch { return fallback; } };
  const map = source => Object.assign(Object.create(null), source);
  const list = source => Array.isArray(source) ? source.filter(x => typeof x==='string' && x.length < 100).slice(0, 200) : [];
  const words = source => String(source || '').split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0, 150);
  const uniq = source => [...new Map(list(source).map(x=>[x.toLowerCase(),x])).values()];
  const loadPrefs = () => { const v=readObj(PREFS); return {...DEFAULT,...v, followedStores:uniq(v.followedStores),mutedStores:uniq(v.mutedStores),mutedKeywords:uniq(v.mutedKeywords),hiddenCategories:uniq(v.hiddenCategories),favoriteKeywords:uniq(v.favoriteKeywords)}; };
  const persisted = readObj(LAST_VISIT);
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION) || 'null'); } catch { /* ignore */ }
  const now = Date.now();
  const lastVisit = (session && now - Number(session.started) < 60*60*1000 && Number.isFinite(Number(session.baseline)))
    ? Number(session.baseline) : Number(persisted.time || 0);
  try { sessionStorage.setItem(SESSION, JSON.stringify({started:now,baseline:lastVisit})); } catch { /* ignore */ }
  const st = {data:[], seen:map(readObj(SEEN)), saved:map(readObj(SAVED)), snapshots:map(readObj(SNAPSHOTS)), prefs:loadPrefs(),
    tab:read(TAB)||'unseen', query:'',shown:CHUNK,filtered:[],loaded:false,updated:null,checkedAt:null,loading:false,
    lastY:0,scrolling:false,visible:new Set(),exposure:new Map(),cardCache:new Map(),renderVersion:1,matchOnly:false,offline:false,backupMeta:readObj(BACKUP_META),lastVisit, resume:readObj(RESUME),toastUndo:null,toastTimer:null,pendingFeed:null};
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
  function isFavourite(item){
    const p=st.prefs;
    return p.favoriteKeywords.some(term=>contains(item.title+' '+item.description,term)) ||
      p.followedStores.some(store=>fold(store)===fold(item.merchant));
  }
  function firstPrice(item){
    const title=item.title;
    if(/\bfree\b(?!\s+(?:shipping|delivery))|\$\s*0(?:\.00)?\b/i.test(title))return 0;
    const match=title.match(/(?:AU\s*)?\$\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
    return match?Number(match[1].replace(/,/g,'')):null;
  }
  function priceAllowed(item){
    const mode=st.prefs.priceFilter;
    if(mode==='any')return true;
    const price=firstPrice(item);
    if(price===null||!Number.isFinite(price))return false;
    if(mode==='free')return price===0;
    const cap=mode==='under25'?25:mode==='under50'?50:mode==='under100'?100:Number(st.prefs.customMax);
    return Number.isFinite(cap)&&cap>=0&&price<=cap;
  }
  function newCount(){return st.lastVisit ? st.data.filter(x=>x.ms>st.lastVisit).length:0;}
  function stats(){
    const unseen=st.data.filter(x=>!st.seen[x.id]).length;
    $('#unseenCount').textContent=unseen.toLocaleString('en-AU');
    $('#newCount').textContent=newCount().toLocaleString('en-AU');
    $('#tabUnseenCount').textContent=unseen.toLocaleString('en-AU');
    $('#tabNewCount').textContent=newCount().toLocaleString('en-AU');
    $('#tabSavedCount').textContent=Object.keys(st.saved).length.toLocaleString('en-AU');
    $('#updateStamp').textContent=st.updated?'Source checked '+rel(st.updated):'Feed not updated yet';
    $('#updateStamp').title=st.updated?new Date(st.updated).toLocaleString('en-AU'):'';
    $('#feedStatus').textContent=st.checkedAt?'This phone last checked the published snapshot at '+new Date(st.checkedAt).toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'}):'';
    const age=st.updated?(Date.now()-Date.parse(st.updated))/60000:Infinity;
    const health=$('#feedHealth');
    const level=st.offline?'offline':!st.updated?'unknown':age>60?'stale':age>30?'delayed':'fresh';
    const label={offline:'Offline copy',unknown:'No feed update yet',stale:'Updates overdue',delayed:'Updates delayed',fresh:'Feed healthy'}[level];
    health.className='health-chip health-'+level;health.textContent=label;
    $('#feedDetail').textContent=st.updated?'OzBargain fetched '+rel(st.updated)+' · GitHub schedule may run late':'Awaiting successful GitHub feed collection';
    if(st.matchOnly && !st.prefs.favoriteKeywords.length && !st.prefs.followedStores.length)st.matchOnly=false;
    const totalMatches=st.data.filter(d=>isFavourite(d)&&!st.seen[d.id]).length;
    $('#matchCount').textContent=totalMatches.toLocaleString('en-AU');
    $('#matchOnlyButton').hidden=!st.prefs.favoriteKeywords.length&&!st.prefs.followedStores.length;
    $('#matchOnlyButton').setAttribute('aria-pressed',String(st.matchOnly));
    $('#matchOnlyButton').classList.toggle('chip-active',st.matchOnly);
    const filterTotal=st.prefs.followedStores.length+st.prefs.mutedStores.length+st.prefs.mutedKeywords.length+st.prefs.hiddenCategories.length+st.prefs.favoriteKeywords.length+(st.prefs.onlyFollowed?1:0)+(st.prefs.priceFilter==='any'?0:1);
    $('#filterCount').textContent=filterTotal;$('#filterCount').hidden=filterTotal===0;
    $('#clearFilterButton').hidden=filterTotal===0;$('#quickActions').hidden=$('#resumeButton').hidden && $('#clearFilterButton').hidden && $('#matchOnlyButton').hidden;
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
    if(!priceAllowed(item))return false;
    return true;
  }
  function filtered(){
    const base=st.tab==='saved' ? [...st.data,...archivedSaved()].filter(x=>st.saved[x.id]).sort((a,b)=>Number(st.saved[b.id]||0)-Number(st.saved[a.id]||0)) : st.data;
    const q=fold(st.query.trim());
    return base.filter(x=>{
      if(st.tab==='unseen'&&st.seen[x.id])return false;
      if(st.tab==='new'&&(!st.lastVisit||x.ms<=st.lastVisit))return false;
      if(!passes(x))return false;
      if(st.matchOnly&&!isFavourite(x))return false;
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
    savedState();if(st.tab==='saved'||st.matchOnly)render(false);else {const c=st.cardCache.get(id);const item=st.data.find(d=>d.id===id)||st.filtered.find(d=>d.id===id);if(c&&item)updateCard(item,c);stats();}
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
    const fav=isFavourite(item);
    const c=make('article','deal-card'+(seen?' is-seen':'')+(st.prefs.view==='compact'?' is-compact':'')+(fav?' is-favourite':''));c.dataset.dealId=item.id;
    const top=make('div','card-top');
    const store=make('button','merchant-button'+(st.prefs.followedStores.some(x=>fold(x)===fold(item.merchant))?' is-followed':''),item.merchant||'OzBargain');
    store.type='button';store.title='Follow or unfollow '+(item.merchant||'store');store.setAttribute('aria-label',store.title);
    store.addEventListener('click',()=>followStore(item.merchant));top.append(store,make('span','card-time',rel(item.published)));c.append(top);
    const title=make('h3','card-title'),link=make('a','',item.title);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
    link.addEventListener('click',()=>markSeen(item.id,c));title.append(link);c.append(title);
    if(fav)c.append(make('span','favourite-chip','★ Favourite match'));
    if(st.prefs.priceMode){const price=firstPrice(item);if(price!==null)c.append(make('span','price-chip',price===0?'Free':('$'+price.toLocaleString('en-AU',{maximumFractionDigits:2}))));}
    if(item.description&&st.prefs.view==='detailed')c.append(make('p','card-description',item.description));
    const bottom=make('div','card-bottom');bottom.append(make('span','card-category',seen?'✓ Viewed':item.category||'New deal'));
    const buttons=make('div','card-actions');
    const save=action(saved?'★ Saved':'☆ Save',()=>saveDeal(item.id),saved?'saved':'');save.dataset.cardAction='save';save.setAttribute('aria-pressed',String(saved));save.setAttribute('aria-label',(saved?'Remove saved deal: ':'Save deal: ')+item.title);buttons.append(save);
    if(st.tab==='all'&&seen)buttons.append(action('Unsee',()=>unsee(item.id)));
    const open=make('a','card-action open','Open ↗');open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';open.addEventListener('click',()=>markSeen(item.id,c));buttons.append(open);
    bottom.append(buttons);c.append(bottom);
    c.append(make('span','swipe-indicator left','✓ Seen'),make('span','swipe-indicator right','★ Save'));
    enableSwipe(c,item.id);return c;
  }
  function showResume(){
    const id=st.resume.id,idx=id?st.filtered.findIndex(d=>d.id===id):-1;
    $('#resumeButton').hidden=idx<1;$('#quickActions').hidden=$('#resumeButton').hidden&&$('#clearFilterButton').hidden&&$('#matchOnlyButton').hidden;
  }
  function invalidateCards(){st.cardCache.clear();st.renderVersion++;}
  function updateCard(item,c){
    const saved=Boolean(st.saved[item.id]);c.classList.toggle('is-seen',Boolean(st.seen[item.id]));
    const button=c.querySelector('[data-card-action="save"]');
    if(button){button.textContent=saved?'★ Saved':'☆ Save';button.classList.toggle('saved',saved);button.setAttribute('aria-pressed',String(saved));
      button.setAttribute('aria-label',(saved?'Remove saved deal: ':'Save deal: ')+item.title);}
    const merchant=c.querySelector('.merchant-button');
    if(merchant)merchant.classList.toggle('is-followed',st.prefs.followedStores.some(x=>fold(x)===fold(item.merchant)));
    const fav=isFavourite(item);c.classList.toggle('is-favourite',fav);
    let chip=c.querySelector('.favourite-chip');
    if(fav && !chip){chip=make('span','favourite-chip','★ Favourite match');const title=c.querySelector('.card-title');title.after(chip);}
    if(!fav && chip)chip.remove();
  }
  function render(reset=false){
    const root=$('#dealList');
    const anchor=[...root.children].find(c=>{const r=c.getBoundingClientRect();return r.bottom>5&&r.top<innerHeight*.9;});
    const anchorId=anchor?.dataset.dealId,anchorTop=anchor?.getBoundingClientRect().top;
    if(reset){st.shown=CHUNK;st.visible.clear();}
    st.filtered=filtered();
    const items=st.filtered.slice(0,st.shown);
    const current=[...root.children];
    const samePrefix=current.length<=items.length && current.every((el,i)=>el.dataset.dealId===items[i].id && el.dataset.renderVersion===String(st.renderVersion));
    if(samePrefix){
      current.forEach((c,i)=>updateCard(items[i],c));
      const append=document.createDocumentFragment();
      for(let i=current.length;i<items.length;i++){
        const d=items[i],c=st.cardCache.get(d.id)||card(d);c.dataset.renderVersion=st.renderVersion;st.cardCache.set(d.id,c);updateCard(d,c);append.append(c);
      }
      root.append(append);
    }else{
      const fragment=document.createDocumentFragment();
      const old=new Map(current.filter(c=>c.dataset.renderVersion===String(st.renderVersion)).map(c=>[c.dataset.dealId,c]));
      for(const d of items){const c=old.get(d.id)||st.cardCache.get(d.id)||card(d);c.dataset.renderVersion=st.renderVersion;st.cardCache.set(d.id,c);updateCard(d,c);fragment.append(c);}
      root.replaceChildren(fragment);
    }
    // Changes to filters, tabs and layout should not unexpectedly jump a surviving anchor.
    if(anchorId && window.scrollY>80){
      const after=[...root.children].find(c=>c.dataset.dealId===anchorId);
      if(after)window.scrollBy(0,after.getBoundingClientRect().top-anchorTop);
    }
    $('#resultCount').textContent=st.loaded?'Showing '+Math.min(st.filtered.length,st.shown).toLocaleString('en-AU')+' of '+st.filtered.length.toLocaleString('en-AU')+' deals':'Loading…';
    $('#emptyState').hidden=!st.loaded||st.filtered.length>0;
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

  // Appearance stays in the existing preferences key; v1-v3 user data is untouched.
  const PALETTES = Object.freeze({
    red: ['OzBargain red','#b92e3d'],
    ocean: ['Ocean blue','#1766bc'],
    forest: ['Forest green','#1a7652'],
    violet: ['Violet','#7548bb'],
    teal: ['Teal','#0b767a'],
    amber: ['Amber','#9b6508'],
    rose: ['Rose','#aa346d'],
    slate: ['Slate','#4b607a']
  });
  const hexOK = v => typeof v==='string' && /^#[a-f0-9]{6}$/i.test(v);
  const rgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const hex = values => '#'+values.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const blend = (from,to,weight) => hex(rgb(from).map((x,i)=>x*(1-weight)+rgb(to)[i]*weight));
  const luminance = h => {
    const a=rgb(h).map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});
    return .2126*a[0]+.7152*a[1]+.0722*a[2];
  };
  const contrast = (a,b) => {const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  function accessibleAccent(value,isDark){
    const surface=isDark?'#101216':'#ffffff',direction=isDark?'#ffffff':'#000000';
    let candidate=value;
    for(let i=0;i<25&&contrast(candidate,surface)<5;i++)candidate=blend(candidate,direction,.11);
    return candidate;
  }
  function chosenPalette(){
    const p=st.prefs;
    const id=p.palette==='custom'?'custom':Object.hasOwn(PALETTES,p.palette)?p.palette:'red';
    return id==='custom' ? (hexOK(p.customAccent)?p.customAccent:'#b92e3d') : PALETTES[id][1];
  }
  function updatePaletteControls(){
    const chosen=Object.hasOwn(PALETTES,st.prefs.palette)?st.prefs.palette:st.prefs.palette==='custom'?'custom':'red';
    $$('.palette-choice').forEach(button=>{
      const active=button.dataset.palette===chosen;
      button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
    });
    const input=$('#customAccentInput');
    if(input && document.activeElement!==input)input.value=hexOK(st.prefs.customAccent)?st.prefs.customAccent:'#b92e3d';
    const label=$('#paletteSelection');
    if(label)label.textContent=chosen==='custom'?'Custom '+(st.prefs.customAccent||'#b92e3d').toUpperCase():PALETTES[chosen][0];
  }
  function setPalette(name){
    if(name!=='custom'&&!Object.hasOwn(PALETTES,name))return;
    st.prefs.palette=name;savePrefs();updatePaletteControls();
  }
  function setupPaletteControls(){
    const holder=$('#paletteOptions');if(!holder)return;
    holder.replaceChildren();
    for(const [id,[name,colour]] of Object.entries(PALETTES)){
      const button=make('button','palette-choice');button.type='button';button.dataset.palette=id;
      button.setAttribute('aria-label','Use '+name+' colour scheme');button.setAttribute('aria-pressed','false');
      const swatch=make('span','palette-swatch');swatch.style.backgroundColor=colour;swatch.setAttribute('aria-hidden','true');
      button.append(swatch,make('span','palette-name',name));
      button.addEventListener('click',()=>setPalette(id));holder.append(button);
    }
    const custom=make('button','palette-choice');custom.type='button';custom.dataset.palette='custom';
    custom.setAttribute('aria-label','Use custom colour scheme');custom.setAttribute('aria-pressed','false');
    const swatch=make('span','palette-swatch');swatch.id='customPaletteSwatch';swatch.setAttribute('aria-hidden','true');
    custom.append(swatch,make('span','palette-name','Custom'));custom.addEventListener('click',()=>setPalette('custom'));holder.append(custom);
    updatePaletteControls();
  }
  function applyAppearance(){
    const p=st.prefs;
    if(['light','dark'].includes(p.theme))document.documentElement.dataset.theme=p.theme;else delete document.documentElement.dataset.theme;
    document.documentElement.dataset.font=['normal','large','extra'].includes(p.font)?p.font:'normal';
    $('#layoutButton').textContent=p.view==='compact'?'Detailed':'Compact';
    const isDark=p.theme==='dark'||(p.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    const root=document.documentElement;
    const value=chosenPalette(),accent=accessibleAccent(value,isDark);
    const baseBg=isDark?'#101216':'#f6f5f3';
    const bg=blend(baseBg,accent,isDark?.035:.025);
    const soft=blend(isDark?'#1b1e24':'#ffffff',accent,isDark?.20:.10);
    root.style.setProperty('--bg',bg);
    root.style.setProperty('--accent',accent);
    root.style.setProperty('--accent-soft',soft);
    root.style.setProperty('--accent-on',isDark?'#101216':'#ffffff');
    document.querySelector('meta[name="theme-color"]').setAttribute('content',bg);
    const customSwatch=$('#customPaletteSwatch');if(customSwatch)customSwatch.style.backgroundColor=hexOK(p.customAccent)?p.customAccent:'#b92e3d';
    updatePaletteControls();
  }
  function splitLines(values){return values.join('\n');}
  function fillFilters(){
    $('#onlyFollowedCheckbox').checked=st.prefs.onlyFollowed;
    $('#followedStoresInput').value=splitLines(st.prefs.followedStores);
    $('#mutedStoresInput').value=splitLines(st.prefs.mutedStores);
    $('#mutedKeywordsInput').value=splitLines(st.prefs.mutedKeywords);
    $('#favoriteKeywordsInput').value=splitLines(st.prefs.favoriteKeywords);
    $('#quietAlertsCheckbox').checked=st.prefs.quietAlerts!==false;
    $('#priceFilterSelect').value=['any','free','under25','under50','under100','custom'].includes(st.prefs.priceFilter)?st.prefs.priceFilter:'any';
    $('#customMaxInput').value=st.prefs.customMax;
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
    st.prefs.favoriteKeywords=uniq(words($('#favoriteKeywordsInput').value));
    st.prefs.quietAlerts=$('#quietAlertsCheckbox').checked;
    st.prefs.priceFilter=$('#priceFilterSelect').value;
    const cap=$('#customMaxInput').value.trim();
    st.prefs.customMax=cap && Number.isFinite(Number(cap)) && Number(cap)>=0?cap:'';
    st.prefs.hiddenCategories=$$('.category-option.is-hidden').map(el=>el.dataset.category);
    invalidateCards();savePrefs();$('#filtersDialog').close();render(true);window.scrollTo(0,0);
  }
  function clearFilters(){
    st.prefs.onlyFollowed=false;st.prefs.followedStores=[];st.prefs.mutedStores=[];st.prefs.mutedKeywords=[];st.prefs.hiddenCategories=[];st.prefs.favoriteKeywords=[];st.prefs.priceFilter='any';st.prefs.customMax='';st.matchOnly=false;
    invalidateCards();savePrefs();render(true);
  }
  function applyFeed(items,updated){
    st.data=items;st.updated=updated;st.loaded=true;st.pendingFeed=null;invalidateCards();st.exposure.clear();
    syncSnapshots();banner(updated?'':'The feed has not been initialized. Run the GitHub update workflow.');
    render(true);
  }
  function refresh(manual=false){
    if(st.loading)return;st.loading=true;const btn=$('#refreshButton');btn.disabled=true;btn.classList.add('is-busy');
    const before=new Set(st.data.map(x=>x.id)),hadFeed=st.loaded;
    fetch('./data/deals.json?t='+Date.now(),{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error('HTTP '+r.status);
      st.offline=!navigator.onLine || r.headers?.get?.('X-DealStream-Cache')==='offline';
      const data=await r.json();if(!data||!Array.isArray(data.items))throw new Error('Invalid feed');
      const uniqMap=new Map();for(const raw of data.items){const d=clean(raw);if(d)uniqMap.set(d.id,d);}
      const incoming=[...uniqMap.values()].sort((a,b)=>b.ms-a.ms);
      const updated=typeof data.updatedAt==='string'&&!Number.isNaN(Date.parse(data.updatedAt))?data.updatedAt:null;
      const additions=hadFeed?incoming.filter(x=>!before.has(x.id)).length:0;
      const changed=incoming.length!==st.data.length || incoming.some((d,i)=>d.id!==st.data[i]?.id || d.title!==st.data[i]?.title);
      st.checkedAt=Date.now();
      const newlyMatched=hadFeed?incoming.filter(x=>!before.has(x.id)&&isFavourite(x)).length:0;
      // Do not rebuild the cards underneath someone reading partway through the feed.
      if(!manual && hadFeed && window.scrollY>160 && (changed || st.pendingFeed)){
        st.pendingFeed={items:incoming,updated};
        stats();
        banner(additions?`${additions} new deal${additions===1?'':'s'} ready. Scroll to the top to view them, or tap Refresh.`:'Updated deals are ready. Scroll to the top or tap Refresh.');
        if(newlyMatched && st.prefs.quietAlerts)toast(`★ ${newlyMatched} new favourite match${newlyMatched===1?'':'es'}`);
      }else if(!manual && hadFeed && !changed && !st.pendingFeed){
        st.updated=updated;stats();
      }else{
        if(manual)window.scrollTo(0,0);
        applyFeed(incoming,updated);
        if(newlyMatched && st.prefs.quietAlerts)toast(`★ ${newlyMatched} new favourite match${newlyMatched===1?'':'es'}`);
        else if(manual)toast(additions?`${additions} newly published deal${additions===1?'':'s'} loaded`:'You have the latest published feed');
      }
    }).catch(()=>{
      st.loaded=true;st.checkedAt=Date.now();
      st.offline=!navigator.onLine;
      banner('Could not check the published feed. '+(st.data.length?'Your current deals are still available.':'Check your internet connection and GitHub Pages deployment.'));
      stats();
    }).finally(()=>{st.loading=false;btn.disabled=false;btn.classList.remove('is-busy');});
  }
  const threshold = () => ({early:.7,normal:.45,careful:.2}[st.prefs.threshold]||.45);
  function recordExposure(){
    if(document.hidden||!st.loaded)return;
    const t=performance.now(),h=innerHeight;let changed=false;
    for(const c of $$('.deal-card')){
      const id=c.dataset.dealId,r=c.getBoundingClientRect();
      let exposure=st.exposure.get(id);
      const visible=r.bottom>0&&r.top<h*.94;
      if(!exposure){if(!visible)continue;exposure={ms:0,last:t};st.exposure.set(id,exposure);}
      else if(visible){if(exposure.last!==null)exposure.ms+=Math.min(t-exposure.last,300);exposure.last=t;}
      else exposure.last=null;
      if(!st.seen[id]&&exposure.ms>=DWELL_MS && r.bottom<h*threshold() && window.scrollY>40){
        st.seen[id]=Date.now();c.classList.add('is-seen');changed=true;
      }
    }
    if(changed){savedState();stats();}
  }
  function trackScroll(){
    if(st.scrolling)return;st.scrolling=true;
    requestAnimationFrame(()=>{
      st.scrolling=false;const y=window.scrollY;
      if(y<100&&st.pendingFeed){const pending=st.pendingFeed;applyFeed(pending.items,pending.updated);}
      recordExposure();$('#topButton').hidden=y<400;st.lastY=y;
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
  function persistBackupMeta(){write(BACKUP_META,JSON.stringify(st.backupMeta));}
  function backupStatus(){
    const last=Number(st.backupMeta.lastExport||0),hasHistory=Object.keys(st.seen).length+Object.keys(st.saved).length>0;
    $('#backupStatus').textContent=last?'Last backup: '+new Date(last).toLocaleDateString('en-AU')+'. Keep a copy outside your phone.':'No backup on record. Export one before clearing your browser or moving phones.';
    $('#backupNudge').hidden=!hasHistory || (last && Date.now()-last<HISTORY_REMINDER_MS) || Number(st.backupMeta.dismissedUntil||0)>Date.now();
  }
  async function checkStorage(protect=false){
    const message=$('#storageStatus');
    try{
      const probe='dealstream_storage_test_v3';localStorage.setItem(probe,'ok');
      if(localStorage.getItem(probe)!=='ok')throw new Error('Storage write failed');localStorage.removeItem(probe);
      let detail='Local history storage is working.';
      if(navigator.storage){
        if(protect&&typeof navigator.storage.persist==='function'){
          const granted=await navigator.storage.persist();detail+=granted?' Persistent storage was granted.':' Persistent storage was not granted; keep backups.';
        }else if(typeof navigator.storage.persisted==='function'){
          const persistent=await navigator.storage.persisted();detail+=persistent?' Storage is protected from normal eviction.':' Storage is not protected from eviction.';
        }
        if(typeof navigator.storage.estimate==='function'){
          const estimate=await navigator.storage.estimate();
          if(Number.isFinite(estimate.usage))detail+=' App-origin usage: '+(estimate.usage/(1024*1024)).toFixed(1)+' MB.';
        }
      }
      message.textContent=detail;
    }catch{message.textContent='Storage check failed. Export a backup to protect your history.';}
  }
  function setupAppUpdates(){
    if(!('serviceWorker' in navigator))return;
    const existed=Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(existed)$('#updateNotice').hidden=false;
    });
    navigator.serviceWorker.register('./sw.js').then(reg=>{reg.update().catch(()=>{});}).catch(()=>{});
  }
  function exportHistory(){
    const json=JSON.stringify({type:'dealstream-history',version:3,exportedAt:new Date().toISOString(),seen:st.seen,saved:st.saved,savedItems:st.snapshots,prefs:st.prefs},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=make('a');a.href=url;a.download='dealstream-backup.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    st.backupMeta.lastExport=Date.now();persistBackupMeta();backupStatus();
    $('#settingsMessage').textContent='Backup prepared. Save the JSON somewhere safe.';
  }
  async function importHistory(file){
    if(!file)return;if(file.size>12000000)throw new Error('Backup is too large');
    const v=JSON.parse(await file.text());
    if(!v||v.type!=='dealstream-history'||![1,2,3].includes(v.version)||!v.seen||!v.saved||typeof v.seen!=='object'||typeof v.saved!=='object'||Array.isArray(v.seen)||Array.isArray(v.saved))throw new Error('Not a valid DealStream backup');
    for(const [kind,source] of [['seen',v.seen],['saved',v.saved]]){
      let n=0;for(const [id,t] of Object.entries(source)){
        if(++n>60000)break;if(id.length<=180 && (typeof t==='string'||typeof t==='number'))st[kind][id]=t;
      }
    }
    if(v.version>=2&&v.savedItems&&typeof v.savedItems==='object'&&!Array.isArray(v.savedItems)){
      let n=0;for(const [id,item] of Object.entries(v.savedItems)){if(++n>60000)break;const d=clean(item);if(d&&d.id===id&&st.saved[id])st.snapshots[id]=snapshot(d);}
    }
    if(v.version>=2&&v.prefs&&typeof v.prefs==='object'&&!Array.isArray(v.prefs)){
      st.prefs={...DEFAULT,...v.prefs,followedStores:uniq(v.prefs.followedStores),mutedStores:uniq(v.prefs.mutedStores),mutedKeywords:uniq(v.prefs.mutedKeywords),hiddenCategories:uniq(v.prefs.hiddenCategories),favoriteKeywords:uniq(v.prefs.favoriteKeywords)};
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
    setupPaletteControls();applyAppearance();fillSettings();
    $$('.tab').forEach(el=>el.addEventListener('click',()=>changeTab(el.dataset.tab)));
    $$('.tab').forEach(el=>{const active=el.dataset.tab===st.tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});
    $('#searchInput').addEventListener('input',e=>{st.query=e.target.value;render(true);});
    $('#refreshButton').addEventListener('click',()=>refresh(true));
    $('#layoutButton').addEventListener('click',()=>{st.prefs.view=st.prefs.view==='compact'?'detailed':'compact';$('#viewSelect').value=st.prefs.view;invalidateCards();savePrefs();render(true);});
    $('#filtersButton').addEventListener('click',()=>{fillFilters();$('#filtersDialog').showModal();});
    const openSettings=fromPalette=>{
      $('#settingsMessage').textContent='';fillSettings();backupStatus();checkStorage();$('#settingsDialog').showModal();
      if(fromPalette){$('#appearanceSection').scrollIntoView({block:'nearest'});$('#customAccentInput').focus({preventScroll:true});}
    };
    $('#settingsButton').addEventListener('click',()=>openSettings(false));
    $('#appearanceButton').addEventListener('click',()=>openSettings(true));
    $('#customAccentInput').addEventListener('input',event=>{
      if(!hexOK(event.target.value))return;
      st.prefs.palette='custom';st.prefs.customAccent=event.target.value;applyAppearance();
    });
    $('#customAccentInput').addEventListener('change',event=>{
      if(!hexOK(event.target.value))return;
      st.prefs.palette='custom';st.prefs.customAccent=event.target.value;savePrefs();updatePaletteControls();
    });
    $$('[data-close]').forEach(el=>el.addEventListener('click',()=>document.getElementById(el.dataset.close).close()));
    for(const [id,key] of [['themeSelect','theme'],['fontSelect','font'],['viewSelect','view'],['thresholdSelect','threshold']]){
      $('#'+id).addEventListener('change',e=>{st.prefs[key]=e.target.value;if(key==='view')invalidateCards();savePrefs();render(key==='view');});
    }
    $('#priceModeCheckbox').addEventListener('change',e=>{st.prefs.priceMode=e.target.checked;invalidateCards();savePrefs();render(true);});
    $('#applyFiltersButton').addEventListener('click',applyFilters);
    $('#resetFiltersButton').addEventListener('click',()=>{clearFilters();fillFilters();});
    $('#clearFilterButton').addEventListener('click',clearFilters);
    $('#matchOnlyButton').addEventListener('click',()=>{st.matchOnly=!st.matchOnly;render(true);});
    $('#emptyAction').addEventListener('click',()=>{if(st.query){st.query='';$('#searchInput').value='';render(true);}else changeTab('all');});
    $('#topButton').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
    $('#resumeButton').addEventListener('click',resume);
    $('#exportButton').addEventListener('click',exportHistory);
    $('#backupNudgeButton').addEventListener('click',()=>{$('#settingsDialog').showModal();exportHistory();});
    $('#backupNudgeDismiss').addEventListener('click',()=>{st.backupMeta.dismissedUntil=Date.now()+HISTORY_REMINDER_MS;persistBackupMeta();backupStatus();});
    $('#storageCheckButton').addEventListener('click',()=>checkStorage());
    $('#protectStorageButton').addEventListener('click',()=>checkStorage(true));
    $('#installUpdateButton').addEventListener('click',()=>location.reload());
    $('#dismissUpdateButton').addEventListener('click',()=>{$('#updateNotice').hidden=true;});
    $('#importButton').addEventListener('click',()=>$('#importFile').click());
    $('#importFile').addEventListener('change',async e=>{try{await importHistory(e.target.files[0]);}catch(err){$('#settingsMessage').textContent='Import failed: '+err.message;}e.target.value='';});
    $('#resetButton').addEventListener('click',()=>{if(!confirm('Make all previously viewed deals unseen? Saved deals will be kept.'))return;st.seen=Object.create(null);savedState();render(true);$('#settingsMessage').textContent='Seen history reset. Saved deals were kept.';});
    $('#undoButton').addEventListener('click',()=>{if(st.toastUndo)st.toastUndo();st.toastUndo=null;$('#toast').hidden=true;});
    $('#toastClose').addEventListener('click',()=>{$('#toast').hidden=true;st.toastUndo=null;});
    window.addEventListener('scroll',trackScroll,{passive:true});
    window.setInterval(recordExposure,170);
    window.addEventListener('pagehide',savePosition);
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)&&st.shown<st.filtered.length){st.shown+=CHUNK;render(false);}},{rootMargin:'500px'});
    observer.observe($('#loadMoreSentinel'));
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(st.prefs.theme==='system')applyAppearance();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!st.loading&&(!st.checkedAt||Date.now()-st.checkedAt>=REFRESH_INTERVAL_MS))refresh(false);});
    window.setInterval(()=>{if(!document.hidden&&!st.loading&&(!st.checkedAt||Date.now()-st.checkedAt>=REFRESH_INTERVAL_MS))refresh(false);},REFRESH_INTERVAL_MS);
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.scrollTo(0,0);render(true);backupStatus();setupAppUpdates();refresh(false);
  });
})();
