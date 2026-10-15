(() => {
  'use strict';
  const DEFAULT_PLAYERS = [{id:1,name:'Loïc',color:'#7fa645'}, {id:2,name:'Alexandre',color:'#ec935b'}, {id:3,name:'Thibaud',color:'#6b9eaf'}];
  const PALETTE = ['#7fa645','#ec935b','#6b9eaf','#c25b8a','#d4b13f','#8a6fc4','#4fae9b','#b5654a','#5d7fd1','#9a9a4a'];
  let PLAYERS = DEFAULT_PLAYERS.slice();
  const STORAGE = 'yeti-club-v1';
  const $ = id => document.getElementById(id);
  const number = new Intl.NumberFormat('fr-FR', {maximumFractionDigits:2});
  const oneDecimal = new Intl.NumberFormat('fr-FR', {minimumFractionDigits:1,maximumFractionDigits:1});
  const dates = new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const dayFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'});
  let saved = {}, storageAvailable = true;
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}'); } catch (_) { storageAvailable = false; }
  const validScore = s => s && typeof s.id === 'string' && Number.isInteger(s.player) && s.player>0 && Number.isFinite(s.score) && s.score>=0 && !Number.isNaN(Date.parse(s.played_at));
  let outbox = Array.isArray(saved.outbox) ? saved.outbox.filter(validScore) : [];
  let selectedPlayer = Number.isInteger(saved.player) && saved.player>0 ? saved.player : null;
  let online = new Set();
  let dailyResults = [], snapshotIds = new Set(), savedSkins = new Map(), totals = new Map();
  let serverScores = [], connected = false, privateAccess = false, activeRound = null, playerApi = null, loadingGame = false;
  let flushing = null, gameLoaded = false, period = 'all', analysisPlayer = 'all', historyPlayer = 'all', historyLimit = 30, toastTimer, lastSaveError = '';

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify({player:selectedPlayer,outbox})); storageAvailable = true; }
    catch (_) { storageAvailable = false; }
  }
  function player(id) { return PLAYERS.find(p=>p.id===id) || {id,name:'Joueur '+id,color:'#97a898'}; }
  function setPlayers(list) {
    if(!Array.isArray(list))return;
    const parsed=list.map((p,i)=>{
      const id=Number(p&&(p.id??p.player_id??p.player));
      const name=String(p&&(p.name??p.display_name??p.pseudo)||'').trim();
      if(!Number.isInteger(id)||id<=0||!name)return null;
      const color=typeof p.color==='string'&&/^#[0-9a-f]{3,8}$/i.test(p.color)?p.color:(DEFAULT_PLAYERS.find(d=>d.id===id)?.color||PALETTE[(id-1)%PALETTE.length]);
      if(Array.isArray(p.skins))savedSkins.set(id,p.skins.map(String));
      if(Number.isFinite(Number(p.total)))totals.set(id,Number(p.total));
      return {id,name:name.slice(0,24),color};
    }).filter(Boolean).sort((a,b)=>a.id-b.id);
    if(!parsed.length)return;
    PLAYERS=parsed;renderPlayerOptions();
    const known=new Set(PLAYERS.map(p=>p.id)),before=outbox.length;
    outbox=outbox.filter(s=>known.has(s.player));if(outbox.length!==before)persist();
    if(selectedPlayer&&!known.has(selectedPlayer)){selectedPlayer=null;persist();}
    renderProfiles();
  }
  function renderPlayerOptions() {
    ['analysis-player','history-player'].forEach(id=>{
      const select=$(id),value=select.value;
      select.innerHTML='<option value="all">Tout le club</option>'+PLAYERS.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('');
      select.value=PLAYERS.some(p=>String(p.id)===value)?value:'all';
      if(id==='analysis-player')analysisPlayer=select.value;else historyPlayer=select.value;
    });
    $('club-names').textContent=PLAYERS.map(p=>p.name).join(' · ');
  }
  function escape(text) { return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes); bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    return [...bytes].map((b,i)=>([4,6,8,10].includes(i)?'-':'')+b.toString(16).padStart(2,'0')).join('');
  }
  async function request(path, body) {
    const adapter = window.YetiData;
    if (adapter) {
      if (adapter.ready) await adapter.ready;
      if (typeof adapter.request === 'function') return adapter.request(path, body);
      if (path === '/api/state') return adapter.getState();
      if (path === '/api/scores') return adapter.saveScores(body.scores);
      if (path === '/api/unlock') return adapter.unlock(body.code);
    }
    const response = await fetch(path, {method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    let data; try { data = await response.json(); } catch (_) { throw new Error('Le serveur ne répond pas correctement.'); }
    if (!response.ok) { const error=new Error(data.error||'Connexion indisponible');error.status=response.status;error.code=data.code;throw error; }
    return data;
  }
  function setConnection(ok, message) {
    connected=ok; $('connection').className='connection '+(ok?'connected':'offline');
    $('connection-text').textContent=message || (ok?'Les scores du club sont à jour':'Connexion en attente');
    renderSaveStatus();
  }
  function renderSaveStatus() {
    const n=outbox.length;
    let text=n?`${n} lancer${n>1?'s':''} en attente d’enregistrement. Nouvelle tentative automatique.`:'Tous les lancers reçus sont enregistrés dans le club.';
    if(!connected&&!n)text='Connexion au club en attente. Les nouveaux lancers seront conservés ici.';
    if(!storageAvailable)text='Le navigateur bloque la sauvegarde locale. Garde cette page ouverte jusqu’à l’enregistrement des scores.';
    else if(lastSaveError&&n)text=lastSaveError+' Les lancers restent en attente ici.';
    $('save-status').textContent=text; $('save-icon').textContent=n||!connected?'↻':'✓';
  }
  const toastQueue=[];
  function showToast(message) { if(toastQueue[toastQueue.length-1]===message)return;toastQueue.push(message);if(toastQueue.length===1)nextToast(); }
  function nextToast(){ if(!toastQueue.length)return;$('toast').textContent=toastQueue[0];$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastQueue.shift();$('toast').hidden=true;if(toastQueue.length)setTimeout(nextToast,250);},toastQueue.length>1?3200:4500); }
  function allScores() { const map=new Map(serverScores.map(s=>[s.id,s]));outbox.forEach(s=>map.set(s.id,s));return [...map.values()]; }

  function dayKey(date) {
    const parts=dayFormatter.formatToParts(new Date(date));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
  }
  function shiftDay(key, delta) { const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10); }
  function shortDay(key) { const [,m,d]=key.split('-');return d+'/'+m; }
  $('reference-date').value=dayKey(new Date());
  function bounds() {
    const date=$('reference-date').value||dayKey(new Date());
    if(period==='day')return {start:date,end:date,label:'Le '+shortDay(date)+'/'+date.slice(0,4)};
    if(period==='week'){const n=new Date(date+'T12:00:00Z').getUTCDay();const start=shiftDay(date,-((n+6)%7));return {start,end:shiftDay(start,6),label:'Du '+shortDay(start)+' au '+shortDay(shiftDay(start,6))};}
    if(period==='month'){const start=date.slice(0,7)+'-01';const d=new Date(start+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return {start,end:d.toISOString().slice(0,10),label:new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z'))};}
    return {start:null,end:null,label:'Depuis le début'};
  }
  function filteredScores() { const b=bounds();return allScores().filter(s=>{const d=dayKey(s.played_at);return (!b.start||d>=b.start)&&(!b.end||d<=b.end);}); }
  function stats(scores) {
    if(!scores.length)return {count:0,average:null,best:null,median:null,standardDeviation:null};
    const values=scores.map(s=>s.score).sort((a,b)=>a-b),average=values.reduce((a,b)=>a+b,0)/values.length;
    return {count:values.length,average,best:values[values.length-1],median:values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2,standardDeviation:Math.sqrt(values.reduce((n,v)=>n+(v-average)**2,0)/values.length)};
  }
  function renderProfiles() {
    const busy=activeRound||loadingGame?'disabled':'';
    const add=`<button class="profile-button add-player" data-add-player type="button" ${busy}><span aria-hidden="true">+</span>Add user</button>`;
    const on=p=>online.has(p.id)?'<span class="online-dot" aria-hidden="true"></span>':'',onTitle=p=>online.has(p.id)?` title="${escape(p.name)} est en ligne"`:'';
    $('profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''} ${selectedPlayer===p.id?'active':''}" data-player="${p.id}" type="button" aria-pressed="${selectedPlayer===p.id}"${onTitle(p)} ${busy}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    $('cover-profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''}" data-player="${p.id}" type="button"${onTitle(p)}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    const label=document.querySelector('.player-label');if(label)label.innerHTML='Je joue avec'+(online.size?` <span class="online-count" title="${escape(PLAYERS.filter(p=>online.has(p.id)).map(p=>p.name).join(', '))}"><i></i>${online.size} en ligne</span>`:'');
    $('round-tag').textContent=activeRound?'Lancer en cours…':modeLabel();
    $('round-tag').classList.toggle('mode-on',playMode.kind!=='free');
    if(typeof renderModeBanner==='function')renderModeBanner();
    $('restart-game').disabled=!gameLoaded||!!activeRound||loadingGame;
    if(typeof renderSkins==='function')renderSkins();
  }
  async function choosePlayer(id) {
    if(activeRound||loadingGame||privateAccess)return;
    selectedPlayer=id;playMode={kind:'free'};persist();online.add(id);renderProfiles();renderCompet();pingPresence();
    duels.filter(d=>d.status==='pending'&&d.opponent===id&&!inviteShown.has(d.id)).forEach(queueInvite);$('game-cover').hidden=true;if(typeof renderChat==='function')renderChat();
    renderSkins();
    if(!gameLoaded||loadedSkin!==gameKey(id))await loadGame();else showToast('Tu joues avec '+player(id).name+'.');
  }
  function handleTrace(message) {
    const text=String(message).trim();
    if(text==='YETI_START') {
      if(selectedPlayer&&!activeRound) { activeRound={id:uuid(),player:selectedPlayer,mode:playMode.kind,ref:playMode.id};renderProfiles(); }
      return;
    }
    const match=/^YETI_SCORE:([0-9]+(?:[.,][0-9]+)?)$/.exec(text);
    if(!match||!activeRound)return;
    const value=Number(match[1].replace(',','.'));if(!Number.isFinite(value)||value<0||value>1000000)return;
    const round=activeRound;activeRound=null;
    const score={id:round.id,player:round.player,played_at:new Date().toISOString(),score:Math.round(value*100)/100};
    if(round.mode==='daily'){score.mode='daily';score.ref=dayKey(score.played_at);}
    else if(round.mode==='duel'){score.mode='duel';score.ref=String(round.ref);}
    const previous=stats(allScores().filter(s=>s.player===score.player));
    const skinBefore=skinState(score.player);
    outbox.push(score);persist();lastSaveError='';renderProfiles();render();renderSaveStatus();
    $('last-result').hidden=false;$('last-result-name').textContent='DERNIER LANCER · '+player(score.player).name.toUpperCase();$('last-result-score').textContent=number.format(score.score);
    $('last-result-detail').textContent=previous.best===null?'Le premier lancer est posé. À vous de jouer !':score.score>previous.best?'Nouveau record personnel ! '+number.format(score.score-previous.best)+' m de mieux.':score.score===previous.best?'Record personnel égalé !':'Encore '+number.format(previous.best-score.score)+' m pour égaler ton record.';
    const skinAfter=skinState(score.player);
    if(skinBefore&&skinAfter){
      const gained=window.YetiSkins.list.filter(k=>skinAfter.unlocked.has(k.id)&&!skinBefore.unlocked.has(k.id));
      let msg='';
      if(skinAfter.curse&&(!skinBefore.curse||skinBefore.curse.id!==skinAfter.curse.id))msg=`${skinAfter.curse.emoji} Malédiction : ${skinAfter.curse.name} ! ${skinAfter.curse.until}`;
      else if(skinBefore.curse&&!skinAfter.curse)msg='Malédiction levée, tu retrouves ton skin.';
      if(gained.length){const g=gained[gained.length-1];msg=(g.kind==='ultra'?'💎 ULTRA RARE débloqué : ':'Nouveau skin : ')+`${g.emoji} ${g.name} !`+(gained.length>1?` (+${gained.length-1} autre${gained.length>2?'s':''})`:'')+(msg?' · '+msg:'');}
      if(msg)setTimeout(()=>showToast(msg),1200);
    }
    afterModeThrow(score);
    flushScores();
  }
  async function loadGame() {
    if(loadingGame||activeRound||privateAccess)return;
    loadingGame=true;$('game-loading').hidden=false;renderProfiles();
    try {
      const ruffle=window.RufflePlayer?.newest();if(!ruffle)throw new Error('Le moteur du jeu n’a pas pu être chargé.');
      $('game-container').replaceChildren();const element=ruffle.createPlayer();$('game-container').appendChild(element);
      playerApi=element.ruffle(1);
      const skinId=skinFor(selectedPlayer),podium=podiumOf(selectedPlayer),key=skinId+'|'+(podium||'');let data=null;
      try{data=window.YetiSkins?await window.YetiSkins.build(skinId,podium):null;}catch(_){data=null;showToast('Le skin n’a pas pu être appliqué, jeu d’origine chargé.');}
      await playerApi.load({...(data?{data}:{url:'game.swf'}),autoplay:'on',quality:'medium',backgroundColor:'#c9e8f7',allowScriptAccess:false,allowNetworking:'none',openUrlMode:'deny',splashScreen:false,contextMenu:'off',warnOnUnsupportedContent:false});
      playerApi.traceObserver=handleTrace;gameLoaded=true;loadedSkin=key;
    } catch(error) {
      gameLoaded=false;showToast(error.message||'Le jeu ne démarre pas. Réessaie en rechargeant la page.');$('game-cover').hidden=false;
    } finally { loadingGame=false;$('game-loading').hidden=true;renderProfiles(); }
  }
  let lastStateSig='';
  async function refresh() {
    try {
      const data=await request('/api/state');
      if(!data||!Array.isArray(data.scores))throw new Error('Historique indisponible.');
      setPlayers(data.players);
      if(Array.isArray(data.duels))setDuels(data.duels);
      if(Array.isArray(data.daily))dailyResults=data.daily.map(r=>({day:String(r.day).slice(0,10),player:Number(r.player),n:Number(r.n)||0,total:Number(r.total)||0}));
      const sig=JSON.stringify([data.players,data.scores.length,data.scores.length?data.scores[data.scores.length-1].id:'',data.duels||[],data.daily||[]]);const same=sig===lastStateSig;lastStateSig=sig;
      serverScores=data.scores.map(s=>({...s,player:Number(s.player),score:Number(s.score)})).filter(validScore);
      snapshotIds=new Set(serverScores.map(s=>s.id));
      saveSkins();
      privateAccess=false;$('access-overlay').hidden=true;if(!connected||!same)setConnection(true);if(!same)render();
      if(selectedPlayer&&!gameLoaded&&!loadingGame){$('game-cover').hidden=true;loadGame();}
      return true;
    } catch(error) {
      if(error.status===401||error.code==='private_access_required') {privateAccess=true;$('access-overlay').hidden=false;setConnection(false,'Lien privé requis');}
      else setConnection(false,'Connexion au club en attente');
      return false;
    }
  }
  async function flushScores() {
    if(flushing)return flushing;
    if(!outbox.length){renderSaveStatus();return true;}
    flushing=(async()=>{
      try {
        while(outbox.length) {
          const batch=outbox.slice(0,100),result=await request('/api/scores',{scores:batch});
          if(!result||!Array.isArray(result.accepted))throw new Error('Le serveur n’a pas confirmé la sauvegarde.');
          const accepted=new Set(result.accepted),rejected=new Set(Array.isArray(result.rejected)?result.rejected:[]);
          if(!batch.some(s=>accepted.has(s.id)||rejected.has(s.id)))throw new Error('Aucun lancer confirmé.');
          batch.filter(s=>accepted.has(s.id)).forEach(s=>{if(!serverScores.some(r=>r.id===s.id))serverScores.push(s);});
          if(rejected.size)showToast(`${rejected.size} lancer${rejected.size>1?'s':''} refusé${rejected.size>1?'s':''} par le serveur (données invalides), supprimé${rejected.size>1?'s':''}.`);
          outbox=outbox.filter(s=>!accepted.has(s.id)&&!rejected.has(s.id));persist();lastSaveError='';setConnection(true);render();
        }
        saveSkins();
        return true;
      } catch(error) {
        lastSaveError=error.message||'Enregistrement momentanément indisponible.';
        if(error.status===401||error.code==='private_access_required'){privateAccess=true;$('access-overlay').hidden=false;}
        setConnection(false,'Lancers en attente');render();return false;
      } finally { flushing=null;renderSaveStatus(); }
    })();return flushing;
  }
  const AVATARS=new Set(['alexandre','imany','loic','malak','mouna','nina','thibaud']);
  function avatar(p){
    const slug=p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    return AVATARS.has(slug)?`<img class="ranking-avatar" src="avatars/${slug}.jpg?v=1" alt="" style="--ring:${p.color}">`:`<span class="ranking-avatar ranking-avatar-empty" style="--ring:${p.color}">${escape(p.name.slice(0,1).toUpperCase())}</span>`;
  }
  function renderLeaderboard(scores) {
    const records=PLAYERS.map(p=>({...p,...stats(scores.filter(s=>s.player===p.id))})).sort((a,b)=>(b.best??-1)-(a.best??-1)||a.id-b.id);
    let rank=0,previous=null;
    $('leaderboard').innerHTML=records.map((p,index)=>{
      if(p.best!==previous||index===0)rank=index+1;previous=p.best;
      return `<div class="ranking-row ${rank===1&&p.best!==null?'leader':''}"><span class="rank-number">${p.count?String(rank).padStart(2,'0'):'—'}</span>${avatar(p)}<div><div class="ranking-name"><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</div><div class="ranking-sub">${p.count?`${p.count} lancer${p.count>1?'s':''} · moy. ${oneDecimal.format(p.average)} m`:'Le sommet attend'}</div></div><div class="ranking-score">${p.best===null?'—':number.format(p.best)}<small>mètres</small></div></div>`;
    }).join('');
    $('board-period').textContent=bounds().label;
  }
  function renderMetrics(scores) {
    const analyzed=scores.filter(s=>analysisPlayer==='all'||s.player===Number(analysisPlayer));
    const s=stats(analyzed),best=analyzed.find(r=>r.score===s.best),active=PLAYERS.filter(p=>scores.some(s=>s.player===p.id)).length;
    const cards=[['Lancers enregistrés',number.format(s.count),'',analysisPlayer==='all'?`${active} joueur${active>1?'s':''} actif${active>1?'s':''} sur la période`:escape(player(Number(analysisPlayer)).name)+' sur la période'],[analysisPlayer==='all'?'Moyenne du club':'Moyenne de '+escape(player(Number(analysisPlayer)).name),s.average===null?'—':oneDecimal.format(s.average),'m','Tous les lancers ont le même poids'],['Meilleur lancer',s.best===null?'—':number.format(s.best),'m',best?escape(player(best.player).name)+' · '+shortDay(dayKey(best.played_at)):'Le record reste à établir'],['Score médian',s.median===null?'—':oneDecimal.format(s.median),'m',s.count?'Écart-type : '+oneDecimal.format(s.standardDeviation)+' m':'Votre prochain lancer lance les stats']];
    $('metrics').innerHTML=cards.map(([label,value,unit,detail])=>`<div class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}<small>${unit}</small></div><div class="metric-detail">${detail}</div></div>`).join('');
    $('comparison-body').innerHTML=PLAYERS.map(p=>{const r=stats(scores.filter(s=>s.player===p.id));return `<tr><td><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</td><td>${r.count}</td><td>${r.average===null?'—':oneDecimal.format(r.average)+' m'}</td><td>${r.best===null?'—':number.format(r.best)+' m'}</td></tr>`;}).join('');
  }
  function renderTrend(scores) {
    const chartPlayers=PLAYERS.filter(p=>analysisPlayer==='all'||p.id===Number(analysisPlayer));
    scores=scores.filter(s=>analysisPlayer==='all'||s.player===Number(analysisPlayer));
    $('chart-legend').innerHTML=chartPlayers.map(p=>`<span><i class="player-dot" style="background:${p.color}"></i>${escape(p.name)}</span>`).join('');
    if(!scores.length){$('trend-chart').innerHTML='<div class="chart-empty">Un premier lancer, et la courbe démarre.<br>Les moyennes journalières apparaîtront ici.</div>';$('chart-note').textContent='Aucun score pour cette période.';return;}
    const days=[...new Set(scores.map(s=>dayKey(s.played_at)))].sort(),w=600,h=215,left=42,right=16,top=12,bottom=30;
    const series=chartPlayers.map(p=>({...p,points:days.map(day=>{const r=stats(scores.filter(s=>s.player===p.id&&dayKey(s.played_at)===day));return {day,value:r.average,count:r.count};}).filter(p=>p.value!==null)}));
    const maximum=Math.max(1,...series.flatMap(p=>p.points.map(v=>v.value))),ceiling=Math.ceil(maximum/5)*5;
    const first=new Date(days[0]+'T12:00:00Z').getTime(),last=new Date(days[days.length-1]+'T12:00:00Z').getTime();
    const x=day=>days.length===1?(w+left-right)/2:left+(new Date(day+'T12:00:00Z').getTime()-first)/(last-first)*(w-left-right);
    const y=v=>top+(1-v/ceiling)*(h-top-bottom);
    let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Évolution des moyennes journalières du club"><title>Moyennes journalières, en mètres</title>`;
    for(let n=0;n<=4;n++){const v=ceiling*n/4,yy=y(v);svg+=`<line x1="${left}" y1="${yy}" x2="${w-right}" y2="${yy}" stroke="#e9eee5" stroke-dasharray="3 4"/><text x="${left-9}" y="${yy+3}" text-anchor="end" fill="#879788" font-family="Arial" font-size="9">${number.format(v)}</text>`;}
    const tickIndices=[...new Set([0,Math.floor((days.length-1)/3),Math.floor(2*(days.length-1)/3),days.length-1])];
    tickIndices.forEach(i=>svg+=`<text x="${x(days[i])}" y="${h-7}" text-anchor="middle" fill="#879788" font-family="Arial" font-size="9">${shortDay(days[i])}</text>`);
    series.forEach(p=>{if(p.points.length>1)svg+=`<polyline points="${p.points.map(v=>x(v.day)+','+y(v.value)).join(' ')}" fill="none" stroke="${p.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;p.points.forEach(v=>svg+=`<circle cx="${x(v.day)}" cy="${y(v.value)}" r="4" fill="${p.color}" stroke="white" stroke-width="1.5"><title>${escape(p.name)} · ${v.day} : ${oneDecimal.format(v.value)} m (${v.count} lancer${v.count>1?'s':''})</title></circle>`);});
    svg+='</svg>';$('trend-chart').innerHTML=svg;$('chart-note').textContent=days.length+' journée'+(days.length>1?'s':'')+' de jeu · Les jours sans partie ne créent aucun score.';
  }
  function renderHistory(scores) {
    const selected=scores.filter(s=>historyPlayer==='all'||s.player===Number(historyPlayer)).sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at)||b.id.localeCompare(a.id));
    const pending=new Set(outbox.map(s=>s.id));
    $('history-description').textContent=`${selected.length} lancer${selected.length>1?'s':''} · ${bounds().label.toLowerCase()}`;
    $('history-body').innerHTML=selected.length?selected.slice(0,historyLimit).map(s=>{const p=player(s.player);return `<tr><td>${escape(dates.format(new Date(s.played_at)))}</td><td><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</td><td>${number.format(s.score)} <span class="record-status">m</span></td><td><span class="record-status ${pending.has(s.id)?'pending':''}">${pending.has(s.id)?'↻ En attente':'✓ Enregistré'}</span></td></tr>`;}).join(''):'<tr class="empty-row"><td colspan="4">Aucun lancer sur cette période. À vous de jouer.</td></tr>';
    $('load-more').hidden=selected.length<=historyLimit;
  }
  let tickerKey='',knownScoreIds=null,crackTimer;
  function tickerItem(s){
    const p=player(s.player),n=escape(p.name),v=number.format(s.score)+' m';
    if(s.score>=400)return `<span class="ticker-item crack"><span class="warn-sign" aria-hidden="true">!</span>ATTENTION GROS CRACK : ${n} · ${v}<span class="warn-sign" aria-hidden="true">!</span></span>`;
    if(s.score<100)return `<span class="ticker-item shame">💩 ${n} PUE LA MERDE · ${v}</span>`;
    return `<span class="ticker-item"><i class="player-dot" style="background:${p.color}"></i><b>${n}</b> envoie le phoque à ${v}</span>`;
  }
  function renderTicker(){
    const recent=allScores().filter(s=>s.score<150||s.score>250).sort((a,b)=>Date.parse(b.played_at)-Date.parse(a.played_at)||b.id.localeCompare(a.id)).slice(0,10);
    const key=recent.map(s=>s.id).join()+'|'+PLAYERS.map(p=>p.id+p.name).join();
    if(key===tickerKey)return;tickerKey=key;
    const items=recent.length?recent.map(tickerItem):['<span class="ticker-item">Aucun lancer pour l’instant. Le premier qui joue fait la une.</span>'];
    const unit=items.join('<span class="ticker-sep" aria-hidden="true">◆</span>')+'<span class="ticker-sep" aria-hidden="true">◆</span>';
    const track=$('ticker-track'),viewport=track.parentElement;
    track.style.animation='none';track.innerHTML=unit;
    const unitWidth=Math.max(1,track.scrollWidth),repeat=Math.max(1,Math.ceil(viewport.clientWidth/unitWidth));
    const half=unit.repeat(repeat);
    track.innerHTML=half+'<span aria-hidden="true" class="ticker-copy">'+half+'</span>';
    track.style.setProperty('--ticker-duration',Math.max(12,unitWidth*repeat/60)+'s');
    void track.offsetWidth;track.style.animation='';
  }
  function announceNewScores(){
    const all=allScores();
    if(knownScoreIds===null){if(!connected)return;knownScoreIds=new Set(all.map(s=>s.id));return;}
    const fresh=all.filter(s=>!knownScoreIds.has(s.id));
    const old=all.filter(s=>knownScoreIds.has(s.id)),oldBest=old.reduce((a,b)=>!a||b.score>a.score?b:a,null);
    fresh.forEach(s=>knownScoreIds.add(s.id));
    const top=fresh.reduce((a,b)=>!a||b.score>a.score?b:a,null);
    if(top&&oldBest&&top.score>oldBest.score){celebrateRecord(top,oldBest);return;}
    const crack=fresh.filter(s=>s.score>=400).sort((a,b)=>b.score-a.score)[0];
    if(crack){$('crack-alert-text').textContent=player(crack.player).name+' vient d’envoyer '+number.format(crack.score)+' m';$('crack-alert').hidden=false;clearTimeout(crackTimer);crackTimer=setTimeout(()=>$('crack-alert').hidden=true,7000);}
  }
  let partyTimer,confettiRun=0;
  function celebrateRecord(rec,prev){
    const p=player(rec.player),pp=player(prev.player);
    $('party-name').innerHTML=`<i class="player-dot" style="background:${p.color}"></i>${escape(p.name)}`;
    $('party-score').textContent=number.format(rec.score)+' m';
    $('party-prev').textContent=`Ancien record : ${number.format(prev.score)} m (${pp.name})`+(rec.score-prev.score>0?` · +${number.format(rec.score-prev.score)} m`:'');
    $('party').hidden=false;clearTimeout(partyTimer);partyTimer=setTimeout(()=>$('party').hidden=true,7000);
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)confetti(5500);
  }
  function confetti(duration){
    const run=++confettiRun,cv=$('confetti'),ctx=cv.getContext('2d'),dpr=Math.min(2,devicePixelRatio||1);
    const W=innerWidth,H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.hidden=false;ctx.setTransform(dpr,0,0,dpr,0,0);
    const colors=['#ffd400','#e30613','#4cd964','#3fa9f5','#ff8ac9','#ffffff','#f08b50','#9b59b6'];
    const n=Math.min(220,Math.round(W/5)),parts=Array.from({length:n},(_,i)=>({x:Math.random()*W,y:-20-Math.random()*H*0.6,vx:(Math.random()-.5)*3,vy:2+Math.random()*3.5,r:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,w:6+Math.random()*6,h:3+Math.random()*5,c:colors[i%colors.length],o:Math.random()*Math.PI*2}));
    const t0=performance.now();
    (function frame(now){
      if(run!==confettiRun)return;const t=now-t0;ctx.clearRect(0,0,W,H);
      for(const q of parts){q.x+=q.vx+Math.sin((t/300)+q.o)*.8;q.y+=q.vy;q.r+=q.vr;if(t<duration-1500&&q.y>H+20){q.y=-20;q.x=Math.random()*W;}
        ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.r);ctx.fillStyle=q.c;ctx.globalAlpha=t>duration-800?Math.max(0,(duration-t)/800):1;ctx.fillRect(-q.w/2,-q.h/2,q.w,q.h*Math.abs(Math.cos(q.r*2)));ctx.restore();}
      if(t<duration)requestAnimationFrame(frame);else{ctx.clearRect(0,0,W,H);cv.hidden=true;}
    })(t0);
  }
  let loadedSkin=null,skinChoices={};
  try{skinChoices=JSON.parse(localStorage.getItem('yeti-skins')||'{}')||{};}catch(_){}
  function bestOf(id){return stats(allScores().filter(s=>s.player===id)).best||0;}
  function skinState(id){
    if(!window.YetiSkins||!id)return null;
    const mine=allScores().filter(s=>s.player===id),total=(totals.get(id)||0)+mine.filter(s=>!snapshotIds.has(s.id)).length;
    return window.YetiSkins.evaluate(mine,player(id).name,{total,saved:savedSkins.get(id)||[]});
  }
  // Les skins débloqués sont enregistrés sur le serveur : la purge de l'historique ne les fait jamais perdre.
  const skinsSending=new Set();
  function saveSkins(){
    if(!window.YetiSkins||!snapshotIds.size)return; // attendre l'état du serveur
    for(const p of PLAYERS){
      const st=skinState(p.id);if(!st)continue;
      const saved=new Set(savedSkins.get(p.id)||[]);
      const fresh=[...st.unlocked].filter(id=>!saved.has(id)&&/^[a-z0-9]{2,20}$/.test(id)&&['record','defi','ultra'].includes(window.YetiSkins.byId(id).kind));
      if(!fresh.length||skinsSending.has(p.id))continue;
      skinsSending.add(p.id);
      request('/api/skins',{player:p.id,skins:fresh}).then(()=>savedSkins.set(p.id,[...saved,...fresh])).catch(()=>{}).finally(()=>skinsSending.delete(p.id));
    }
  }
  function podiumOf(id){
    if(!id)return null;
    const bests=PLAYERS.map(p=>({id:p.id,best:stats(allScores().filter(s=>s.player===p.id)).best})).filter(r=>r.best!==null).sort((a,b)=>b.best-a.best);
    const i=bests.findIndex(r=>r.id===id);return ['gold','silver','bronze'][i]||null;
  }
  function gameKey(id){return skinFor(id)+'|'+(podiumOf(id)||'');}
  function skinFor(id){
    const st=skinState(id);if(!st)return 'yeti';
    if(st.curse)return st.curse.id;
    return st.unlocked.has(skinChoices[id])?skinChoices[id]:'yeti';
  }
  const SKIN_GROUPS=[['perso','Skin perso'],['base','Départ'],['record','Paliers de record'],['defi','Défis'],['ultra','Ultra rares'],['curse','Malédictions']];
  function renderSkins(){
    const box=$('skins');if(!box||!window.YetiSkins)return;
    const st=skinState(selectedPlayer),current=skinFor(selectedPlayer),list=window.YetiSkins.list,busy=activeRound||loadingGame;
    const pod={gold:' · 🥇 pingouin en or massif',silver:' · 🥈 pingouin en argent massif',bronze:' · 🥉 pingouin en bronze massif'}[podiumOf(selectedPlayer)]||'';
    const name=selectedPlayer?player(selectedPlayer).name:'';
    $('skin-hint').textContent=!st?'Choisis ton pseudo pour voir tes skins.':`${name} · ${st.unlocked.size}/${list.filter(k=>k.kind!=='curse').length} skins`+(st.next?` · prochain palier à ${st.next.min} m`:'')+pod;
    $('skin-curse').hidden=!(st&&st.curse);
    if(st&&st.curse)$('skin-curse').innerHTML=`<span class="curse-emoji">${st.curse.emoji}</span><div><strong>Malédiction : ${escape(st.curse.name)}</strong><span>${escape(st.curse.tag)}. ${escape(st.curse.until)}</span></div>`;
    const pending=gameLoaded&&selectedPlayer&&loadedSkin!==gameKey(selectedPlayer);
    $('restart-game').innerHTML=pending?'Appliquer le nouveau look <span aria-hidden="true">↻</span>':'Relancer le jeu <span aria-hidden="true">↻</span>';
    $('restart-game').classList.toggle('pending',!!pending);
    const html=SKIN_GROUPS.map(([kind,label])=>{
      const items=list.filter(k=>k.kind===kind&&(kind!=='perso'||(st&&st.unlocked.has(k.id))));if(!items.length)return '';
      const cards=items.map(k=>{
        const curse=kind==='curse',open=!!st&&(curse?st.curse&&st.curse.id===k.id:st.unlocked.has(k.id)),active=!!st&&k.id===current;
        const cond=k.kind==='record'?k.min+' m de record':k.tag;
        const sub=curse?(open?'En cours · ':'')+escape(cond):open?(active?'✓ Équipé · ':'✓ ')+escape(cond):'🔒 '+escape(cond);
        const can=open&&!curse&&!busy&&!(st&&st.curse);
        return `<button type="button" class="skin-card kind-${k.kind} ${active?'active':''} ${open?'':'locked'} ${k.id==='prime'?'prime':''}" data-skin="${k.id}" ${can?'':'disabled'} aria-pressed="${active}" title="${escape(k.name+' — '+k.tag+' · '+cond)}"><span class="skin-emoji">${k.photo?`<img class="skin-photo" src="${k.photo}" alt="">`:k.emoji||'<span class=\'skin-yeti\'>Y.</span>'}</span><span class="skin-name">${escape(k.name)}</span><span class="skin-min">${sub}</span></button>`;
      }).join('');
      return `<div class="skin-group"><span class="skin-group-label">${label}</span><div class="skin-group-cards">${cards}</div></div>`;
    }).join('');
    if(box._html!==html){box.innerHTML=html;box._html=html;}
  }
  async function chooseSkin(id){
    if(!selectedPlayer||activeRound||loadingGame)return;
    const k=window.YetiSkins.byId(id),st=skinState(selectedPlayer);if(!st||st.curse||!st.unlocked.has(id))return;
    skinChoices[selectedPlayer]=id;try{localStorage.setItem('yeti-skins',JSON.stringify(skinChoices));}catch(_){}
    renderSkins();if(gameLoaded&&loadedSkin!==gameKey(selectedPlayer)){await loadGame();showToast(`${k.emoji||''} ${k.name} est sur la banquise.`);}
  }
  // ---------- Compétitions : battle royale quotidienne + duels ----------
  let playMode={kind:'free'},duels=[],knownDuels=null,brView='day',competTab='br',duelOpp=null;
  const POINTS=[10,8,6,5,4,3,2,1],DUEL_N=5,DAILY_N=10;
  // Le serveur ne garde que 300 lancers (+ les 10 meilleurs de chacun) : les compétitions se basent sur
  // les compteurs du serveur (daily / duels.c_n…) + les lancers locaux pas encore comptés par le serveur.
  // Résultat : {length: nombre de lancers, avg: moyenne}.
  const avgOf=l=>l.length?l.avg:null;
  const tally=(base,sum,extra)=>{const n=base+extra.length,t=sum+extra.reduce((a,s)=>a+s.score,0);return {length:n,avg:n?t/n:null};};
  const unsynced=ok=>allScores().filter(s=>!snapshotIds.has(s.id)&&ok(s));
  const dailyOf=(pid,day)=>{const r=dailyResults.find(x=>x.player===pid&&x.day===day);return tally(r?r.n:0,r?r.total:0,unsynced(s=>s.mode==='daily'&&s.ref===day&&s.player===pid));};
  const duelOf=(d,pid)=>{const c=pid===d.challenger;return tally(c?d.c_n:d.o_n,c?d.c_sum:d.o_sum,unsynced(s=>s.mode==='duel'&&s.ref===String(d.id)&&s.player===pid));};
  let duelStatus=new Map(),inviteQueue=[],inviteShown=new Set();
  function setDuels(list){
    duels=list.map(d=>({...d,id:Number(d.id),challenger:Number(d.challenger),opponent:Number(d.opponent),throws:Number(d.throws)||DUEL_N,status:d.status||'accepted',c_n:Number(d.c_n)||0,c_sum:Number(d.c_sum)||0,o_n:Number(d.o_n)||0,o_sum:Number(d.o_sum)||0}));
    const first=knownDuels===null;if(first)knownDuels=new Set();
    for(const d of duels){
      const prev=duelStatus.get(d.id);duelStatus.set(d.id,d.status);
      if(!knownDuels.has(d.id)){knownDuels.add(d.id);}
      if(d.status==='pending'&&d.opponent===selectedPlayer&&!inviteShown.has(d.id))queueInvite(d);
      if(!first&&prev==='pending'&&d.challenger===selectedPlayer){
        if(d.status==='accepted')showToast(`✅ ${player(d.opponent).name} a accepté ton duel ! Clique sur « Jouer » dans Duels 1v1.`);
        if(d.status==='refused')showToast(`❌ ${player(d.opponent).name} a refusé ton duel.`);
      }
    }
  }
  function queueInvite(d){inviteShown.add(d.id);inviteQueue.push(d.id);if(inviteQueue.length===1)showInvite();}
  function showInvite(){
    const d=duels.find(x=>x.id===inviteQueue[0]);if(!d||d.status!=='pending'||d.opponent!==selectedPlayer){inviteQueue.shift();if(inviteQueue.length)showInvite();else $('duel-invite').hidden=true;return;}
    const c=player(d.challenger),me=player(d.opponent);
    $('di-vs').innerHTML=`${avatar(c)}<span>VS</span>${avatar(me)}`;$('di-title').textContent=`${c.name} te défie !`;$('duel-invite').hidden=false;
  }
  async function answerDuel(id,accept){
    if(!selectedPlayer)return;
    try{await request('/api/duel/answer',{duel:id,player:selectedPlayer,accept});
      const d=duels.find(x=>x.id===id);if(d)d.status=accept?'accepted':'refused';duelStatus.set(id,d?d.status:'');
      if(accept){competTab='duel';setMode({kind:'duel',id});showToast(`⚔️ Duel accepté ! Tes 5 prochains lancers comptent.`);if(!gameLoaded)loadGame();}
      else showToast('Défi refusé.');
      await refresh();
    }catch(error){showToast(error.message||'Réponse impossible pour le moment.');}
    renderCompet();
  }
  $('di-yes').addEventListener('click',()=>{const id=inviteQueue.shift();$('duel-invite').hidden=true;if(id)answerDuel(id,true);if(inviteQueue.length)setTimeout(showInvite,400);});
  $('di-no').addEventListener('click',()=>{const id=inviteQueue.shift();$('duel-invite').hidden=true;if(id)answerDuel(id,false);if(inviteQueue.length)setTimeout(showInvite,400);});
  function dayRanking(day){
    const rows=PLAYERS.map(p=>{const l=dailyOf(p.id,day);return {p,n:l.length,avg:avgOf(l)};}).filter(r=>r.n);
    rows.sort((a,b)=>(b.n>=DAILY_N)-(a.n>=DAILY_N)||b.avg-a.avg);return rows;
  }
  function monthRanking(month){
    const days=[...new Set([...dailyResults.map(r=>r.day),...unsynced(s=>s.mode==='daily'&&s.ref).map(s=>s.ref)].filter(d=>d.startsWith(month)))];
    const t=new Map(PLAYERS.map(p=>[p.id,{p,pts:0,sessions:0,sum:0,wins:0}]));
    for(const day of days){dayRanking(day).filter(r=>r.n>=DAILY_N).forEach((r,i)=>{const e=t.get(r.p.id);if(!e)return;e.pts+=POINTS[i]||0;e.sessions++;e.sum+=r.avg;if(i===0)e.wins++;});}
    return [...t.values()].filter(e=>e.sessions).sort((a,b)=>b.pts-a.pts||b.sum/b.sessions-a.sum/a.sessions);
  }
  function duelState(d){
    const a=duelOf(d,d.challenger),b=duelOf(d,d.opponent),done=d.status==='accepted'&&a.length>=d.throws&&b.length>=d.throws,aa=avgOf(a),ba=avgOf(b);
    return {a,b,aa,ba,done,winner:done?(aa>ba?d.challenger:ba>aa?d.opponent:0):null};
  }
  function modeLabel(){
    if(playMode.kind==='daily'){const n=dailyOf(selectedPlayer,dayKey(new Date())).length;return `🏟️ Session du jour ${n}/${DAILY_N}`;}
    if(playMode.kind==='duel'){const d=duels.find(x=>x.id===playMode.id);if(d){const opp=d.challenger===selectedPlayer?d.opponent:d.challenger;return `⚔️ Duel vs ${player(opp).name} ${duelOf(d,selectedPlayer).length}/${d.throws}`;}}
    return 'Partie libre';
  }
  function renderModeBanner(){
    const el=$('mode-banner'),chip=$('mode-chip'),me=selectedPlayer,busy=activeRound?'disabled':'';
    let cls='free',html='',short='';
    if(playMode.kind==='daily'&&me){const l=dailyOf(me,dayKey(new Date())),a=avgOf(l);cls='daily';
      html=`<span class="mb-ico">🏟️</span><span class="mb-txt"><b>BATTLE ROYALE</b> · Session du jour <b>${l.length}/${DAILY_N}</b>${a!==null?` · moy. ${oneDecimal.format(a)} m`:''}<small>Tes lancers comptent pour le classement du jour</small></span><button type="button" class="mb-quit" data-mode="free" ${busy}>Mode classique</button>`;
      short=`🏟️ ${l.length}/${DAILY_N}`;}
    else if(playMode.kind==='duel'&&me){const d=duels.find(x=>x.id===playMode.id);if(d){const opp=d.challenger===me?d.opponent:d.challenger,l=duelOf(d,me),a=avgOf(l),ol=duelOf(d,opp),oa=avgOf(ol);cls='duel';
      html=`<span class="mb-ico">⚔️</span><span class="mb-txt"><b>DUEL vs ${escape(player(opp).name)}</b> · <b>${l.length}/${d.throws}</b>${a!==null?` · ta moy. ${oneDecimal.format(a)} m`:''}<small>${ol.length?`${escape(player(opp).name)} : ${ol.length}/${d.throws}${oa!==null?` · ${oneDecimal.format(oa)} m`:''}`:`${escape(player(opp).name)} n’a pas encore joué`}</small></span><button type="button" class="mb-quit" data-mode="free" ${busy}>Mode classique</button>`;
      short=`⚔️ ${l.length}/${d.throws}`;}}
    if(!html){cls='free';html=`<span class="mb-ico">🎮</span><span class="mb-txt"><b>MODE CLASSIQUE</b> · partie libre<small>Lance autant que tu veux, tout compte dans les stats</small></span>`;short='🎮 Classique';}
    el.className='mode-banner mode-'+cls;el.innerHTML=html;chip.className='mode-chip mode-'+cls;chip.textContent=short;chip.hidden=false;
  }
  $('mode-banner').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(b&&!b.disabled){setMode({kind:'free'});showToast('🎮 Retour au mode classique.');}});
  function setMode(m){if(activeRound)return;playMode=m;renderProfiles();renderCompet();}
  function afterModeThrow(score){
    if(score.mode==='daily'){const l=dailyOf(score.player,score.ref);
      if(l.length>=DAILY_N){playMode={kind:'free'};const r=dayRanking(score.ref).findIndex(x=>x.p.id===score.player);setTimeout(()=>showToast(`🏟️ Session terminée : ${oneDecimal.format(avgOf(l))} m de moyenne · ${r+1}${r?'e':'er'} du jour pour l’instant`),1500);}}
    if(score.mode==='duel'){const d=duels.find(x=>String(x.id)===score.ref);if(d&&duelOf(d,score.player).length>=d.throws){playMode={kind:'free'};const st=duelState(d),opp=d.challenger===score.player?d.opponent:d.challenger;
      setTimeout(()=>showToast(st.done?(st.winner===score.player?`🏆 Duel gagné contre ${player(opp).name} !`:st.winner===0?'🤝 Égalité parfaite !':`😵 Duel perdu contre ${player(opp).name}…`):`⚔️ Tes ${d.throws} lancers sont faits, on attend ${player(opp).name}.`),1500);}}
    renderProfiles();renderCompet();
  }
  function rowHTML(rank,p,cells,me){return `<div class="br-row ${me?'me':''}"><span class="br-rank">${rank}</span>${avatar(p)}<b>${escape(p.name)}</b>${cells}</div>`;}
  function renderCompet(){
    if(!$('compet'))return;
    const today=dayKey(new Date()),month=today.slice(0,7),me=selectedPlayer;
    $('br-date').textContent=brView==='day'?new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Paris'}).format(new Date()):new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'Europe/Paris'}).format(new Date());
    document.querySelectorAll('#br-tabs [data-br]').forEach(b=>b.classList.toggle('active',b.dataset.br===brView));
    // ma session
    let mine='';
    if(!me)mine='<p class="br-hint">Choisis ton pseudo pour jouer ta session du jour.</p>';
    else{const l=dailyOf(me,today),busy=activeRound?'disabled':'';
      if(l.length>=DAILY_N)mine=`<p class="br-done">✅ Session du jour terminée : <b>${oneDecimal.format(avgOf(l))} m</b> de moyenne. Reviens demain !</p>`;
      else if(playMode.kind==='daily')mine=`<div class="br-live"><span>🏟️ Session en cours · <b>${l.length}/${DAILY_N}</b>${l.length?` · moy. ${oneDecimal.format(avgOf(l))} m`:''}</span><button type="button" class="br-btn ghost" data-mode="free" ${busy}>Pause</button></div><div class="br-bar"><i style="width:${l.length*10}%"></i></div>`;
      else mine=`<button type="button" class="br-btn" data-mode="daily" ${busy}>${l.length?`▶ Reprendre ma session (${l.length}/${DAILY_N})`:'▶ Lancer ma session du jour · 10 lancers'}</button>`;}
    $('br-me').innerHTML=mine;
    // tableau
    let html='';
    if(brView==='day'){const rows=dayRanking(today);
      html=rows.length?rows.map((r,i)=>rowHTML(r.n>=DAILY_N?String(i+1).padStart(2,'0'):'…',r.p,`<span class="br-n">${r.n}/${DAILY_N}</span><span class="br-avg">${oneDecimal.format(r.avg)} m</span>`,r.p.id===me)).join(''):'<p class="br-empty">Personne n’a encore joué sa session aujourd’hui.</p>';}
    else{const rows=monthRanking(month);
      html=rows.length?'<div class="br-head"><span></span><span></span><span>Joueur</span><span>Sessions</span><span>Pts</span></div>'+rows.map((e,i)=>rowHTML(String(i+1).padStart(2,'0'),e.p,`<span class="br-n">${e.sessions}${e.wins?` · 🥇${e.wins}`:''}</span><span class="br-avg">${e.pts} pts</span>`,e.p.id===me)).join(''):'<p class="br-empty">Aucune session complète ce mois-ci.</p>';}
    $('br-table').innerHTML=html;
    // duels
    if(duelOpp===me||!PLAYERS.some(p=>p.id===duelOpp))duelOpp=null;
    $('duel-pick').innerHTML=me?PLAYERS.filter(p=>p.id!==me).map(p=>`<button type="button" class="duel-opp ${duelOpp===p.id?'on':''}" data-opp="${p.id}" role="radio" aria-checked="${duelOpp===p.id}">${avatar(p)}<span>${escape(p.name)}</span></button>`).join(''):'<p class="br-empty">Choisis ton pseudo pour défier quelqu’un.</p>';
    $('duel-go').disabled=!me||!duelOpp;$('duel-go').textContent=duelOpp?`⚔️ Défier ${player(duelOpp).name}`:'Choisis un adversaire';
    // onglets
    document.querySelectorAll('.compet-tab').forEach(t=>{const on=t.dataset.tab===competTab;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));});
    document.querySelectorAll('.compet-panel').forEach(p=>p.hidden=p.dataset.panel!==competTab);
    const todo=me?duels.filter(d=>((d.challenger===me||d.opponent===me)&&d.status==='accepted'&&duelOf(d,me).length<d.throws)||(d.status==='pending'&&d.opponent===me)).length:0;
    $('ct-duel-badge').hidden=!todo;$('ct-duel-badge').textContent=todo;
    const inv=me?duels.filter(d=>d.status==='pending'&&d.opponent===me).length:0;
    $('ct-duel-sub').textContent=inv?`${inv} défi${inv>1?'s':''} reçu${inv>1?'s':''} !`:todo?`${todo} duel${todo>1?'s':''} à jouer`:'Défie un pote';
    const myDay=me?dailyOf(me,today).length:0;
    $('ct-br-sub').textContent=!me?'Session du jour · 10 lancers':myDay>=DAILY_N?'✅ Session du jour faite':myDay?`Session en cours ${myDay}/${DAILY_N}`:'▶ Ta session du jour t’attend';
    const mineD=duels.filter(d=>d.challenger===me||d.opponent===me).sort((a,b)=>b.id-a.id).slice(0,8);
    const others=duels.filter(d=>d.challenger!==me&&d.opponent!==me&&d.status==='accepted').map(d=>({d,st:duelState(d)})).filter(x=>x.st.done).sort((a,b)=>b.d.id-a.d.id).slice(0,4);
    const line=(d,st)=>{const A=player(d.challenger),B=player(d.opponent),fa=st.a.length,fb=st.b.length;
      const sc=(p,l,av,win)=>`<span class="duel-side ${win?'win':''}">${avatar(p)}<span><b>${escape(p.name)}</b><small>${l}/${d.throws}${av!==null?` · ${oneDecimal.format(av)} m`:''}</small></span></span>`;
      let status='';const myN=me?duelOf(d,me).length:0,isMine=d.challenger===me||d.opponent===me;
      if(d.status==='refused')status='<span class="duel-st lose">❌ Refusé</span>';
      else if(d.status==='pending')status=d.opponent===me?`<span class="duel-ans"><button type="button" class="br-btn small ghost" data-answer="0" data-id="${d.id}">Refuser</button><button type="button" class="br-btn small" data-answer="1" data-id="${d.id}">Accepter</button></span>`:'<span class="duel-st">⏳ En attente de réponse</span>';
      else if(st.done)status=st.winner===0?'<span class="duel-st">🤝 Égalité</span>':isMine?(st.winner===me?'<span class="duel-st win">🏆 Gagné</span>':'<span class="duel-st lose">Perdu</span>'):`<span class="duel-st">🏆 ${escape(player(st.winner).name)}</span>`;
      else if(isMine&&myN<d.throws)status=playMode.kind==='duel'&&playMode.id===d.id?'<span class="duel-st live">En cours…</span>':`<button type="button" class="br-btn small" data-duel="${d.id}" ${activeRound?'disabled':''}>Jouer</button>`;
      else if(isMine)status=`<span class="duel-st">En attente de ${escape(player(d.challenger===me?d.opponent:d.challenger).name)}</span>`;
      return `<div class="duel-row">${sc(A,fa,st.aa,st.winner===d.challenger)}<span class="duel-vs">VS</span>${sc(B,fb,st.ba,st.winner===d.opponent)}${status}</div>`;};
    $('duel-list').innerHTML=(mineD.length?mineD.map(d=>line(d,duelState(d))).join(''):`<p class="br-empty">${me?'Aucun duel pour toi. Défie quelqu’un !':'Choisis ton pseudo pour voir tes duels.'}</p>`)+(others.length?'<p class="duel-sep">Derniers duels du club</p>'+others.map(x=>line(x.d,x.st)).join(''):'');
  }
  $('br-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-br]');if(b){brView=b.dataset.br;renderCompet();}});
  $('br-me').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b||b.disabled)return;setMode({kind:b.dataset.mode});if(b.dataset.mode==='daily'){showToast('🏟️ Session du jour lancée : tes 10 prochains lancers comptent !');if(!gameLoaded)loadGame();$('game-stage').scrollIntoView({behavior:'smooth',block:'center'});}});
  $('duel-list').addEventListener('click',e=>{const a=e.target.closest('[data-answer]');if(a){answerDuel(Number(a.dataset.id),a.dataset.answer==='1');return;}const b=e.target.closest('[data-duel]');if(!b||b.disabled)return;setMode({kind:'duel',id:Number(b.dataset.duel)});showToast('⚔️ Duel lancé : tes 5 prochains lancers comptent !');if(!gameLoaded)loadGame();$('game-stage').scrollIntoView({behavior:'smooth',block:'center'});});
  $('duel-new').addEventListener('submit',async e=>{e.preventDefault();const opp=duelOpp;if(!selectedPlayer||!opp)return;$('duel-go').disabled=true;
    try{const r=await request('/api/duel',{challenger:selectedPlayer,opponent:opp});await refresh();showToast(`⚔️ Défi envoyé à ${player(opp).name}, en attente de sa réponse…`);if(r&&r.id){knownDuels&&knownDuels.add(Number(r.id));}}
    catch(error){showToast(error.message||'Impossible de créer le duel.');}finally{duelOpp=null;renderCompet();}});
  $('duel-pick').addEventListener('click',e=>{const b=e.target.closest('[data-opp]');if(!b)return;const id=Number(b.dataset.opp);duelOpp=duelOpp===id?null:id;renderCompet();});
  document.querySelector('.compet-tabs').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(!t)return;competTab=t.dataset.tab;renderCompet();});
  function render() { const scores=filteredScores();renderLeaderboard(scores);renderMetrics(scores);renderTrend(scores);renderHistory(scores);renderTicker();announceNewScores();renderSkins();renderCompet(); }

  function onProfileClick(e){if(e.target.closest('[data-add-player]')){openAddPlayer();return;}const button=e.target.closest('[data-player]');if(button)choosePlayer(Number(button.dataset.player));}
  $('profiles').addEventListener('click',onProfileClick);
  $('cover-profiles').addEventListener('click',onProfileClick);
  function openAddPlayer(){if(activeRound||loadingGame)return;$('add-player-error').textContent='';$('new-player-name').value='';$('add-player-overlay').hidden=false;$('new-player-name').focus();}
  function closeAddPlayer(){$('add-player-overlay').hidden=true;}
  $('add-player-cancel').addEventListener('click',closeAddPlayer);
  $('add-player-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeAddPlayer();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('add-player-overlay').hidden)closeAddPlayer();});
  $('add-player-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const name=$('new-player-name').value.trim().replace(/\s+/g,' ');
    if(name.length<2||name.length>24){$('add-player-error').textContent='Le prénom doit faire entre 2 et 24 caractères.';return;}
    if(PLAYERS.some(p=>p.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr'))){$('add-player-error').textContent='Ce joueur existe déjà.';return;}
    const button=$('add-player-submit');button.disabled=true;$('add-player-error').textContent='';
    try{
      const result=await request('/api/players',{name});
      if(Array.isArray(result.players))setPlayers(result.players);
      else if(result.player)setPlayers([...PLAYERS,result.player]);
      await refresh();
      const created=PLAYERS.find(p=>p.name.toLocaleLowerCase('fr')===name.toLocaleLowerCase('fr'));
      closeAddPlayer();renderProfiles();render();
      showToast(name+' rejoint le club !');
      if(created)choosePlayer(created.id);
    }catch(error){$('add-player-error').textContent=error.message||'Impossible d’ajouter ce joueur pour le moment.';}
    finally{button.disabled=false;}
  });
  $('restart-game').addEventListener('click',loadGame);
  $('party').addEventListener('click',()=>{$('party').hidden=true;});
  $('skins').addEventListener('click',e=>{const b=e.target.closest('[data-skin]');if(b&&!b.disabled)chooseSkin(b.dataset.skin);});
  const isPhone=()=>matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<=820;
  document.documentElement.classList.toggle('is-phone',isPhone());
  $('fullscreen-game').hidden=!isPhone();
  async function enterFullscreen(){
    const stage=$('game-stage');stage.classList.add('is-fullscreen');document.body.classList.add('fs-lock');$('fs-close').hidden=false;
    try{if(stage.requestFullscreen)await stage.requestFullscreen({navigationUI:'hide'});else if(stage.webkitRequestFullscreen)stage.webkitRequestFullscreen();}catch(_){}
    try{await screen.orientation.lock('landscape');}catch(_){}
  }
  async function exitFullscreen(){
    const stage=$('game-stage');stage.classList.remove('is-fullscreen');document.body.classList.remove('fs-lock');$('fs-close').hidden=true;
    try{screen.orientation.unlock();}catch(_){}
    try{if(document.fullscreenElement)await document.exitFullscreen();}catch(_){}
  }
  $('fullscreen-game').addEventListener('click',enterFullscreen);
  $('fs-close').addEventListener('click',exitFullscreen);
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&$('game-stage').classList.contains('is-fullscreen'))exitFullscreen();});
  $('share-link').addEventListener('click',async()=>{try{const url=window.YetiData.getInviteUrl();await navigator.clipboard.writeText(url);showToast('Lien privé copié. Partage-le aux potes.');}catch(_){showToast('Ouvre le lien privé du club pour pouvoir le partager.');}});
  $('period-buttons').addEventListener('click',e=>{const button=e.target.closest('[data-period]');if(!button)return;period=button.dataset.period;historyLimit=30;document.querySelectorAll('[data-period]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});$('date-control').hidden=period==='all';render();});
  $('reference-date').addEventListener('change',()=>{historyLimit=30;render();});
  $('analysis-player').addEventListener('change',e=>{analysisPlayer=e.target.value;render();});
  $('history-player').addEventListener('change',e=>{historyPlayer=e.target.value;historyLimit=30;renderHistory(filteredScores());});
  $('history-toggle').addEventListener('click',()=>{const card=$('history-card'),open=card.hidden;card.hidden=!open;$('history-toggle').setAttribute('aria-expanded',String(open));$('history-toggle').innerHTML=open?'Masquer le carnet des lancers <span aria-hidden="true">↑</span>':'Consulter le carnet des lancers <span aria-hidden="true">→</span>';if(open){renderHistory(filteredScores());card.scrollIntoView({behavior:'smooth',block:'start'});}});
  $('load-more').addEventListener('click',()=>{historyLimit+=30;renderHistory(filteredScores());});
  $('access-form').addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('access-error').textContent='';try{const raw=$('club-code').value.trim(),found=/club=([A-Za-z0-9]+)/.exec(raw);await request('/api/unlock',{code:found?found[1]:raw});$('club-code').value='';await refresh();await flushScores();}catch(error){$('access-error').textContent=error.message||'Ce code ne permet pas d’entrer.';}finally{button.disabled=false;}});
  window.addEventListener('online',async()=>{await flushScores();await refresh();});
  window.addEventListener('offline',()=>setConnection(false,'Hors ligne · scores conservés ici'));
  document.addEventListener('visibilitychange',async()=>{if(!document.hidden){await flushScores();await refresh();}});
  window.addEventListener('storage',e=>{if(e.key!==STORAGE)return;try{const other=JSON.parse(e.newValue||'{}');if(Array.isArray(other.outbox)){const merged=new Map(outbox.map(s=>[s.id,s]));other.outbox.filter(validScore).forEach(s=>merged.set(s.id,s));const known=new Set(serverScores.map(s=>s.id));outbox=[...merged.values()].filter(s=>!known.has(s.id));render();renderSaveStatus();}}catch(_){}});
  let lastVersion=null,polling=false,lastFull=Date.now();
  async function poll(){
    if(polling||document.hidden||privateAccess)return;
    if(activeRound||loadingGame){if(chatOpen){try{const v=await request('/api/version');if(Number(v.chat)>chatLast)loadChat();}catch(_){}}return;}
    polling=true;
    try{
      if(outbox.length)await flushScores();
      let changed=Date.now()-lastFull>30000;
      try{const v=await request('/api/version');if(v&&v.version){if(v.version!==lastVersion){changed=true;lastVersion=v.version;}if(Number(v.chat)>chatLast)loadChat();}}
      catch(error){if(error.status===401){changed=true;}else if(Date.now()-lastFull>10000)changed=true;}
      if(changed){lastFull=Date.now();await refresh();}
    }finally{polling=false;}
  }
  // ---------- Chat ----------
  let chatMsgs=[],chatLast=0,chatOpen=false,chatLoading=false,chatRead=0,chatInit=false,peekTimer;
  function chatPeek(m){
    const p=player(m.player),el=$('chat-peek');
    el.innerHTML=`<i class="player-dot" style="background:${p.color}"></i><b>${escape(p.name)}</b> : ${escape(m.body)}`;el.hidden=false;
    $('chat-fab').classList.remove('ping');void $('chat-fab').offsetWidth;$('chat-fab').classList.add('ping');
    clearTimeout(peekTimer);peekTimer=setTimeout(()=>el.hidden=true,4500);
  }
  try{chatRead=Number(localStorage.getItem('yeti-chat-read'))||0;}catch(_){}
  const chatTime=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
  const chatDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit'});
  async function loadChat(){
    if(chatLoading)return;chatLoading=true;
    try{const r=await request('/api/chat',{after:chatLast});const list=Array.isArray(r.messages)?r.messages:[];
      const known=new Set(chatMsgs.map(m=>m.id));
      const fresh=[];for(const m of list){if(!known.has(Number(m.id))){const n={...m,id:Number(m.id),player:Number(m.player)};chatMsgs.push(n);fresh.push(n);}}
      const others=chatInit?fresh.filter(m=>m.player!==selectedPlayer):[];chatInit=true;
      if(others.length&&!chatOpen)chatPeek(others[others.length-1]);
      chatMsgs=chatMsgs.filter(m=>!m.temp||!list.some(x=>Number(x.player)===m.player&&x.body===m.body));
      chatMsgs.sort((a,b)=>(a.temp?1e15:a.id)-(b.temp?1e15:b.id));chatMsgs=chatMsgs.slice(-150);
      chatLast=Math.max(chatLast,...chatMsgs.filter(m=>!m.temp).map(m=>m.id),0);renderChat();
    }catch(_){}finally{chatLoading=false;}
  }
  // Le chat est vidé à chaque heure pile (côté serveur) : on retire aussi les vieux messages affichés.
  const chatHour=()=>Math.floor(Date.now()/3600000)*3600000;
  let chatHourShown=chatHour();
  function renderChat(){
    chatHourShown=chatHour();chatMsgs=chatMsgs.filter(m=>m.temp||!(Date.parse(m.at)<chatHourShown));
    const list=$('chat-list'),stick=list.scrollHeight-list.scrollTop-list.clientHeight<60,today=dayKey(new Date());
    list.innerHTML=chatMsgs.length?chatMsgs.map(m=>{const p=player(m.player),mine=m.player===selectedPlayer,d=new Date(m.at||Date.now());
      return `<div class="chat-msg ${mine?'mine':''} ${m.temp?'temp':''}"><div class="chat-meta"><i class="player-dot" style="background:${p.color}"></i><b>${escape(p.name)}</b><time>${dayKey(d)===today?'':chatDay.format(d)+' '}${chatTime.format(d)}</time></div><p>${escape(m.body)}</p></div>`;}).join(''):'<p class="chat-empty">Pas encore de message. Lance les hostilités.<br><small>Le chat se vide à chaque heure pile.</small></p>';
    if(stick||chatOpen)list.scrollTop=list.scrollHeight;
    if(chatOpen){chatRead=chatLast;try{localStorage.setItem('yeti-chat-read',String(chatRead));}catch(_){}}
    const unread=chatMsgs.filter(m=>!m.temp&&m.id>chatRead&&m.player!==selectedPlayer).length;
    $('chat-badge').hidden=!unread;$('chat-badge').textContent=unread>9?'9+':String(unread);
    const can=!!selectedPlayer&&!privateAccess;
    $('chat-input').disabled=!can;$('chat-send').disabled=!can;
    $('chat-input').placeholder=can?`Écris en tant que ${player(selectedPlayer).name}…`:'Choisis ton pseudo pour écrire';
  }
  function toggleChat(open){
    chatOpen=open;$('chat-panel').hidden=!open;$('chat-fab').setAttribute('aria-expanded',String(open));$('chat-fab').classList.toggle('open',open);
    if(open){$('chat-peek').hidden=true;renderChat();loadChat();if(!$('chat-input').disabled&&matchMedia('(pointer:fine)').matches)$('chat-input').focus();}
  }
  $('chat-fab').addEventListener('click',()=>toggleChat(!chatOpen));
  $('chat-peek').addEventListener('click',()=>{$('chat-peek').hidden=true;toggleChat(true);});
  $('chat-close').addEventListener('click',()=>toggleChat(false));
  $('chat-form').addEventListener('submit',async e=>{
    e.preventDefault();const input=$('chat-input'),body=input.value.trim();if(!body||!selectedPlayer)return;
    input.value='';const temp={id:Date.now(),temp:true,player:selectedPlayer,body,at:new Date().toISOString()};chatMsgs.push(temp);renderChat();
    try{await request('/api/chat/send',{player:selectedPlayer,body});await loadChat();}
    catch(error){chatMsgs=chatMsgs.filter(m=>m!==temp);renderChat();input.value=body;showToast(error.message||'Message non envoyé.');}
  });
  let chatTicking=false;
  setInterval(async()=>{ // chat ouvert : vérification chaque seconde
    if(!chatOpen||chatTicking||document.hidden||privateAccess)return;chatTicking=true;
    try{const v=await request('/api/version');if(Number(v.chat)>chatLast)await loadChat();}catch(_){}finally{chatTicking=false;}
  },1000);
  setInterval(poll,2000);
  // Qui est en ligne : chaque page ouverte signale son joueur toutes les 5 s (vu il y a moins de 30 s = en ligne).
  let presenceBusy=false;
  async function pingPresence(){
    if(presenceBusy||document.hidden||privateAccess||!lastStateSig)return;presenceBusy=true;
    try{const r=await request('/api/presence',{player:selectedPlayer||0});
      if(r&&Array.isArray(r.online)){const next=new Set(r.online.map(Number));if([...next].join()!==[...online].join()){online=next;renderProfiles();}}}
    catch(_){}finally{presenceBusy=false;}
  }
  setInterval(pingPresence,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pingPresence();});
  setInterval(()=>{if(chatHour()!==chatHourShown)renderChat();},15000);
  renderPlayerOptions();renderProfiles();render();renderSaveStatus();
  (async()=>{
    const fragment=new URLSearchParams(location.hash.slice(1));const code=fragment.get('club');
    if(code){try{await request('/api/unlock',{code});history.replaceState(null,'',location.pathname+location.search);}catch(error){$('access-error').textContent=error.message||'Le lien privé n’est pas reconnu.';}}
    await refresh();await flushScores();renderChat();loadChat();pingPresence();
  })();
})();
