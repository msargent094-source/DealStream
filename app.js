(() => {
  'use strict';
  const S = 'dealstream_seen_v1', B = 'dealstream_saved_v1', T = 'dealstream_tab_v1';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } };
  const readMap = key => {
    try { const v = JSON.parse(read(key) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? Object.assign(Object.create(null), v) : Object.create(null); }
    catch { return Object.create(null); }
  };
  const st = { data: [], filtered: [], seen: readMap(S), saved: readMap(B), tab: read(T) || 'unseen',
    query: '', shown: 35, loaded: false, checking: false, updated: null, lastY: 0 };
  const remember = () => {
    if (!write(S, JSON.stringify(st.seen)) || !write(B, JSON.stringify(st.saved)))
      banner('Your browser is blocking storage. Your viewed history may not be remembered.');
  };
  const banner = msg => { const el = $('#banner'); el.textContent = msg; el.hidden = !msg; };
  const rel = date => {
    if (!date) return 'Unknown';
    const d = Math.max(0, (Date.now() - new Date(date).getTime()) / 60000);
    if (d < 1) return 'just now';
    if (d < 60) return Math.floor(d) + 'm ago';
    if (d < 1440) return Math.floor(d / 60) + 'h ago';
    if (d < 10080) return Math.floor(d / 1440) + 'd ago';
    return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };
  const safeUrl = url => { try { const u = new URL(url); return u.protocol === 'https:' && ['ozbargain.com.au','www.ozbargain.com.au'].includes(u.hostname) ? u.href : null; } catch { return null; } };
  const clean = raw => {
    if (!raw || typeof raw.id !== 'string' || typeof raw.title !== 'string') return null;
    const url = safeUrl(raw.url), ms = Date.parse(raw.published);
    if (!url || !Number.isFinite(ms)) return null;
    return { id: raw.id.slice(0,180), title: raw.title.slice(0,500), url, published: new Date(ms).toISOString(), ms,
      merchant: typeof raw.merchant === 'string' ? raw.merchant.slice(0,80) : '',
      category: typeof raw.category === 'string' ? raw.category.slice(0,80) : '',
      description: typeof raw.description === 'string' ? raw.description.slice(0,350) : '' };
  };
  function stats() {
    let unseen = 0;
    for (const item of st.data) if (!st.seen[item.id]) unseen++;
    $('#unseenCount').textContent = unseen.toLocaleString('en-AU');
    $('#tabUnseenCount').textContent = unseen.toLocaleString('en-AU');
    $('#seenCount').textContent = Object.keys(st.seen).length.toLocaleString('en-AU');
    $('#savedCount').textContent = Object.keys(st.saved).length.toLocaleString('en-AU');
    $('#updateStamp').textContent = st.updated ? 'Feed checked ' + rel(st.updated) : st.loaded ? 'Awaiting first feed update' : 'Loading deals…';
    $('#updateStamp').title = st.updated ? new Date(st.updated).toLocaleString('en-AU') : '';
  }
  const make = (tag, className, value) => {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (value !== undefined) e.textContent = value;
    return e;
  };
  const button = (name, callback, className='') => {
    const b = make('button', 'card-action ' + className, name);
    b.type = 'button'; b.addEventListener('click', callback); return b;
  };
  function mark(id, card) {
    if (!st.seen[id]) { st.seen[id] = Date.now(); remember(); stats(); }
    if (card) card.classList.add('is-seen');
  }
  function unsee(id) { delete st.seen[id]; remember(); render(true); }
  function toggleSave(id, btn) {
    if (st.saved[id]) delete st.saved[id]; else st.saved[id] = Date.now();
    remember();
    stats();
    if (st.tab === 'saved') { render(true); return; }
    const saved = Boolean(st.saved[id]);
    btn.textContent = saved ? 'Saved' : 'Save'; btn.classList.toggle('saved', saved); btn.setAttribute('aria-pressed', String(saved));
  }
  function card(item) {
    const seen = Boolean(st.seen[item.id]), el = make('article','deal-card' + (seen ? ' is-seen' : ''));
    el.dataset.dealId = item.id;
    const top = make('div','card-top');
    top.append(make('span','source-chip',item.merchant || 'OzBargain'),make('span','card-time',rel(item.published)));
    el.append(top);
    const title = make('h3','card-title'), a = make('a','',item.title);
    a.href=item.url; a.target='_blank'; a.rel='noopener noreferrer'; a.addEventListener('click',()=>mark(item.id,el));
    title.append(a);el.append(title);
    if(item.description) el.append(make('p','card-description',item.description));
    const bottom=make('div','card-bottom'), badge=make('div','card-badges');
    badge.append(make('span',seen?'seen-marker':'category-chip',seen?'✓ Viewed':item.category || 'New deal'));
    bottom.append(badge);
    const actions=make('div','card-actions');
    let saveButton;
    saveButton=button(st.saved[item.id]?'Saved':'Save',()=>toggleSave(item.id,saveButton),st.saved[item.id]?'saved':'');
    saveButton.setAttribute('aria-pressed',String(Boolean(st.saved[item.id])));
    saveButton.setAttribute('aria-label',(st.saved[item.id]?'Unsave ':'Save ')+item.title);
    actions.append(saveButton);
    if(st.tab==='all'&&seen) actions.append(button('Unsee',()=>unsee(item.id)));
    const open=make('a','card-action open','View deal ↗');
    open.href=item.url;open.target='_blank';open.rel='noopener noreferrer';
    open.addEventListener('click',()=>mark(item.id,el));actions.append(open);
    bottom.append(actions);el.append(bottom);
    return el;
  }
  function getFiltered() {
    const q=st.query.trim().toLowerCase();
    return st.data.filter(item=>{
      if(st.tab==='unseen'&&st.seen[item.id])return false;
      if(st.tab==='saved'&&!st.saved[item.id])return false;
      return !q||[item.title,item.description,item.merchant,item.category].some(v=>v.toLowerCase().includes(q));
    });
  }
  function render(reset=false) {
    if(reset){st.shown=35;st.filtered=getFiltered();}
    const slice=st.filtered.slice(0,st.shown), box=$('#dealList'), fragment=document.createDocumentFragment();
    for(const item of slice)fragment.append(card(item));
    box.replaceChildren(fragment);
    const n=st.filtered.length;
    $('#resultCount').textContent=st.loaded?'Showing '+Math.min(n,st.shown).toLocaleString('en-AU')+' of '+n.toLocaleString('en-AU')+' deals':'Loading…';
    const empty=$('#emptyState');empty.hidden=!st.loaded||n>0;
    if(!empty.hidden){
      $('#emptyTitle').textContent=st.query.trim()?'No matching deals':st.tab==='unseen'?"You're all caught up!":st.tab==='saved'?'Nothing saved yet':'No deals available';
      $('#emptyDescription').textContent=st.query.trim()?'Try another search or clear the search box.':st.tab==='unseen'?'More deals appear as the feed updates.':st.tab==='saved'?'Tap Save on a deal to keep it here.':'The feed has no deals yet. Try again after the first update.';
      $('#emptyAction').textContent=st.query.trim()?'Clear search':st.tab==='unseen'?'Show all deals':'Browse unseen deals';
    }
    stats();
  }
  function tab(name) {
    st.tab=['unseen','all','saved'].includes(name)?name:'unseen';write(T,st.tab);
    $$('.tab').forEach(el=>{const active=el.dataset.tab===st.tab;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;});
    render(true);
  }
  async function refresh() {
    if(st.checking)return;
    st.checking=true;
    const b=$('#refreshButton');b.disabled=true;b.classList.add('is-busy');
    try {
      const response=await fetch('./data/deals.json?t='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.json();
      if(!data||!Array.isArray(data.items))throw new Error('Invalid feed data');
      const uniq=new Map();
      for(const row of data.items){const item=clean(row);if(item)uniq.set(item.id,item);}
      st.data=Array.from(uniq.values()).sort((a,b)=>b.ms-a.ms);
      st.updated=data.updatedAt||null;
      st.loaded=true;
      banner(st.updated?'':'Feed not initialised yet. Run the GitHub feed workflow once to load new deals.');
      render(true);
    }catch(e){
      st.loaded=true;
      banner('Could not check for new deals. '+(st.data.length?'Previously loaded deals remain available.':'Please check your connection and hosting settings.'));
      render(true);
    }finally{st.checking=false;b.disabled=false;b.classList.remove('is-busy');}
  }
  function scrollHandler() {
    if(st.scrolling)return;
    st.scrolling=true;
    requestAnimationFrame(()=>{
      st.scrolling=false;
      const y=window.scrollY;
      if(y>st.lastY&&y>38){
        let changed=false;
        for(const card of $$('.deal-card')){
          const id=card.dataset.dealId, rect=card.getBoundingClientRect();
          if(!st.seen[id]&&rect.bottom<=innerHeight*.62){st.seen[id]=Date.now();card.classList.add('is-seen');changed=true;}
        }
        if(changed){remember();stats();}
      }
      st.lastY=y;
    });
  }
  function exportHistory() {
    const json=JSON.stringify({type:'dealstream-history',version:1,exportedAt:new Date().toISOString(),seen:st.seen,saved:st.saved},null,2);
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
    const a=make('a');a.href=url;a.download='dealstream-history.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
    $('#settingsMessage').textContent='Backup prepared. Save it somewhere safe.';
  }
  async function importHistory(file) {
    if(!file)return;
    if(file.size>8000000)throw new Error('File too large');
    const obj=JSON.parse(await file.text());
    if(!obj||obj.type!=='dealstream-history'||obj.version!==1||!obj.seen||!obj.saved||typeof obj.seen!=='object'||typeof obj.saved!=='object'||Array.isArray(obj.seen)||Array.isArray(obj.saved))throw new Error('Not a valid DealStream backup');
    for(const [kind,key] of [['seen',S],['saved',B]]){
      let count=0;
      for(const [id,t] of Object.entries(obj[kind])){
        if(++count>60000)break;
        if(id.length<=180&&(typeof t==='string'||typeof t==='number'))st[kind][id]=t;
      }
    }
    remember();render(true);$('#settingsMessage').textContent='History imported and merged successfully.';
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $$('.tab').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.tab)));
    tab(st.tab);
    $('#searchInput').addEventListener('input',e=>{st.query=e.target.value;render(true);});
    $('#refreshButton').addEventListener('click',()=>{window.scrollTo(0,0);refresh();});
    $('#emptyAction').addEventListener('click',()=>{
      if(st.query){st.query='';$('#searchInput').value='';render(true);}else tab(st.tab==='unseen'?'all':'unseen');
    });
    $('#settingsButton').addEventListener('click',()=>$('#settingsDialog').showModal());
    $('#exportButton').addEventListener('click',exportHistory);
    $('#importButton').addEventListener('click',()=>$('#importFile').click());
    $('#importFile').addEventListener('change',async e=>{
      try{await importHistory(e.target.files[0]);}catch(err){$('#settingsMessage').textContent='Import failed: '+err.message;}
      e.target.value='';
    });
    $('#resetButton').addEventListener('click',()=>{
      if(!confirm('Make all previously viewed deals unseen? Saved deals will be kept.'))return;
      st.seen=Object.create(null);remember();render(true);$('#settingsMessage').textContent='Viewed history cleared.';
    });
    window.addEventListener('scroll',scrollHandler,{passive:true});
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)&&st.shown<st.filtered.length){st.shown+=35;render(false);}
    },{rootMargin:'500px'});
    observer.observe($('#loadMoreSentinel'));
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    window.scrollTo(0,0);refresh();
  });
})();
