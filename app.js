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
  // Connexion par mot de passe : le joueur mémorisé n'est réactivé qu'après vérification de sa session.
  let pendingPlayer = selectedPlayer, authed = null, bans = {};
  selectedPlayer = null;
  const SESSION = 'yeti-session-v1';
  let memSession = null;
  function getSession(){ try { return JSON.parse(localStorage.getItem(SESSION) || 'null') || memSession; } catch (_) { return memSession; } }
  function setSession(s){ memSession = s; try { if (s) localStorage.setItem(SESSION, JSON.stringify(s)); else localStorage.removeItem(SESSION); } catch (_) {} }
  const hhmm = d => new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(new Date(d)).replace(':','h');
  const banLeft = id => !!bans[id] && Date.parse(bans[id]) > Date.now();
  let dailyResults = [], snapshotIds = new Set(), savedSkins = new Map(), totals = new Map();
  let serverScores = [], connected = false, privateAccess = false, activeRound = null, playerApi = null, loadingGame = false;
  let flushing = null, gameLoaded = false, period = 'all', analysisPlayer = 'all', historyPlayer = 'all', historyLimit = 30, toastTimer, lastSaveError = '';

  function persist() {
    try { localStorage.setItem(STORAGE, JSON.stringify({player:selectedPlayer??pendingPlayer,outbox})); storageAvailable = true; }
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
      if(p.banned_until)bans[id]=p.banned_until;else if(p.banned_until===null)delete bans[id];
      return {id,name:name.slice(0,24),color,locked:!!p.locked,admin:!!p.admin};
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
  // Le serveur ne garde que le top 10 de chacun + Battle royale et duels : les lancers vus depuis l'ouverture
  // de la page restent en mémoire (défis de skins, malédictions, bandeau d'actus) jusqu'au prochain rechargement.
  const sessionSeen=new Map();let flushedSince=new Set();
  function remember(list){for(const s of list)sessionSeen.set(s.id,s);if(sessionSeen.size>400){const old=[...sessionSeen.values()].sort((a,b)=>Date.parse(a.played_at)-Date.parse(b.played_at)).slice(0,sessionSeen.size-400);old.forEach(s=>sessionSeen.delete(s.id));}}
  function allScores() { const map=new Map(sessionSeen);serverScores.forEach(s=>map.set(s.id,s));outbox.forEach(s=>map.set(s.id,s));return [...map.values()]; }
  // Lancers pas encore comptés dans les compteurs du serveur (en attente ou envoyés depuis le dernier rafraîchissement).
  const notCounted=s=>flushedSince.has(s.id)||outbox.some(o=>o.id===s.id);

  const dayCache=new Map();
  function dayKey(date) {
    const k=typeof date==='string'?date:null;if(k&&dayCache.has(k))return dayCache.get(k);
    const parts=dayFormatter.formatToParts(new Date(date)),v=['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
    if(k){if(dayCache.size>5000)dayCache.clear();dayCache.set(k,v);}return v;
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
    const on=p=>banLeft(p.id)?'<span class="ban-mark" aria-hidden="true">⛔</span>':online.has(p.id)?'<span class="online-dot" aria-hidden="true"></span>':'',onTitle=p=>banLeft(p.id)?` title="${escape(p.name)} est banni jusqu’à ${hhmm(bans[p.id])}"`:online.has(p.id)?` title="${escape(p.name)} est en ligne"`:'';
    $('profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''} ${banLeft(p.id)?'is-banned':''} ${selectedPlayer===p.id?'active':''}" data-player="${p.id}" type="button" aria-pressed="${selectedPlayer===p.id}"${onTitle(p)} ${busy}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    $('cover-profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''} ${banLeft(p.id)?'is-banned':''}" data-player="${p.id}" type="button"${onTitle(p)}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    const me=authed&&selectedPlayer===authed?player(authed):null;$('admin-open').hidden=!(me&&me.admin);
    const label=document.querySelector('.player-label');if(label)label.innerHTML='Je joue avec'+(online.size?` <span class="online-count" title="${escape(PLAYERS.filter(p=>online.has(p.id)).map(p=>p.name).join(', '))}"><i></i>${online.size} en ligne</span>`:'');
    $('round-tag').textContent=activeRound?'Lancer en cours…':modeLabel();
    $('round-tag').classList.toggle('mode-on',playMode.kind!=='free');
    if(typeof renderModeBanner==='function')renderModeBanner();
    $('restart-game').disabled=!gameLoaded||!!activeRound||loadingGame;
    if(typeof renderSkins==='function')renderSkins();
  }
  async function choosePlayer(id, trusted) {
    if(activeRound||loadingGame||privateAccess)return;
    if(banLeft(id)){showToast(`⛔ ${player(id).name} est banni jusqu’à ${hhmm(bans[id])}.`);return;}
    if(!trusted&&authed!==id){const ok=await askPassword(id);if(!ok)return;}
    authed=id;selectedPlayer=id;topPlayer=id;playMode={kind:'free'};persist();renderTop();if(typeof syncPush==='function')syncPush(false);online.add(id);renderProfiles();renderCompet();pingPresence();
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
      const skinId=skinFor(selectedPlayer),podium=podiumOf(selectedPlayer),trail=trailFor(selectedPlayer),key=skinId+'|'+(podium||'')+'|'+trail;let data=null;
      try{data=window.YetiSkins?await window.YetiSkins.build(skinId,podium):null;}catch(_){data=null;showToast('Le skin n’a pas pu être appliqué, jeu d’origine chargé.');}
      const tr=TRAILS.find(t=>t.id===trail);
      await playerApi.load({...(data?{data}:{url:'game.swf?v=3'}),parameters:{yetiTrail:tr?tr.cfg:'none'},autoplay:'on',quality:'medium',backgroundColor:'#c9e8f7',allowScriptAccess:false,allowNetworking:'none',openUrlMode:'deny',splashScreen:false,contextMenu:'off',warnOnUnsupportedContent:false});
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
      const sig=JSON.stringify([data.players,data.scores.map(s=>s.id).join(),data.duels||[],data.daily||[]]);const same=sig===lastStateSig;lastStateSig=sig;
      serverScores=data.scores.map(s=>({...s,player:Number(s.player),score:Number(s.score)})).filter(validScore);
      snapshotIds=new Set(serverScores.map(s=>s.id));flushedSince=new Set();remember(serverScores);
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
          batch.filter(s=>accepted.has(s.id)).forEach(s=>{flushedSince.add(s.id);remember([s]);if(!serverScores.some(r=>r.id===s.id))serverScores.push(s);});
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
      return `<div class="ranking-row ${rank===1&&p.best!==null?'leader':''}"><span class="rank-number">${p.count?String(rank).padStart(2,'0'):'—'}</span>${avatar(p)}<div><div class="ranking-name"><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</div><div class="ranking-sub">${p.count?(period==='all'?`${(totals.get(p.id)||0)+allScores().filter(s=>s.player===p.id&&notCounted(s)).length||p.count} lancers · moy. top 10 ${oneDecimal.format(topOf(p.id).reduce((a,s)=>a+s.score,0)/Math.max(1,topOf(p.id).length))} m`:`${p.count} lancer${p.count>1?'s':''} · moy. ${oneDecimal.format(p.average)} m`):'Le sommet attend'}</div></div><div class="ranking-score">${p.best===null?'—':number.format(p.best)}<small>mètres</small></div></div>`;
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
  const skinMemo=new Map();
  function skinState(id){
    if(!window.YetiSkins||!id)return null;
    const mine=allScores().filter(s=>s.player===id),total=(totals.get(id)||0)+mine.filter(notCounted).length,saved=savedSkins.get(id)||[];
    const key=mine.length+'|'+mine.reduce((a,s)=>a+s.score,0)+'|'+(mine.length?mine[mine.length-1].id:'')+'|'+total+'|'+saved.length+'|'+player(id).name;
    const hit=skinMemo.get(id);if(hit&&hit.key===key)return hit.st;
    const st=window.YetiSkins.evaluate(mine,player(id).name,{total,saved});skinMemo.set(id,{key,st});return st;
  }
  // Les skins débloqués sont enregistrés sur le serveur : la purge de l'historique ne les fait jamais perdre.
  const skinsSending=new Set();
  function saveSkins(){
    if(!window.YetiSkins||!snapshotIds.size)return; // attendre l'état du serveur
    for(const p of PLAYERS){
      const st=skinState(p.id);if(!st)continue;
      const saved=new Set(savedSkins.get(p.id)||[]);
      const fresh=[...st.unlocked].filter(id=>!saved.has(id)&&/^[a-z0-9]{2,20}$/.test(id)&&['record','defi','ultra'].includes(window.YetiSkins.byId(id).kind));
      for(const id of trailState(p.id).unlocked)if(!saved.has(id)&&!fresh.includes(id))fresh.push(id);
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
  function gameKey(id){return skinFor(id)+'|'+(podiumOf(id)||'')+'|'+trailFor(id);}
  // ---------- Traînées derrière le pingouin (débloquées en duel 1v1 et en Battle royale) ----------
  // cfg est lu par le jeu (game.swf) : c = couleurs (de la queue vers le pingouin), w = épaisseur, n = longueur,
  // a = opacité, s = étincelles par image, y = couleurs qui défilent.
  const TRAILS=[
    {id:'trsmoke',kind:'duel',need:1,emoji:'💨',name:'Fumée',cfg:'c=8d969b.c9d0d3.ffffff;w=13;n=16;a=60;s=0;y=0'},
    {id:'trbubble',kind:'duel',need:3,emoji:'🫧',name:'Bulles',cfg:'c=6ec8ff.b8e8ff.ffffff;w=8;n=18;a=70;s=3;y=0'},
    {id:'trfire',kind:'duel',need:5,emoji:'🔥',name:'Flammes',cfg:'c=c81e00.ff5a00.ff9d00.ffe14d;w=15;n=18;a=92;s=1;y=0'},
    {id:'trvolt',kind:'duel',need:10,emoji:'⚡',name:'Électrique',cfg:'c=00e5ff.ffffff.7c4dff;w=7;n=22;a=95;s=2;y=1'},
    {id:'trtoxic',kind:'duel',need:20,emoji:'☢️',name:'Toxique',cfg:'c=1faa00.3aff00.c6ff00;w=13;n=20;a=88;s=2;y=1'},
    {id:'trrainbow',kind:'duel',need:35,emoji:'🌈',name:'Arc-en-ciel',cfg:'c=ff2a2a.ff8a00.ffe600.33dd00.00aaff.8a2be2;w=13;n=26;a=95;s=3;y=1'},
    {id:'trconfetti',kind:'podium',need:1,emoji:'🎊',name:'Confettis',cfg:'c=ff4fa3.ffd400.30d5c8.7c4dff.ff6a00;w=7;n=18;a=95;s=4;y=1'},
    {id:'trbronze',kind:'podium',need:3,emoji:'🥉',name:'Bronze',cfg:'c=6b3e14.cd7f32.f3b67c;w=12;n=20;a=92;s=1;y=0'},
    {id:'trgold',kind:'win',need:1,emoji:'🥇',name:'Or',cfg:'c=a87400.ffd700.fff6a8;w=13;n=22;a=95;s=3;y=0'},
    {id:'trsilver',kind:'podium',need:6,emoji:'🥈',name:'Argent',cfg:'c=6f767d.c0c7ce.ffffff;w=12;n=22;a=92;s=2;y=0'},
    {id:'trcomet',kind:'win',need:3,emoji:'☄️',name:'Comète',cfg:'c=1e3cff.6fb6ff.ffffff;w=17;n=30;a=90;s=4;y=0'},
    {id:'trneon',kind:'podium',need:10,emoji:'💖',name:'Néon',cfg:'c=ff00c8.ff6bf0.ffffff;w=9;n=24;a=100;s=1;y=0'},
    {id:'trgalaxy',kind:'win',need:7,emoji:'🌌',name:'Galaxie',cfg:'c=2b0057.7c4dff.ff6bf0.ffffff;w=15;n=28;a=95;s=5;y=1'},
    // Ultra rares : il faut être un monstre.
    {id:'trplasma',ultra:true,kind:'duel',need:50,emoji:'🔮',name:'Plasma',cfg:'c=ff00e6.7a00ff.00f0ff.ffffff;w=20;n=34;a=100;s=6;y=1'},
    {id:'trinvinc',ultra:true,kind:'dstreak',need:10,emoji:'🛡️',name:'L’invincible',cfg:'c=ffffff.fff6a8.ffd700.ffffff;w=22;n=36;a=100;s=7;y=1'},
    {id:'traurora',ultra:true,kind:'podium',need:25,emoji:'🌠',name:'Aurore boréale',cfg:'c=00ff9c.00d4ff.7c4dff.ff6bf0.00ff9c;w=24;n=40;a=80;s=4;y=1'},
    {id:'trnova',ultra:true,kind:'win',need:15,emoji:'💥',name:'Supernova',cfg:'c=ffffff.fff36b.ff9d00.ff2a00.7a0000;w=26;n=34;a=100;s=8;y=1'},
    {id:'trreign',ultra:true,kind:'bstreak',need:5,emoji:'👑',name:'Le règne',cfg:'c=4b0082.ffd700.ffffff.ffd700.4b0082;w=20;n=38;a=100;s=6;y=1'},
    {id:'trdragon',ultra:true,kind:'duel',need:100,emoji:'🐉',name:'Souffle du dragon',cfg:'c=3a0000.c81e00.ff5a00.ffd000.ffffff;w=28;n=42;a=100;s=8;y=1'},
    {id:'trhole',ultra:true,kind:'win',need:30,emoji:'🕳️',name:'Trou noir',cfg:'c=000000.2b0057.000000.7c4dff.000000;w=30;n=44;a=100;s=5;y=1'},
    {id:'trdivine',ultra:true,kind:'combo',need:1,emoji:'😇',name:'Le divin',cfg:'c=ffffff.fffbe0.ffe9a8.ffffff.d8f6ff;w=30;n=48;a=100;s=10;y=1'},
  ];
  // Le divin : 50 duels gagnés ET 20 victoires en Battle royale.
  const trailHave=(t,c)=>t.kind==='duel'?c.duelWins:t.kind==='win'?c.wins:t.kind==='dstreak'?c.duelStreak:t.kind==='bstreak'?c.winStreak:t.kind==='combo'?(c.duelWins>=50&&c.wins>=20?1:0):c.podiums;
  const trailCols=t=>t.cfg.split(';')[0].slice(2).split('.').map(c=>'#'+c);
  const trailCond=t=>t.kind==='combo'?'50 duels gagnés + 20 victoires en Battle royale':t.kind==='dstreak'?`${t.need} duels gagnés d’affilée`:t.kind==='bstreak'?`${t.need} jours d’affilée 1er en Battle royale`:t.kind==='duel'?`${t.need} duel${t.need>1?'s':''} 1v1 gagné${t.need>1?'s':''}`:t.kind==='win'?`${t.need} victoire${t.need>1?'s':''} en Battle royale`:`${t.need} podium${t.need>1?'s':''} en Battle royale`;
  let trailChoices={};try{trailChoices=JSON.parse(localStorage.getItem('yeti-trails')||'{}')||{};}catch(_){}
  // Duels gagnés et podiums de Battle royale (journées terminées seulement : un podium du jour peut encore changer).
  function compStats(pid){
    let duelWins=0,podiums=0,wins=0,duelStreak=0,winStreak=0;
    try{
      let run=0;
      for(const d of [...duels].sort((a,b)=>a.id-b.id)){if(d.challenger!==pid&&d.opponent!==pid)continue;const st=duelState(d);if(!st.done)continue;if(st.winner===pid){duelWins++;run++;duelStreak=Math.max(duelStreak,run);}else run=0;}
      const today=dayKey(new Date());let prev=null;run=0;
      for(const day of [...new Set(dailyResults.map(r=>r.day))].sort()){if(day>=today)continue;const i=dayRanking(day).filter(r=>r.n>=DAILY_N).findIndex(r=>r.p.id===pid);
        if(i>=0&&i<3){podiums++;if(i===0)wins++;}
        if(i===0){run=prev&&shiftDay(prev,1)===day?run+1:1;winStreak=Math.max(winStreak,run);prev=day;}else{run=0;prev=null;}}
    }catch(_){}
    return {duelWins,podiums,wins,duelStreak,winStreak};
  }
  function trailState(pid){
    const c=compStats(pid),saved=new Set(savedSkins.get(pid)||[]),unlocked=new Set();
    for(const t of TRAILS){if(trailHave(t,c)>=t.need||saved.has(t.id))unlocked.add(t.id);}
    return {...c,unlocked};
  }
  function trailFor(id){if(!id)return 'none';const ch=trailChoices[id];return ch&&ch!=='none'&&trailState(id).unlocked.has(ch)?ch:'none';}
  function trailCards(){
    if(!selectedPlayer)return '';
    const st=trailState(selectedPlayer),cur=trailFor(selectedPlayer),busy=activeRound||loadingGame;
    const none=`<button type="button" class="skin-card trail-card ${cur==='none'?'active':''}" data-trail="none" ${busy?'disabled':''} aria-pressed="${cur==='none'}"><span class="trail-preview none"></span><span class="skin-name">Aucune</span><span class="skin-min">${cur==='none'?'✓ Équipé':'Sans traînée'}</span></button>`;
    const card=t=>{const open=st.unlocked.has(t.id),active=t.id===cur,have=trailHave(t,st);
      const sub=open?(active?'✓ Équipé · ':'✓ ')+trailCond(t):`🔒 ${trailCond(t)} (${t.kind==='combo'?`${Math.min(st.duelWins,50)}/50 · ${Math.min(st.wins,20)}/20`:`${Math.min(have,t.need)}/${t.need}`})`;
      return `<button type="button" class="skin-card trail-card ${t.ultra?'kind-ultra':'kind-'+t.kind} ${active?'active':''} ${open?'':'locked'}" data-trail="${t.id}" ${open&&!busy?'':'disabled'} aria-pressed="${active}" title="${escape(t.name+' — '+trailCond(t))}"><span class="trail-preview" style="--tg:linear-gradient(90deg,transparent,${trailCols(t).join(',')})"><i>${t.emoji}</i></span><span class="skin-name">${escape(t.name)}</span><span class="skin-min">${escape(sub)}</span></button>`;};
    const cards=TRAILS.filter(t=>!t.ultra).map(card).join(''),ultra=TRAILS.filter(t=>t.ultra).map(card).join('');
    return `<div class="skin-group trail-group"><span class="skin-group-label">Traînées · ${st.duelWins} duel${st.duelWins>1?'s':''} gagné${st.duelWins>1?'s':''} · ${st.podiums} podium${st.podiums>1?'s':''} BR (${st.wins} 🥇)</span><div class="skin-group-cards">${none}${cards}</div></div>`
      +`<div class="skin-group trail-group"><span class="skin-group-label">Traînées ultra rares 💎 · meilleure série : ${st.duelStreak} duel${st.duelStreak>1?'s':''} · ${st.winStreak} jour${st.winStreak>1?'s':''} 1er</span><div class="skin-group-cards">${ultra}</div></div>`;
  }
  async function chooseTrail(id){
    if(!selectedPlayer||activeRound||loadingGame)return;
    if(id!=='none'&&!trailState(selectedPlayer).unlocked.has(id))return;
    trailChoices[selectedPlayer]=id;try{localStorage.setItem('yeti-trails',JSON.stringify(trailChoices));}catch(_){}
    renderSkins();
    if(gameLoaded&&loadedSkin!==gameKey(selectedPlayer)){await loadGame();const t=TRAILS.find(x=>x.id===id);showToast(t?`${t.ultra?'💎 ':''}${t.emoji} Traînée ${t.name} équipée : lance le pingouin pour la voir !`:'Traînée retirée.');}
  }
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
    }).join('')+trailCards();
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
  const unsynced=ok=>allScores().filter(s=>notCounted(s)&&ok(s));
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
  // ---------- Top 10 de chaque joueur ----------
  let topPlayer=null;
  function topOf(id){return allScores().filter(s=>s.player===id).sort((a,b)=>b.score-a.score||Date.parse(a.played_at)-Date.parse(b.played_at)).slice(0,10);}
  const topDate=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'2-digit'});
  function renderTop(){
    const box=$('top-list');if(!box)return;
    if(!PLAYERS.some(p=>p.id===topPlayer))topPlayer=selectedPlayer||PLAYERS[0]?.id||null;
    $('top-tabs').innerHTML=PLAYERS.map(p=>`<button type="button" class="top-tab ${p.id===topPlayer?'active':''}" data-top="${p.id}" role="tab" aria-selected="${p.id===topPlayer}"><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</button>`).join('');
    const list=topPlayer?topOf(topPlayer):[];
    if(topPlayer){const n=(totals.get(topPlayer)||0)+allScores().filter(s=>s.player===topPlayer&&notCounted(s)).length;$('top-sub').textContent=`${player(topPlayer).name} · ${n} lancer${n>1?'s':''} au total · seuls les 10 meilleurs sont gardés (Battle royale et duels compris).`;}
    const html=list.length?list.map((s,i)=>`<li class="top-row ${i<3?'podium':''}"><span class="top-rank">${['🥇','🥈','🥉'][i]||String(i+1).padStart(2,'0')}</span><b class="top-score">${number.format(s.score)} <small>m</small></b><span class="top-tag">${s.mode==='daily'?'🏟️ Battle royale':s.mode==='duel'?'⚔️ Duel':''}</span><time>${topDate.format(new Date(s.played_at))}</time></li>`).join(''):'<li class="top-empty">Aucun lancer pour l’instant.</li>';
    if(box._html!==html){box.innerHTML=html;box._html=html;}
  }
  $('top-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-top]');if(!b)return;topPlayer=Number(b.dataset.top);renderTop();});
  function render() { const scores=filteredScores();renderTop();renderLeaderboard(scores);renderMetrics(scores);renderTrend(scores);renderHistory(scores);renderTicker();announceNewScores();renderSkins();renderCompet(); }

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
  $('skins').addEventListener('click',e=>{const t=e.target.closest('[data-trail]');if(t&&!t.disabled){chooseTrail(t.dataset.trail);return;}const b=e.target.closest('[data-skin]');if(b&&!b.disabled)chooseSkin(b.dataset.skin);});
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
    el.innerHTML=`<i class="player-dot" style="background:${p.color}"></i><b>${escape(p.name)}</b> : ${mentionsMe(m)?'🔔 ':''}${escape(plainBody(m.body))}`;el.hidden=false;
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
      const tag=others.filter(mentionsMe).pop();
      if(tag){showToast(`🔔 ${player(tag.player).name} t’a tagué : ${plainBody(tag.body).slice(0,80)}`);try{navigator.vibrate&&navigator.vibrate([80,60,80]);}catch(_){}}
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
      const media=mediaOf(m.body);
      return `<div class="chat-msg ${mine?'mine':''} ${m.temp?'temp':''} ${media?'media':''} ${!mine&&mentionsMe(m)?'tagged':''}"><div class="chat-meta"><i class="player-dot" style="background:${p.color}"></i><b>${escape(p.name)}</b><time>${dayKey(d)===today?'':chatDay.format(d)+' '}${chatTime.format(d)}</time></div>${media||`<p>${richBody(m.body)}</p>`}</div>`;}).join(''):'<p class="chat-empty">Pas encore de message. Lance les hostilités.<br><small>Le chat se vide à chaque heure pile.</small></p>';
    if(stick||chatOpen)list.scrollTop=list.scrollHeight;
    if(chatOpen){chatRead=chatLast;try{localStorage.setItem('yeti-chat-read',String(chatRead));}catch(_){}}
    const unread=chatMsgs.filter(m=>!m.temp&&m.id>chatRead&&m.player!==selectedPlayer).length;
    $('chat-badge').hidden=!unread;$('chat-badge').textContent=unread>9?'9+':String(unread);
    const can=!!selectedPlayer&&!privateAccess;
    $('chat-input').disabled=!can;$('chat-send').disabled=!can;$('chat-pick').disabled=!can;if(!can)closePicker();
    $('chat-input').placeholder=can?`Écris en tant que ${player(selectedPlayer).name}…`:'Choisis ton pseudo pour écrire';
  }
  function toggleChat(open){
    chatOpen=open;$('chat-panel').hidden=!open;if(typeof applyWide==='function')applyWide();if(!open){closePicker();closeMention();}$('chat-fab').setAttribute('aria-expanded',String(open));$('chat-fab').classList.toggle('open',open);
    if(open){$('chat-peek').hidden=true;renderChat();loadChat();if(!$('chat-input').disabled&&matchMedia('(pointer:fine)').matches)$('chat-input').focus();}
  }
  $('chat-fab').addEventListener('click',()=>toggleChat(!chatOpen));
  $('chat-peek').addEventListener('click',()=>{$('chat-peek').hidden=true;toggleChat(true);});
  $('chat-close').addEventListener('click',()=>toggleChat(false));
  $('chat-form').addEventListener('submit',async e=>{
    e.preventDefault();const input=$('chat-input'),body=input.value.trim();if(!body||!selectedPlayer)return;
    input.value='';closeMention();sendChat(body);
  });
  async function sendChat(body){
    const input=$('chat-input');if(!selectedPlayer)return;
    const temp={id:Date.now(),temp:true,player:selectedPlayer,body,at:new Date().toISOString()};chatMsgs.push(temp);renderChat();
    try{await request('/api/chat/send',{player:selectedPlayer,body});await loadChat();}
    catch(error){chatMsgs=chatMsgs.filter(m=>m!==temp);renderChat();if(!mediaOf(body))input.value=body;showToast(error.message||'Message non envoyé.');}
  }
  // ---------- @tags, GIF et stickers ----------
  const GIFS=['1f602','1f923','1f62d','1f525','1f480','1f921','1f973','1f60e','1f92f','1f631','1f97a','1f644','1f62c','1f914','1f44f','1f4af','1f389','1f4a9','1f976','1f975','1f92a','1f634','1f621','1f618','1f60d','1f440','1f44b','1f64f','1f4aa','1f92e','1f47b','1f680','1f3c6','1f427','1f9ad','2744_fe0f','1f37b','1f60f','1f971','1f910','1f92b','1f608','1f4a5','1f198','1f947','1f622','1f633','1f929'];
  const STICKERS=['🦭','🐧','❄️','🏔️','🥶','🏆','🥇','👑','🐐','🔥','💀','🤡','💩','😂','🤣','😭','😎','🤯','😤','🙄','🫡','👀','💪','🎯','🍺','🥳','🎉','❤️','👍','👎','🤌','🙏','😱','🤫','🫠','🧊','⛷️','💸','🚀','🧠'];
  const gifUrl=c=>`https://fonts.gstatic.com/s/e/notoemoji/latest/${c}/512.webp`;
  function mediaOf(body){
    let m=/^\[g:([0-9a-f_]{2,24})\]$/.exec(body||'');if(m&&GIFS.includes(m[1]))return `<img class="chat-gif" src="${gifUrl(m[1])}" alt="GIF" loading="lazy" width="120" height="120">`;
    m=/^\[s:(.{1,12})\]$/u.exec(body||'');if(m&&STICKERS.includes(m[1]))return `<span class="chat-sticker" role="img" aria-label="sticker">${m[1]}</span>`;
    return '';
  }
  function plainBody(body){if(/^\[g:/.test(body||''))return 'a envoyé un GIF';const m=/^\[s:(.{1,12})\]$/u.exec(body||'');return m?m[1]:String(body||'');}
  const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function mentionRe(){const names=PLAYERS.map(p=>p.name).sort((a,b)=>b.length-a.length).map(reEsc);return names.length?new RegExp('@('+names.join('|')+')(?![\\p{L}\\p{N}_])','giu'):null;}
  function mentionsMe(m){if(!selectedPlayer||m.player===selectedPlayer)return false;const me=player(selectedPlayer).name.toLocaleLowerCase('fr');const re=mentionRe();if(!re)return false;for(const x of String(m.body||'').matchAll(re))if(x[1].toLocaleLowerCase('fr')===me)return true;return /@(tous|all|everyone)(?![\p{L}\p{N}_])/iu.test(m.body||'');}
  function richBody(body){
    const re=mentionRe(),me=selectedPlayer?player(selectedPlayer).name.toLocaleLowerCase('fr'):'';let out='',last=0;const text=String(body||'');
    const esc=t=>escape(t).replace(/@(tous|all|everyone)(?![\p{L}\p{N}_])/giu,'<span class="mention me">@$1</span>');
    if(re)for(const x of text.matchAll(re)){out+=esc(text.slice(last,x.index));const isMe=x[1].toLocaleLowerCase('fr')===me;const p=PLAYERS.find(q=>q.name.toLocaleLowerCase('fr')===x[1].toLocaleLowerCase('fr'));out+=`<span class="mention ${isMe?'me':''}" style="--mc:${p?p.color:'#1b4e3b'}">@${escape(p?p.name:x[1])}</span>`;last=x.index+x[0].length;}
    return out+esc(text.slice(last));
  }
  // Suggestions quand on tape @
  let mentionSel=0,mentionItems=[];
  function mentionQuery(){const i=$('chat-input'),pos=i.selectionStart??i.value.length,before=i.value.slice(0,pos);const m=/(^|\s)@([\p{L}\p{N}_-]{0,24})$/u.exec(before);return m?{q:m[2],start:pos-m[2].length-1,pos}:null;}
  function closeMention(){$('chat-mention').hidden=true;mentionItems=[];}
  function renderMention(){
    const q=mentionQuery();if(!q){closeMention();return;}
    const n=q.q.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    mentionItems=[...PLAYERS.filter(p=>p.id!==selectedPlayer&&p.name.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').startsWith(n)),...('tous'.startsWith(n)?[{id:0,name:'tous',color:'#f08b50'}]:[])].slice(0,8);
    if(!mentionItems.length){closeMention();return;}
    mentionSel=Math.min(mentionSel,mentionItems.length-1);
    $('chat-mention').innerHTML=mentionItems.map((p,i)=>`<button type="button" role="option" aria-selected="${i===mentionSel}" class="${i===mentionSel?'on':''}" data-mention="${i}">${p.id?avatar(p):'<span class="ranking-avatar ranking-avatar-empty" style="--ring:#f08b50">📣</span>'}<span>@${escape(p.name)}</span>${online.has(p.id)?'<i class="online-mini"></i>':''}</button>`).join('');
    $('chat-mention').hidden=false;
  }
  function pickMention(i){
    const p=mentionItems[i],q=mentionQuery();if(!p||!q)return;const input=$('chat-input');
    const ins='@'+p.name+' ';input.value=input.value.slice(0,q.start)+ins+input.value.slice(q.pos);
    const c=q.start+ins.length;input.focus();input.setSelectionRange(c,c);closeMention();
  }
  $('chat-input').addEventListener('input',()=>{mentionSel=0;renderMention();});
  $('chat-input').addEventListener('click',renderMention);
  $('chat-input').addEventListener('keydown',e=>{
    if($('chat-mention').hidden)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();mentionSel=(mentionSel+(e.key==='ArrowDown'?1:-1)+mentionItems.length)%mentionItems.length;renderMention();}
    else if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();pickMention(mentionSel);}
    else if(e.key==='Escape'){e.preventDefault();closeMention();}
  });
  $('chat-mention').addEventListener('mousedown',e=>e.preventDefault());
  $('chat-mention').addEventListener('click',e=>{const b=e.target.closest('[data-mention]');if(b)pickMention(Number(b.dataset.mention));});
  $('chat-input').addEventListener('blur',()=>setTimeout(closeMention,150));
  // Sélecteur GIF / stickers
  let pickTab='gif';
  function renderPicker(){
    document.querySelectorAll('[data-pick-tab]').forEach(b=>b.classList.toggle('active',b.dataset.pickTab===pickTab));
    $('chat-picker-grid').className='chat-picker-grid '+pickTab;
    $('chat-picker-grid').innerHTML=pickTab==='gif'?GIFS.map(c=>`<button type="button" data-send="[g:${c}]"><img src="${gifUrl(c)}" alt="" loading="lazy" width="56" height="56"></button>`).join(''):STICKERS.map(s=>`<button type="button" data-send="[s:${s}]">${s}</button>`).join('');
  }
  function closePicker(){$('chat-picker').hidden=true;$('chat-pick').setAttribute('aria-expanded','false');}
  $('chat-pick').addEventListener('click',()=>{const open=$('chat-picker').hidden;if(open){renderPicker();$('chat-picker').hidden=false;$('chat-pick').setAttribute('aria-expanded','true');}else closePicker();});
  document.querySelectorAll('[data-pick-tab]').forEach(b=>b.addEventListener('click',()=>{pickTab=b.dataset.pickTab;renderPicker();}));
  $('chat-picker-grid').addEventListener('click',e=>{const b=e.target.closest('[data-send]');if(!b)return;closePicker();sendChat(b.dataset.send);});
  // Chat agrandi : moitié de l'écran (à droite sur ordi, en bas sur téléphone), le jeu reste visible.
  let chatWide=false;try{chatWide=localStorage.getItem('yeti-chat-wide')==='1';}catch(_){}
  function applyWide(){
    const on=chatWide&&chatOpen;document.body.classList.toggle('chat-wide',on);
    $('chat-wide').textContent=chatWide?'⤡':'⤢';$('chat-wide').setAttribute('aria-label',chatWide?'Réduire le chat':'Agrandir le chat');$('chat-wide').title=chatWide?'Réduire le chat':'Agrandir le chat (moitié d’écran)';
    if(on)setTimeout(()=>{$('game-stage').scrollIntoView({behavior:'smooth',block:'start'});const l=$('chat-list');l.scrollTop=l.scrollHeight;},60);
  }
  $('chat-wide').addEventListener('click',()=>{chatWide=!chatWide;try{localStorage.setItem('yeti-chat-wide',chatWide?'1':'0');}catch(_){}applyWide();});
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
      if(r&&r.bans&&typeof r.bans==='object'){const key=JSON.stringify(r.bans);if(key!==JSON.stringify(bans)){bans=r.bans;renderProfiles();if(!$('admin-overlay').hidden)renderAdmin();}}
      if(selectedPlayer&&banLeft(selectedPlayer))kick(selectedPlayer);
      if(r&&Array.isArray(r.online)){const next=new Set(r.online.map(Number));if([...next].join()!==[...online].join()){online=next;renderProfiles();}}}
    catch(_){}finally{presenceBusy=false;}
  }
  setInterval(pingPresence,5000);
  // ---------- Appli installable + notifications push ----------
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isAndroid=/android/i.test(navigator.userAgent);
  const pushOK=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  let swReg=null,installPrompt=null,pushKey='',pushOn=false;
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then(r=>{swReg=r;syncPush(false);}).catch(()=>{});
    navigator.serviceWorker.addEventListener('message',e=>{if(e.data&&e.data.type==='yeti-open')openFromUrl(e.data.url,false);});
  }
  // Notification touchée : ouvre le chat ou le Top 10.
  function openFromUrl(url,clean){
    let what='';try{what=new URL(url,location.href).searchParams.get('open')||'';}catch(_){}
    if(clean&&what){const u=new URL(location.href);u.searchParams.delete('open');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}
    if(what==='chat')toggleChat(true);
    if(what==='top'){const c=document.querySelector('.top-card');if(c)c.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;renderAppButtons();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;renderAppButtons();showToast('📲 Appli installée ! Ouvre-la depuis ton écran d’accueil.');});
  function renderAppButtons(){
    const inst=$('install-app'),nb=$('notif-btn');
    inst.hidden=isStandalone()||!(installPrompt||isIOS||isAndroid);
    const logged=!!authed&&authed===selectedPlayer;
    if(!logged){nb.hidden=true;return;}
    if(!pushOK()){nb.hidden=!(isIOS&&!isStandalone());nb.textContent='🔔 Notifs';nb.className='app-button';return;}
    nb.hidden=false;
    const perm=Notification.permission;
    nb.textContent=perm==='denied'?'🔕 Notifs bloquées':pushOn?'🔔 Notifs activées':'🔔 Activer les notifs';
    nb.className='app-button'+(pushOn?' on':perm==='denied'?' off':'');
  }
  function b64u(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
  async function syncPush(ask){
    try{
      if(!swReg||!pushOK()||!authed||authed!==selectedPlayer){renderAppButtons();return false;}
      if(Notification.permission!=='granted'){
        if(!ask||Notification.permission==='denied'){pushOn=false;renderAppButtons();return false;}
        const p=await Notification.requestPermission();if(p!=='granted'){pushOn=false;renderAppButtons();return false;}
      }
      let sub=await swReg.pushManager.getSubscription();
      if(!sub)sub=await swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(window.YETI_CONFIG.vapidPublicKey)});
      const s=getSession();if(!s||s.player!==authed){renderAppButtons();return false;}
      const key=sub.endpoint+'|'+authed;
      if(key!==pushKey){await request('/api/push',{player:authed,token:s.token,sub:sub.toJSON()});pushKey=key;}
      pushOn=true;renderAppButtons();return true;
    }catch(error){if(ask)showToast(error.message||'Impossible d’activer les notifications.');pushOn=false;renderAppButtons();return false;}
  }
  function clubCode(){try{const u=new URL(window.YetiData.getInviteUrl());return new URLSearchParams(u.hash.slice(1)).get('club')||'';}catch(_){return '';}}
  function showInstallHelp(forNotifs){
    // Sur iPhone, l'appli a sa propre mémoire : on met le code du club dans l'adresse pour que l'appli s'ouvre directement dans le club.
    const code=clubCode();if(code&&isIOS){const u=new URL(location.href);u.hash=new URLSearchParams({club:code}).toString();history.replaceState(history.state,'',u.href);}
    const steps=isIOS?`<p>${forNotifs?'Sur iPhone, les notifications marchent seulement dans l’appli installée. ':''}Dans <b>Safari</b> :</p><ol><li>Touche le bouton <b>Partager</b> <span aria-hidden="true">⬆️</span> en bas de l’écran.</li><li>Choisis <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b>.</li><li>Ouvre l’appli <b>Yeti rich club</b> depuis ton écran d’accueil, reconnecte-toi avec ton mot de passe, puis touche <b>🔔 Activer les notifs</b>.</li></ol><p class="hint">iOS 16.4 ou plus récent nécessaire pour les notifications.</p>`
      :`<ol><li>Ouvre le menu <b>⋮</b> de ton navigateur (Chrome).</li><li>Choisis <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b>.</li><li>Ouvre l’appli <b>Yeti rich club</b>, puis touche <b>🔔 Activer les notifs</b>.</li></ol>`;
    $('install-steps').innerHTML=steps;$('install-overlay').hidden=false;
  }
  $('install-close').addEventListener('click',()=>{$('install-overlay').hidden=true;});
  $('install-app').addEventListener('click',async()=>{
    if(installPrompt){installPrompt.prompt();try{await installPrompt.userChoice;}catch(_){}installPrompt=null;renderAppButtons();return;}
    showInstallHelp(false);
  });
  $('notif-btn').addEventListener('click',async()=>{
    if(!pushOK()){showInstallHelp(true);return;}
    if(Notification.permission==='denied'){showToast('Notifications bloquées : autorise-les dans les réglages du téléphone / du navigateur pour ce site.');return;}
    if(pushOn){showToast('🔔 Les notifs sont activées : tags dans le chat et entrées dans le top 5 du Hall of Fame.');return;}
    if(await syncPush(true))showToast('🔔 Notifs activées ! Tu seras prévenu quand on te tague ou quand quelqu’un entre dans le top 5.');
  });
  renderAppButtons();
  // ---------- Mot de passe par joueur ----------
  let pinResolve=null;
  function askPassword(id){
    const p=player(id),create=!p.locked,o=$('pin-overlay');
    if(pinResolve){const r=pinResolve;pinResolve=null;r(false);}
    $('pin-eyebrow').textContent=create?'PREMIÈRE CONNEXION':'CONNEXION';
    $('pin-title').textContent=create?`Salut ${p.name} !`:`C’est bien toi, ${p.name} ?`;
    $('pin-text').textContent=create?'Crée ton mot de passe (4 caractères minimum). Il te sera demandé à chaque fois que tu reprends ce prénom depuis la liste des joueurs.':'Entre ton mot de passe pour jouer avec ce prénom.';
    $('pin-confirm-wrap').hidden=!create;$('pin-confirm').required=create;
    $('pin-input').setAttribute('autocomplete',create?'new-password':'current-password');
    $('pin-user').value=p.name;$('pin-input').value='';$('pin-confirm').value='';$('pin-error').textContent='';
    $('pin-submit').textContent=create?'Créer mon mot de passe →':'Entrer →';$('pin-submit').disabled=false;
    o.dataset.player=id;o.dataset.mode=create?'create':'login';o.hidden=false;
    setTimeout(()=>$('pin-input').focus(),50);
    return new Promise(r=>pinResolve=r);
  }
  function closePin(ok){$('pin-overlay').hidden=true;const r=pinResolve;pinResolve=null;if(r)r(ok);}
  $('pin-cancel').addEventListener('click',()=>closePin(false));
  $('pin-form').addEventListener('submit',async e=>{
    e.preventDefault();const o=$('pin-overlay'),id=Number(o.dataset.player),create=o.dataset.mode==='create',pw=$('pin-input').value;
    if(pw.length<4){$('pin-error').textContent='4 caractères minimum.';return;}
    if(create&&pw!==$('pin-confirm').value){$('pin-error').textContent='Les deux mots de passe ne sont pas identiques.';return;}
    $('pin-submit').disabled=true;$('pin-error').textContent='';
    try{
      const r=await request(create?'/api/password':'/api/login',{player:id,password:pw});
      if(!r||!r.ok||!r.token){$('pin-error').textContent='Mauvais mot de passe.';$('pin-input').select();return;}
      setSession({player:id,token:r.token});const p=PLAYERS.find(x=>x.id===id);if(p)p.locked=true;
      closePin(true);if(create)showToast('🔒 Mot de passe créé. Garde-le bien !');
    }catch(error){
      const msg=error.message||'Connexion impossible pour le moment.';
      if(create&&/déjà un mot de passe/.test(msg)){const p=PLAYERS.find(x=>x.id===id);if(p)p.locked=true;const r=pinResolve;pinResolve=null;askPassword(id).then(r);$('pin-error').textContent='Ce prénom a déjà un mot de passe.';return;}
      $('pin-error').textContent=msg;
    }finally{$('pin-submit').disabled=false;}
  });
  // Au chargement : on garde le même joueur sans redemander le mot de passe si sa session est encore valable.
  async function ensureAuth(){
    const id=pendingPlayer;pendingPlayer=null;
    if(!id||!PLAYERS.some(p=>p.id===id)){persist();return;}
    const s=getSession();
    if(s&&s.player===id&&s.token){
      try{const r=await request('/api/session',{player:id,token:s.token});if(r&&r.ok){await choosePlayer(id,true);return;}if(r&&r.banned_until)bans[id]=r.banned_until;}
      catch(error){if(error.code==='unavailable'){await choosePlayer(id,true);return;}}
    }
    setSession(null);
    if(banLeft(id)){persist();showBan(id);return;}
    await choosePlayer(id);persist();
  }
  // ---------- Bans ----------
  function showBan(id){$('ban-text').textContent=`${player(id).name} est banni par l’admin jusqu’à ${hhmm(bans[id])}. Pas de jeu ni de chat d’ici là.`;$('ban-overlay').hidden=false;}
  $('ban-ok').addEventListener('click',()=>{$('ban-overlay').hidden=true;});
  function kick(id){
    activeRound=null;authed=null;selectedPlayer=null;setSession(null);persist();if(typeof renderAppButtons==='function')renderAppButtons();
    if(gameLoaded){$('game-container').replaceChildren();gameLoaded=false;playerApi=null;loadedSkin=null;}
    $('game-cover').hidden=false;renderProfiles();renderCompet();renderChat();showBan(id);
  }
  // ---------- Admin (bannir 1 / 5 / 15 / 60 / 120 min) ----------
  const BAN_TIMES=[1,5,15,60,120];
  function renderAdmin(){
    const list=PLAYERS.filter(p=>p.id!==authed);
    $('admin-list').innerHTML=list.map(p=>{const b=banLeft(p.id);
      return `<div class="admin-row ${b?'banned':''}"><div class="admin-who">${avatar(p)}<span><b>${escape(p.name)}</b><small>${b?`⛔ banni jusqu’à ${hhmm(bans[p.id])}`:online.has(p.id)?'🟢 en ligne':'hors ligne'}</small></span></div><div class="admin-actions">${BAN_TIMES.map(m=>`<button type="button" data-ban="${p.id}" data-min="${m}">${m<60?m+' min':m/60+' h'}</button>`).join('')}${b?`<button type="button" class="unban" data-ban="${p.id}" data-min="0">Débannir</button>`:''}</div></div>`;}).join('')||'<p class="br-empty">Personne à virer.</p>';
  }
  $('admin-open').addEventListener('click',()=>{$('admin-error').textContent='';renderAdmin();$('admin-overlay').hidden=false;});
  $('admin-close').addEventListener('click',()=>{$('admin-overlay').hidden=true;});
  $('admin-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)$('admin-overlay').hidden=true;});
  $('admin-list').addEventListener('click',async e=>{
    const b=e.target.closest('[data-ban]');if(!b)return;const target=Number(b.dataset.ban),minutes=Number(b.dataset.min),s=getSession();
    if(!s||s.player!==authed){$('admin-error').textContent='Reconnecte-toi en tant qu’admin.';return;}
    b.disabled=true;$('admin-error').textContent='';
    try{const r=await request('/api/ban',{admin:authed,token:s.token,target,minutes});
      if(r.banned_until)bans[target]=r.banned_until;else delete bans[target];
      online.delete(target);renderAdmin();renderProfiles();
      showToast(minutes?`⛔ ${player(target).name} est viré pour ${minutes<60?minutes+' min':minutes/60+' h'}.`:`✅ ${player(target).name} est débanni.`);
    }catch(error){$('admin-error').textContent=error.message||'Action impossible.';b.disabled=false;}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pingPresence();});
  setInterval(()=>{if(chatHour()!==chatHourShown)renderChat();},15000);
  renderPlayerOptions();renderProfiles();render();renderSaveStatus();
  (async()=>{
    const fragment=new URLSearchParams(location.hash.slice(1));const code=fragment.get('club');
    if(code){try{await request('/api/unlock',{code});history.replaceState(null,'',location.pathname+location.search);}catch(error){$('access-error').textContent=error.message||'Le lien privé n’est pas reconnu.';}}
    await refresh();await ensureAuth();await flushScores();renderChat();loadChat();pingPresence();openFromUrl(location.href,true);
  })();
})();
