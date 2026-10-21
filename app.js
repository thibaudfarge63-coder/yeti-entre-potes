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
  const banPerm = id => !!bans[id] && new Date(bans[id]).getUTCFullYear() >= 9000;
  const banText = id => banPerm(id) ? 'exclu définitivement' : `banni jusqu’à ${hhmm(bans[id])}`;
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
      return {id,name:name.slice(0,24),color,locked:!!p.locked,admin:!!p.admin,mod:!!(p.mod||p.admin),muted:!!p.muted,chat:p.chat?String(p.chat).slice(0,24):''};
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
    const on=p=>banLeft(p.id)?'<span class="ban-mark" aria-hidden="true">⛔</span>':online.has(p.id)?'<span class="online-dot" aria-hidden="true"></span>':'',onTitle=p=>banLeft(p.id)?` title="${escape(p.name)} est ${banText(p.id)}"`:online.has(p.id)?` title="${escape(p.name)} est en ligne"`:'';
    $('profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''} ${banLeft(p.id)?'is-banned':''} ${selectedPlayer===p.id?'active':''}" data-player="${p.id}" type="button" aria-pressed="${selectedPlayer===p.id}"${onTitle(p)} ${busy}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    $('cover-profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${online.has(p.id)?'is-online':''} ${banLeft(p.id)?'is-banned':''}" data-player="${p.id}" type="button"${onTitle(p)}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}${on(p)}</button>`).join('')+add;
    const me=authed&&selectedPlayer===authed?player(authed):null;$('admin-open').hidden=!(me&&me.admin);$('mod-open').hidden=!(me&&me.mod);$('chat-clear').hidden=!(me&&me.admin);
    const label=document.querySelector('.player-label');if(label)label.innerHTML='Je joue avec'+(online.size?` <span class="online-count" title="${escape(PLAYERS.filter(p=>online.has(p.id)).map(p=>p.name).join(', '))}"><i></i>${online.size} en ligne</span>`:'');
    $('round-tag').textContent=activeRound?'Lancer en cours…':modeLabel();
    $('round-tag').classList.toggle('mode-on',playMode.kind!=='free');
    if(typeof renderModeBanner==='function')renderModeBanner();
    $('restart-game').disabled=!gameLoaded||!!activeRound||loadingGame;
    if(typeof renderSkins==='function')renderSkins();
  }
  async function choosePlayer(id, trusted) {
    if(activeRound||loadingGame||privateAccess)return;
    if(banLeft(id)){showToast(`⛔ ${player(id).name} est ${banText(id)}.`);return;}
    if(!trusted&&authed!==id){const ok=await askPassword(id);if(!ok)return;}
    if(window.YetiGames&&YetiGames.openId&&selectedPlayer!==id)YetiGames.close();
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
      if(gained.length){const g=gained[gained.length-1];msg=(g.kind==='ultra'?'💎 ULTRA RARE débloqué : ':'Nouveau skin : ')+`${g.emoji} ${g.name} !`+(window.YetiCostumes&&YetiCostumes.hasWall(g.id)?` + paroi ${YetiCostumes.wallName(g.id)}`:'')+(gained.length>1?` (+${gained.length-1} autre${gained.length>2?'s':''})`:'')+(msg?' · '+msg:'');}
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
      const skinId=skinFor(selectedPlayer),podium=podiumOf(selectedPlayer),trail=trailFor(selectedPlayer),wall=wallFor(selectedPlayer),key=skinId+'|'+(podium||'')+'|'+trail+'|'+wall;let data=null;
      try{data=window.YetiSkins?await window.YetiSkins.build(skinId,podium,wall==='none'?null:wall):null;}catch(_){data=null;showToast('Le skin n’a pas pu être appliqué, jeu d’origine chargé.');}
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
      if(Array.isArray(data.groups))GROUPS=data.groups.map(g=>({tag:String(g.tag),members:(g.members||[]).map(Number)}));
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
    const slug=p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');const pic={imane:'imany'}[slug]||slug;
    return AVATARS.has(pic)?`<img class="ranking-avatar" src="avatars/${pic}.jpg?v=1" alt="" style="--ring:${p.color}">`:`<span class="ranking-avatar ranking-avatar-empty" style="--ring:${p.color}">${escape(p.name.slice(0,1).toUpperCase())}</span>`;
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
  function gameKey(id){return skinFor(id)+'|'+(podiumOf(id)||'')+'|'+trailFor(id)+'|'+wallFor(id);}
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
    {id:'trsakura',kind:'duel',need:15,emoji:'🌸',name:'Sakura',cfg:'c=ff9ec7.ffc8dd.ffffff;w=10;n=22;a=90;s=3;y=0'},
    {id:'trice',kind:'podium',need:15,emoji:'🧊',name:'Givre',cfg:'c=7cc4ff.c9ecff.ffffff;w=12;n=24;a=88;s=3;y=0'},
    {id:'trsun',kind:'win',need:12,emoji:'☀️',name:'Soleil',cfg:'c=ff6a00.ffb000.ffe600.ffffff;w=16;n=26;a=95;s=4;y=0'},
    {id:'trblade',kind:'dstreak',need:3,emoji:'🗡️',name:'La lame',cfg:'c=4a5568.c0c7ce.ffffff;w=6;n=26;a=100;s=1;y=0'},
    {id:'trstorm',kind:'dstreak',need:5,emoji:'🌪️',name:'Tornade',cfg:'c=3a4250.8a94a0.d8dee6.ffffff;w=16;n=28;a=85;s=3;y=1'},
    {id:'trink',kind:'throws',need:1000,emoji:'🖋️',name:'L’encre',cfg:'c=000000.1b1f4a.2b3a8c;w=12;n=24;a=90;s=0;y=0'},
    {id:'trmatrix',kind:'podium',need:25,emoji:'💚',name:'Matrix',cfg:'c=001a05.00ff5a.d6ffd9;w=9;n=30;a=95;s=2;y=1'},
    {id:'trlava',kind:'duel',need:50,emoji:'🌋',name:'Lave',cfg:'c=2a0000.8b0000.ff3b00.ffb000;w=18;n=30;a=100;s=4;y=1'},
    {id:'trprism',kind:'floor',need:400,emoji:'🔷',name:'Prisme',cfg:'c=00e5ff.7c4dff.ff00c8.ffe600;w=12;n=28;a=95;s=3;y=1'},
    // Ultra rares : il faut être un monstre.
    {id:'trsonic',ultra:true,kind:'best',need:500,emoji:'🚀',name:'Mur du son',cfg:'c=ffffff.00f0ff.7a00ff.ff00e6.ffffff;w=22;n=36;a=100;s=7;y=1'},
    {id:'trorbit',ultra:true,kind:'best',need:530,emoji:'🛰️',name:'Hors orbite',cfg:'c=000000.1e3cff.00f0ff.ffffff.fff36b;w=26;n=40;a=100;s=8;y=1'},
    {id:'trwall',ultra:true,kind:'floor',need:450,emoji:'🧱',name:'La muraille',cfg:'c=00ff9c.00d4ff.7c4dff.ff6bf0.00ff9c;w=24;n=40;a=85;s=5;y=1'},
    {id:'trmarathon',ultra:true,kind:'throws',need:2000,emoji:'🏃',name:'Le marathon',cfg:'c=ffffff.fff36b.ff9d00.ff2a00.7a0000;w=24;n=34;a=100;s=8;y=1'},
    {id:'trreign',ultra:true,kind:'bstreak',need:5,emoji:'👑',name:'Le règne',cfg:'c=4b0082.ffd700.ffffff.ffd700.4b0082;w=20;n=38;a=100;s=6;y=1'},
    {id:'trdragon',ultra:true,kind:'duel',need:100,emoji:'🐉',name:'Souffle du dragon',cfg:'c=3a0000.c81e00.ff5a00.ffd000.ffffff;w=28;n=42;a=100;s=8;y=1'},
    {id:'trhole',ultra:true,kind:'win',need:30,emoji:'🕳️',name:'Trou noir',cfg:'c=000000.2b0057.000000.7c4dff.000000;w=30;n=44;a=100;s=5;y=1'},
    {id:'trreaper',ultra:true,kind:'dstreak',need:10,emoji:'💀',name:'La faucheuse',cfg:'c=000000.2b0057.4a0000.000000.ffffff;w=24;n=40;a=100;s=6;y=1'},
    {id:'trthunder',ultra:true,kind:'bstreak',need:10,emoji:'🌩️',name:'Le tonnerre',cfg:'c=1a1a40.00e5ff.ffffff.fff36b.ffffff;w=22;n=40;a=100;s=9;y=1'},
    {id:'trinfinity',ultra:true,kind:'throws',need:5000,emoji:'♾️',name:'L’infini',cfg:'c=ff2a2a.ff8a00.ffe600.33dd00.00aaff.8a2be2.ff00c8;w=26;n=46;a=100;s=8;y=1'},
    {id:'trdivine',ultra:true,kind:'combo',need:1,emoji:'😇',name:'Le divin',cfg:'c=ffffff.fffbe0.ffe9a8.ffffff.d8f6ff;w=30;n=48;a=100;s=10;y=1'},
  ];
  // Le divin : 50 duels gagnés ET 20 victoires en Battle royale.
  const trailHave=(t,c)=>t.kind==='duel'?c.duelWins:t.kind==='win'?c.wins:t.kind==='dstreak'?c.duelStreak:t.kind==='bstreak'?c.winStreak:t.kind==='combo'?(c.duelWins>=50&&c.wins>=20?1:0):t.kind==='best'?c.best:t.kind==='floor'?c.floor:t.kind==='throws'?c.throws:c.podiums;
  const trailCols=t=>t.cfg.split(';')[0].slice(2).split('.').map(c=>'#'+c);
  const trailCond=t=>t.kind==='best'?`Un lancer à ${t.need} m ou plus`:t.kind==='floor'?`Ton 10e meilleur score à ${t.need} m ou plus`:t.kind==='throws'?`${number.format(t.need)} lancers au total`:t.kind==='combo'?'50 duels gagnés + 20 victoires en Battle royale':t.kind==='dstreak'?`${t.need} duels gagnés d’affilée`:t.kind==='bstreak'?`${t.need} jours d’affilée 1er en Battle royale`:t.kind==='duel'?`${t.need} duel${t.need>1?'s':''} 1v1 gagné${t.need>1?'s':''}`:t.kind==='win'?`${t.need} victoire${t.need>1?'s':''} en Battle royale`:`${t.need} podium${t.need>1?'s':''} en Battle royale`;
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
    let best=0,floor=0,throws=0;
    try{const top=topOf(pid);best=top.length?Math.floor(top[0].score):0;floor=top.length>=10?Math.floor(top[9].score):0;
      throws=(totals.get(pid)||0)+allScores().filter(s=>s.player===pid&&notCounted(s)).length;}catch(_){}
    return {duelWins,podiums,wins,duelStreak,winStreak,best,floor,throws};
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
      const sub=open?(active?'✓ Équipé · ':'✓ ')+trailCond(t):`🔒 ${trailCond(t)} (${t.kind==='combo'?`${Math.min(st.duelWins,50)}/50 · ${Math.min(st.wins,20)}/20`:`${number.format(Math.min(have,t.need))}/${number.format(t.need)}${t.kind==='best'||t.kind==='floor'?' m':''}`})`;
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
  // ---------- Parois (bordures de glace) : choisies à part du skin, débloquées avec certains skins ----------
  let wallChoices={};try{wallChoices=JSON.parse(localStorage.getItem('yeti-walls')||'{}')||{};}catch(_){}
  const C2=()=>window.YetiCostumes;
  function wallsOpen(id){const st=skinState(id),C=C2();return st&&C&&C.walls?C.walls().filter(w=>st.unlocked.has(w)):[];}
  // 'auto' (par défaut) = la paroi du skin porté s'il en a une.
  function wallFor(id){if(!id||!C2()||!C2().walls)return 'none';const ch=wallChoices[id]||'auto';
    if(ch==='none')return 'none';
    if(ch==='auto'){const s=skinFor(id);return C2().hasWall(s)?s:'none';}
    return wallsOpen(id).includes(ch)?ch:'none';}
  function wallCards(){
    const C=C2();if(!selectedPlayer||!C||!C.walls)return '';
    const open=new Set(wallsOpen(selectedPlayer)),ch=wallChoices[selectedPlayer]||'auto',cur=wallFor(selectedPlayer),busy=activeRound||loadingGame,all=C.walls();
    const src=w=>window.YetiSkins.byId(w);
    const auto=`<button type="button" class="skin-card wall-card ${ch==='auto'?'active':''}" data-wall="auto" ${busy?'disabled':''} aria-pressed="${ch==='auto'}"><span class="wall-preview auto">${cur!=='none'&&ch==='auto'?`<img src="${C.wallPreview(cur)}" alt="">`:''}<i>🔗</i></span><span class="skin-name">Auto</span><span class="skin-min">${ch==='auto'?'✓ ':''}Celle du skin</span></button>`;
    const none=`<button type="button" class="skin-card wall-card ${ch==='none'?'active':''}" data-wall="none" ${busy?'disabled':''} aria-pressed="${ch==='none'}"><span class="wall-preview ice"></span><span class="skin-name">Glace</span><span class="skin-min">${ch==='none'?'✓ Équipée':'L’originale'}</span></button>`;
    const cards=all.map(w=>{const k=src(w),ok=open.has(w),active=ch===w;
      const sub=ok?(active?'✓ Équipée · ':'✓ ')+`${k.emoji} ${k.name}`:`🔒 ${k.emoji} ${k.name} : ${k.kind==='record'?k.min+' m de record':k.tag}`;
      return `<button type="button" class="skin-card wall-card ${active?'active':''} ${ok?'':'locked'}" data-wall="${w}" ${ok&&!busy?'':'disabled'} aria-pressed="${active}" title="${escape(C.wallName(w)+' — débloquée avec '+k.name+' ('+(k.kind==='record'?k.min+' m de record':k.tag)+')')}"><span class="wall-preview"><img src="${C.wallPreview(w)}" alt=""></span><span class="skin-name">${escape(C.wallName(w))}</span><span class="skin-min">${escape(sub)}</span></button>`;}).join('');
    return `<div class="skin-group wall-group"><span class="skin-group-label">Parois · ${open.size}/${all.length} · combine-les avec n’importe quel skin</span><div class="skin-group-cards">${auto}${none}${cards}</div></div>`;
  }
  async function chooseWall(id){
    if(!selectedPlayer||activeRound||loadingGame)return;
    if(id!=='auto'&&id!=='none'&&!wallsOpen(selectedPlayer).includes(id))return;
    wallChoices[selectedPlayer]=id;try{localStorage.setItem('yeti-walls',JSON.stringify(wallChoices));}catch(_){}
    renderSkins();
    if(gameLoaded&&loadedSkin!==gameKey(selectedPlayer)){await loadGame();const C=C2();showToast(id==='none'?'🧊 Paroi de glace d’origine.':id==='auto'?'🔗 La paroi suit ton skin.':`🧱 Paroi ${C.wallName(id)} posée !`);}
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
    }).join('')+wallCards()+trailCards();
    if(box._html!==html){box.innerHTML=html;box._html=html;}
  }
  async function chooseSkin(id){
    if(!selectedPlayer||activeRound||loadingGame)return;
    const k=window.YetiSkins.byId(id),st=skinState(selectedPlayer);if(!st||st.curse||!st.unlocked.has(id))return;
    skinChoices[selectedPlayer]=id;try{localStorage.setItem('yeti-skins',JSON.stringify(skinChoices));}catch(_){}
    renderSkins();if(gameLoaded&&loadedSkin!==gameKey(selectedPlayer)){await loadGame();showToast(`${k.emoji||''} ${k.name} est sur la banquise.`);}
  }
  // ---------- Compétitions : battle royale quotidienne + duels ----------
  let playMode={kind:'free'},duels=[],knownDuels=null,brView='day',competTab='br',duelOpp=null,duelGame='yeti',GROUPS=[];
  const GAME_INFO={yeti:{icon:'🏔️',name:'Yéti',label:'en duel',text:'5 lancers chacun, la meilleure moyenne gagne.'},chess:{icon:'♟️',name:'Échecs',label:'aux échecs',text:'Une vraie partie d’échecs, chacun joue à son rythme. Le jeu s’ouvre à la place du Yéti.'},naval:{icon:'🚢',name:'Bataille navale',label:'à la bataille navale',text:'Place tes 5 bateaux et coule les siens. Le jeu s’ouvre à la place du Yéti.'}};
  const gameOf=d=>d.game||'yeti';
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
    const prevTurn=new Map(duels.map(d=>[d.id,d.turn]));
    duels=list.map(d=>({...d,id:Number(d.id),challenger:Number(d.challenger),opponent:Number(d.opponent),throws:Number(d.throws)||DUEL_N,status:d.status||'accepted',c_n:Number(d.c_n)||0,c_sum:Number(d.c_sum)||0,o_n:Number(d.o_n)||0,o_sum:Number(d.o_sum)||0,
      game:d.game||'yeti',winner:d.winner===undefined||d.winner===null?null:Number(d.winner),finished_at:d.finished_at||null,turn:d.turn===undefined||d.turn===null?null:Number(d.turn),placed:(d.placed||[]).map(Number),ply:Number(d.ply)||0}));
    const first=knownDuels===null;if(first)knownDuels=new Set();
    for(const d of duels){
      const prev=duelStatus.get(d.id);duelStatus.set(d.id,d.status);
      if(!knownDuels.has(d.id)){knownDuels.add(d.id);}
      if(d.status==='pending'&&d.opponent===selectedPlayer&&!inviteShown.has(d.id))queueInvite(d);
      if(!first&&prev==='pending'&&d.challenger===selectedPlayer){
        if(d.status==='accepted'&&d.game!=='yeti'){showToast(`✅ ${player(d.opponent).name} a accepté ton défi ${GAME_INFO[d.game].label} !`);const cur=window.YetiGames&&YetiGames.openId?duels.find(x=>x.id===YetiGames.openId):null;if(!activeRound&&(!cur||cur.finished_at||!boardTodo(cur,selectedPlayer)))openBoard(d.id);}
        else if(d.status==='accepted')showToast(`✅ ${player(d.opponent).name} a accepté ton duel ! Clique sur « Jouer » dans Duels 1v1.`);
        if(d.status==='refused')showToast(`❌ ${player(d.opponent).name} a refusé ton duel.`);
      }
      if(!first&&d.game!=='yeti'&&d.turn===selectedPlayer&&prevTurn.has(d.id)&&prevTurn.get(d.id)!==selectedPlayer&&!(window.YetiGames&&YetiGames.openId===d.id)){const o=d.challenger===selectedPlayer?d.opponent:d.challenger;showToast(`${GAME_INFO[d.game].icon} À toi de jouer contre ${player(o).name} !`);}
    }
  }
  function queueInvite(d){inviteShown.add(d.id);inviteQueue.push(d.id);if(inviteQueue.length===1)showInvite();}
  function showInvite(){
    const d=duels.find(x=>x.id===inviteQueue[0]);if(!d||d.status!=='pending'||d.opponent!==selectedPlayer){inviteQueue.shift();if(inviteQueue.length)showInvite();else $('duel-invite').hidden=true;return;}
    const c=player(d.challenger),me=player(d.opponent);
    const gi=GAME_INFO[gameOf(d)];$('di-vs').innerHTML=`${avatar(c)}<span>${gi.icon}</span>${avatar(me)}`;$('di-title').textContent=d.game==='yeti'?`${c.name} te défie !`:`${c.name} te défie ${gi.label} !`;$('di-text').textContent=gi.text;$('duel-invite').hidden=false;
  }
  async function answerDuel(id,accept){
    if(!selectedPlayer)return;
    try{await request('/api/duel/answer',{duel:id,player:selectedPlayer,accept});
      const d=duels.find(x=>x.id===id);if(d)d.status=accept?'accepted':'refused';duelStatus.set(id,d?d.status:'');
      if(accept&&d&&d.game!=='yeti'){competTab='duel';showToast(`${GAME_INFO[d.game].icon} Défi accepté, c’est parti !`);openBoard(id);}
      else if(accept){competTab='duel';setMode({kind:'duel',id});showToast(`⚔️ Duel accepté ! Tes 5 prochains lancers comptent.`);if(!gameLoaded)loadGame();}
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
    if(d.game&&d.game!=='yeti'){const z={length:0,avg:null};return {a:z,b:z,aa:null,ba:null,done:!!d.finished_at&&d.status==='accepted',winner:d.finished_at?d.winner:null};}
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
    $('duel-go').disabled=!me||!duelOpp;$('duel-go').textContent=duelOpp?`${GAME_INFO[duelGame].icon} Défier ${player(duelOpp).name}${duelGame==='yeti'?'':' '+GAME_INFO[duelGame].label}`:'Choisis un adversaire';
    document.querySelectorAll('#duel-games [data-game]').forEach(b=>{const on=b.dataset.game===duelGame;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));});
    $('duel-desc').textContent=GAME_INFO[duelGame].text;
    // onglets
    document.querySelectorAll('.compet-tab').forEach(t=>{const on=t.dataset.tab===competTab;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));});
    document.querySelectorAll('.compet-panel').forEach(p=>p.hidden=p.dataset.panel!==competTab);
    const todo=me?duels.filter(d=>d.game!=='yeti'?((d.status==='pending'&&d.opponent===me)||boardTodo(d,me)):((d.challenger===me||d.opponent===me)&&d.status==='accepted'&&duelOf(d,me).length<d.throws)||(d.status==='pending'&&d.opponent===me)).length:0;
    $('ct-duel-badge').hidden=!todo;$('ct-duel-badge').textContent=todo;
    const inv=me?duels.filter(d=>d.status==='pending'&&d.opponent===me).length:0;
    $('ct-duel-sub').textContent=inv?`${inv} défi${inv>1?'s':''} reçu${inv>1?'s':''} !`:todo?`${todo} duel${todo>1?'s':''} à jouer`:'Défie un pote';
    const myDay=me?dailyOf(me,today).length:0;
    $('ct-br-sub').textContent=!me?'Session du jour · 10 lancers':myDay>=DAILY_N?'✅ Session du jour faite':myDay?`Session en cours ${myDay}/${DAILY_N}`:'▶ Ta session du jour t’attend';
    const mineD=duels.filter(d=>d.challenger===me||d.opponent===me).sort((a,b)=>b.id-a.id).slice(0,8);
    const others=duels.filter(d=>d.challenger!==me&&d.opponent!==me&&d.status==='accepted').map(d=>({d,st:duelState(d)})).filter(x=>x.st.done||(x.d.game!=='yeti'&&!x.d.finished_at)).sort((a,b)=>b.d.id-a.d.id).slice(0,5);
    const line=(d,st)=>{if(d.game!=='yeti')return boardLine(d,st,me);const A=player(d.challenger),B=player(d.opponent),fa=st.a.length,fb=st.b.length;
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
  function boardTodo(d,me){if(d.status!=='accepted'||d.finished_at||(d.challenger!==me&&d.opponent!==me))return false;if(d.game==='naval'&&d.turn===null)return !d.placed.includes(me);return d.turn===me;}
  function boardLine(d,st,me){
    const A=player(d.challenger),B=player(d.opponent),gi=GAME_INFO[d.game],isMine=d.challenger===me||d.opponent===me,open=window.YetiGames&&YetiGames.openId===d.id;
    const side=(p,win)=>`<span class="duel-side ${win?'win':''}">${avatar(p)}<span><b>${escape(p.name)}</b><small>${gi.icon} ${gi.name}</small></span></span>`;
    let status='';
    if(d.status==='refused')status='<span class="duel-st lose">❌ Refusé</span>';
    else if(d.status==='pending')status=d.opponent===me?`<span class="duel-ans"><button type="button" class="br-btn small ghost" data-answer="0" data-id="${d.id}">Refuser</button><button type="button" class="br-btn small" data-answer="1" data-id="${d.id}">Accepter</button></span>`:'<span class="duel-st">⏳ En attente de réponse</span>';
    else if(st.done)status=`<span class="duel-res">${st.winner===0?'<span class="duel-st">🤝 Nulle</span>':isMine?(st.winner===me?'<span class="duel-st win">🏆 Gagné</span>':'<span class="duel-st lose">Perdu</span>'):`<span class="duel-st">🏆 ${escape(player(st.winner).name)}</span>`}<button type="button" class="br-btn small ghost" data-board="${d.id}">Revoir</button></span>`;
    else if(open)status='<span class="duel-st live">En cours…</span>';
    else if(isMine)status=`<button type="button" class="br-btn small ${boardTodo(d,me)?'':'ghost'}" data-board="${d.id}">${boardTodo(d,me)?'▶ À toi de jouer':'Ouvrir la partie'}</button>`;
    else status=`<button type="button" class="br-btn small ghost" data-board="${d.id}">👁️ Regarder</button>`;
    return `<div class="duel-row game-${d.game}">${side(A,st.winner===d.challenger)}<span class="duel-vs">VS${d.created_at?`<small>${dayKey(d.created_at)===dayKey(new Date())?hhmm(d.created_at):new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit'}).format(new Date(d.created_at))+' '+hhmm(d.created_at)}</small>`:''}</span>${side(B,st.winner===d.opponent)}${status}</div>`;
  }
  // ---------- Échecs / bataille navale : la partie remplace la fenêtre du Yéti ----------
  let audioCtx=null;
  function sound(kind){try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='triangle';o.frequency.value=kind==='capture'?220:330;g.gain.setValueAtTime(.18,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);}catch(_){}}
  function openBoard(id){
    if(!window.YetiGames){showToast('Le module de jeux n’est pas chargé, recharge la page.');return;}
    if(activeRound){showToast('Termine ton lancer avant d’ouvrir la partie.');return;}
    YetiGames.open(id,{root:$('board-stage'),request,player:pid=>player(pid),avatar,escape,toast:showToast,sound,
      session:()=>{const s=getSession();return s&&authed&&s.player===authed?s:null;},
      onOpen:()=>{$('game-stage').hidden=true;document.querySelector('.game-footer').hidden=true;try{if(playerApi){if(playerApi.suspend)playerApi.suspend();else if(playerApi.pause)playerApi.pause();}}catch(_){}
        renderCompet();$('board-stage').scrollIntoView({behavior:'smooth',block:'start'});},
      onClose:()=>{$('game-stage').hidden=false;document.querySelector('.game-footer').hidden=false;try{if(playerApi){if(playerApi.resume)playerApi.resume();else if(playerApi.play)playerApi.play();}}catch(_){}renderCompet();},
      onFinished:()=>{refresh();},
      otherTurns:cid=>duels.filter(d=>d.id!==cid&&d.game!=='yeti'&&boardTodo(d,selectedPlayer)).map(d=>({id:d.id,text:`${GAME_INFO[d.game].icon} À toi de jouer contre ${player(d.challenger===selectedPlayer?d.opponent:d.challenger).name}`})),
      rematch:(game,opp)=>{if(!opp)return;YetiGames.close();createGame(game,opp);}});
  }
  async function createGame(game,opp){
    const s=getSession();if(!s||s.player!==authed||authed!==selectedPlayer){showToast('Reconnecte-toi pour lancer un défi.');return;}
    const r=await request('/api/game/create',{player:selectedPlayer,token:s.token,opponent:opp,game});
    if(r&&r.id&&knownDuels)knownDuels.add(Number(r.id));
    await refresh();competTab='duel';renderCompet();
    showToast(`${GAME_INFO[game].icon} Défi ${GAME_INFO[game].label} envoyé à ${player(opp).name}, en attente de sa réponse…`);
  }
  $('duel-games').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(!b)return;duelGame=b.dataset.game;renderCompet();});
  $('br-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-br]');if(b){brView=b.dataset.br;renderCompet();}});
  $('br-me').addEventListener('click',e=>{const b=e.target.closest('[data-mode]');if(!b||b.disabled)return;setMode({kind:b.dataset.mode});if(b.dataset.mode==='daily'){showToast('🏟️ Session du jour lancée : tes 10 prochains lancers comptent !');if(!gameLoaded)loadGame();$('game-stage').scrollIntoView({behavior:'smooth',block:'center'});}});
  $('duel-list').addEventListener('click',e=>{const a=e.target.closest('[data-answer]');if(a){answerDuel(Number(a.dataset.id),a.dataset.answer==='1');return;}const g=e.target.closest('[data-board]');if(g){openBoard(Number(g.dataset.board));return;}const b=e.target.closest('[data-duel]');if(!b||b.disabled)return;setMode({kind:'duel',id:Number(b.dataset.duel)});showToast('⚔️ Duel lancé : tes 5 prochains lancers comptent !');if(!gameLoaded)loadGame();$('game-stage').scrollIntoView({behavior:'smooth',block:'center'});});
  $('duel-new').addEventListener('submit',async e=>{e.preventDefault();const opp=duelOpp;if(!selectedPlayer||!opp)return;$('duel-go').disabled=true;
    if(duelGame!=='yeti'){try{await createGame(duelGame,opp);}catch(error){showToast(error.message||'Impossible de lancer le défi.');}finally{duelOpp=null;renderCompet();}return;}
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
  $('skins').addEventListener('click',e=>{const t=e.target.closest('[data-trail]');if(t&&!t.disabled){chooseTrail(t.dataset.trail);return;}const w=e.target.closest('[data-wall]');if(w&&!w.disabled){chooseWall(w.dataset.wall);return;}const b=e.target.closest('[data-skin]');if(b&&!b.disabled)chooseSkin(b.dataset.skin);});
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
  let chatClearedSeen=null,chatTr={},chatServerSince=0,chatClearArm=0,chatReacts={},chatReactFor=0,chatReads={},chatSeenSent=0,chatMsgs=[],chatLast=0,chatOpen=false,chatLoading=false,chatRead=0,chatInit=false,peekTimer;
  // Notifs du chat coupées par l'admin pour ce joueur : pas de bulle, pas de compteur, pas d'alerte de tag.
  function chatMuted(){return !!(selectedPlayer&&player(selectedPlayer).muted);}
  function chatPeek(m){
    const p=player(m.player),el=$('chat-peek');
    el.innerHTML=`<i class="player-dot" style="background:${p.color}"></i><b>${escape(cn(p))}</b> : ${mentionsMe(m)?'🔔 ':''}${escape(plainBody(m.body))}`;el.hidden=false;
    $('chat-fab').classList.remove('ping');void $('chat-fab').offsetWidth;$('chat-fab').classList.add('ping');
    clearTimeout(peekTimer);peekTimer=setTimeout(()=>el.hidden=true,4500);
  }
  try{chatRead=Number(localStorage.getItem('yeti-chat-read'))||0;}catch(_){}
  const chatTime=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
  const chatDay=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit'});
  async function loadChat(){
    if(chatLoading)return;chatLoading=true;
    try{const r=await request('/api/chat',{after:chatLast});noteChatSince(r&&r.since);const list=Array.isArray(r.messages)?r.messages:[];
      const known=new Set(chatMsgs.map(m=>m.id));
      const fresh=[];for(const m of list){if(!known.has(Number(m.id))){const n={...m,id:Number(m.id),player:Number(m.player)};chatMsgs.push(n);fresh.push(n);}}
      const others=chatInit?fresh.filter(m=>m.player!==selectedPlayer):[];chatInit=true;
      if(others.length&&!chatOpen&&!chatMuted())chatPeek(others[others.length-1]);
      const tag=others.filter(mentionsMe).pop();
      if(tag&&!chatMuted()){showToast(`🔔 ${cn(player(tag.player))} t’a tagué : ${plainBody(tag.body).slice(0,80)}`);try{navigator.vibrate&&navigator.vibrate([80,60,80]);}catch(_){}}
      chatMsgs=chatMsgs.filter(m=>!m.temp||!list.some(x=>Number(x.player)===m.player&&x.body===m.body));
      chatMsgs.sort((a,b)=>(a.temp?1e15:a.id)-(b.temp?1e15:b.id));chatMsgs=chatMsgs.slice(-150);
      chatLast=Math.max(chatLast,...chatMsgs.filter(m=>!m.temp).map(m=>m.id),0);renderChat(fresh.length>0);
    }catch(_){}finally{chatLoading=false;}
  }
  // Le chat est vidé toutes les 15 min (à :00, :15, :30, :45, côté serveur) : on retire aussi les vieux messages affichés.
  function sendSeen(){
    const s=getSession();if(!chatOpen||document.hidden||!chatLast||chatLast<=chatSeenSent||!s||!authed||s.player!==authed||authed!==selectedPlayer)return;
    chatSeenSent=chatLast;chatReads[authed]=chatLast;request('/api/chat/seen',{player:authed,token:s.token,msg:chatLast}).catch(()=>{chatSeenSent=0;});
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sendSeen();});
  const REACTS=['❤️','😂','😮','😢','😡','👍','🔥','💀'];
  async function sendReact(msg,emoji){
    const s=getSession();if(!authed||authed!==selectedPlayer||!s||s.player!==authed){showToast('Connecte-toi pour réagir.');return;}
    // affichage immédiat, puis la réponse du serveur fait foi
    const r=chatReacts[msg]=chatReacts[msg]||{},ids=(r[emoji]||[]).map(Number);
    r[emoji]=ids.includes(authed)?ids.filter(i=>i!==authed):[...ids,authed];chatReactFor=0;renderChat();
    try{const res=await request('/api/chat/react',{player:authed,token:s.token,msg,emoji});if(res&&res.reactions)chatReacts=res.reactions;}
    catch(e){showToast(e.message||'Réaction impossible.');}
    renderChat();
  }
  let lastTap={id:0,t:0};
  $('chat-list').addEventListener('click',e=>{
    const who=e.target.closest('[data-who]');if(who&&isMod()&&Number(who.dataset.who)!==authed){e.stopPropagation();openMod(Number(who.dataset.who));return;}
    const tb=e.target.closest('[data-tr]');if(tb){e.stopPropagation();translateMsg(Number(tb.dataset.tr));return;}
    const b=e.target.closest('[data-react]');
    if(b){e.stopPropagation();sendReact(Number(b.dataset.msg),b.dataset.react);return;}
    if(e.target.closest('a,button'))return;
    const m=e.target.closest('.chat-msg[data-mid]');const id=m&&Number(m.dataset.mid);
    if(!id){if(chatReactFor){chatReactFor=0;renderChat();}return;}
    // double-tap = ❤️ (comme sur Insta)
    const now=Date.now();if(lastTap.id===id&&now-lastTap.t<350){lastTap={id:0,t:0};chatReactFor=0;
      const mine=((chatReacts[id]||{})['❤️']||[]).map(Number).includes(selectedPlayer);if(!mine)sendReact(id,'❤️');else renderChat();return;}
    lastTap={id,t:now};
    const keep=$('chat-list').scrollTop;chatReactFor=chatReactFor===id?0:id;renderChat();$('chat-list').scrollTop=keep;
    const bar=$('chat-list').querySelector('.react-bar');if(bar)bar.scrollIntoView({block:'nearest'});
  });
  // Le chat peut aussi être vidé par l'admin : le serveur donne l'heure à partir de laquelle on garde les messages.
  // L'admin a vidé le chat : on recharge la page chez tout le monde (sauf pendant un lancer ou une partie en cours, on attend la fin).
  function reloadAfterClear(){chatMsgs=chatMsgs.filter(m=>m.temp);renderChat();const go=()=>{if(activeRound||(window.YetiGames&&YetiGames.openId)){setTimeout(go,2000);return;}location.reload();};setTimeout(go,300);}
  function noteChatSince(v){const t=Date.parse(v||'');if(t&&t>chatServerSince){chatServerSince=t;return true;}return false;}
  $('chat-clear').addEventListener('click',async()=>{
    const b=$('chat-clear');
    if(chatClearArm<Date.now()){chatClearArm=Date.now()+4000;b.textContent='Vider ?';b.classList.add('arm');setTimeout(()=>{if(chatClearArm<=Date.now()){b.textContent='🧹';b.classList.remove('arm');}},4100);return;}
    chatClearArm=0;b.textContent='🧹';b.classList.remove('arm');
    const s=getSession();if(!s||s.player!==authed){showToast('Reconnecte-toi.');return;}
    try{const r=await request('/api/chat/clear',{admin:authed,token:s.token});noteChatSince(r&&r.since);chatClearedSeen=Math.max(chatClearedSeen||0,Date.parse(r&&r.since||'')||0);chatReacts={};chatReads={};renderChat();showToast(`🧹 Chat vidé pour tout le monde (${r&&r.deleted||0} message${(r&&r.deleted)>1?'s':''}).`);}
    catch(e){showToast(e.message||'Impossible de vider le chat.');}
  });
  // ---------- Traduction des messages écrits dans une autre langue ----------
  const FR_W=new Set('le la les un une des de du et est pas je tu il elle on nous vous ils elles que qui quoi mais ou donc car ce cette ces mon ma mes ton ta tes son sa ses en au aux avec pour sur dans par plus tres très bien oui non cest c’est suis es sommes êtes sont ai as avons avez ont fait faire vas va allez aller moi toi lui leur ça ca ici là quand comme aussi encore jamais rien tout tous toute trop vraiment mdr ptdr wsh frero frère grave genre ouais nan bah bon ben alors'.split(' '));
  const XX_W=new Set('the and is are you i it to of in that this what with for not have be was were my your me he she they we do does did can will just like so but how why when where there here hello hi thanks please yes no el los las una por para que con como pero muy está estoy gracias hola der die das und ist nicht ich du sie wir ein eine mit für auf ja nein danke il lo gli che non sono sei è ciao grazie molto perché anche come sta você não sim obrigado muito tudo bem eu ele ela'.split(' '));
  function looksForeign(text){
    const t=String(text||'').replace(/@[\p{L}\p{N}_-]+/gu,' ').replace(/https?:\/\/\S+/g,' ');
    const letters=t.match(/\p{L}/gu)||[];if(letters.length<4)return false;
    const latin=letters.filter(c=>/\p{Script=Latin}/u.test(c)).length;if(latin/letters.length<0.6)return true; // arabe, cyrillique, asiatique…
    const words=(t.toLowerCase().match(/[\p{L}’']+/gu)||[]).filter(w=>w.length>1);if(words.length<2)return false;
    let fr=0,xx=0;for(const w of words){if(FR_W.has(w))fr++;else if(XX_W.has(w))xx++;}
    if(/[èêàùçœ]/i.test(t))fr+=1;if(/[¿¡ñßäöüãõ]/i.test(t))xx+=2;
    return xx>=1&&xx>fr;
  }
  const LANG_FR=(()=>{try{return new Intl.DisplayNames(['fr'],{type:'language'});}catch(_){return null;}})();
  function translateBlock(m){
    const tr=chatTr[m.id];
    if(!tr&&!looksForeign(m.body))return '';
    if(!tr)return `<button type="button" class="tr-btn" data-tr="${m.id}">🌐 Traduire</button>`;
    if(tr.state==='loading')return '<span class="tr-btn wait">🌐 Traduction…</span>';
    if(tr.state==='err')return `<button type="button" class="tr-btn" data-tr="${m.id}">🌐 Réessayer la traduction</button>`;
    if(tr.hidden)return `<button type="button" class="tr-btn" data-tr="${m.id}">🌐 Voir la traduction</button>`;
    const from=tr.lang&&LANG_FR?(()=>{try{return LANG_FR.of(tr.lang);}catch(_){return tr.lang;}})():'';
    return `<p class="tr-out">${tr.same?'Déjà en français 🙂':escape(tr.text)}</p><button type="button" class="tr-btn" data-tr="${m.id}">${from&&!tr.same?`Traduit de l’${escape(from)} · `:''}masquer</button>`;
  }
  async function translateMsg(id){
    const m=chatMsgs.find(x=>x.id===id);if(!m)return;const tr=chatTr[id];
    if(tr&&tr.state==='done'){tr.hidden=!tr.hidden;renderChat();return;}
    if(tr&&tr.state==='loading')return;
    chatTr[id]={state:'loading'};renderChat();
    try{
      const q=String(m.body).replace(/@([\p{L}\p{N}_-]+)/gu,'$1').slice(0,480);
      const res=await fetch('https://api.mymemory.translated.net/get?q='+encodeURIComponent(q)+'&langpair=autodetect|fr');
      const d=await res.json();const out=d&&d.responseData&&d.responseData.translatedText;
      if(!res.ok||!out||d.quotaFinished)throw new Error('trad');
      const lang=String(d.responseData.detectedLanguage||'').split('-')[0].toLowerCase();
      const txt=document.createElement('textarea');txt.innerHTML=out; // décode les entités HTML renvoyées par l'API
      chatTr[id]={state:'done',text:txt.value,lang,same:lang==='fr'};
    }catch(_){chatTr[id]={state:'err'};showToast('Traduction impossible pour le moment.');}
    renderChat();
  }
  function chatBottom(){const l=$('chat-list');if(l)l.scrollTop=l.scrollHeight;}
  const chatHour=()=>Math.floor(Date.now()/900000)*900000;
  let chatHourShown=chatHour();
  function renderChat(toEnd){
    chatHourShown=Math.max(chatHour(),chatServerSince);chatMsgs=chatMsgs.filter(m=>m.temp||!(Date.parse(m.at)<chatHourShown));
    const list=$('chat-list'),stick=list.scrollHeight-list.scrollTop-list.clientHeight<60,today=dayKey(new Date());
    // « Vu par » : chaque lecteur est placé sous le dernier message qu'il a lu (comme sur Insta / WhatsApp)
    const real=chatMsgs.filter(m=>!m.temp),seenAt={};
    for(const [pid,last] of Object.entries(chatReads)){const id=Number(pid);if(!id||id===selectedPlayer)continue;
      let at=null;for(const m of real){if(m.id<=Number(last))at=m;else break;}
      if(at&&at.player!==id)(seenAt[at.id]=seenAt[at.id]||[]).push(id);}
    const seenLine=m=>{const ids=seenAt[m.id];if(!ids||m.temp)return '';const names=ids.map(i=>escape(cn(player(i))));
      return `<div class="chat-seen ${m.player===selectedPlayer?'mine':''}">Vu par ${names.length>4?names.slice(0,4).join(', ')+' et '+(names.length-4)+' autre'+(names.length>5?'s':''):names.join(', ')}</div>`;};
    // Réactions emoji : pastilles sous la bulle + barre de choix sur le message touché
    const reactLine=m=>{if(m.temp)return '';const r=chatReacts[m.id]||{};const chips=REACTS.filter(e=>Array.isArray(r[e])&&r[e].length).map(e=>{const ids=r[e].map(Number);
        return `<button type="button" class="react-chip ${ids.includes(selectedPlayer)?'me':''}" data-react="${e}" data-msg="${m.id}" title="${escape(ids.map(i=>cn(player(i))).join(', '))}">${e}${ids.length>1?`<small>${ids.length}</small>`:''}</button>`;}).join('');
      const bar=chatReactFor===m.id?`<div class="react-bar ${m.player===selectedPlayer?'mine':''}" role="group" aria-label="Réagir">${REACTS.map(e=>`<button type="button" data-react="${e}" data-msg="${m.id}" class="${(r[e]||[]).map(Number).includes(selectedPlayer)?'me':''}">${e}</button>`).join('')}</div>`:'';
      return chips||bar?`<div class="react-row ${m.player===selectedPlayer?'mine':''}">${chips}</div>${bar}`.replace('<div class="react-row '+(m.player===selectedPlayer?'mine':'')+'"></div>',''):'';};
    list.innerHTML=chatMsgs.length?chatMsgs.map(m=>{const p=player(m.player),mine=m.player===selectedPlayer,d=new Date(m.at||Date.now());
      const dev=devMsg(m);if(dev)return `<div class="chat-dev" data-mid="${m.id}"><span class="chat-dev-tag">🛠️ LES DÉVELOPPEURS DU SITE</span><p>${escape(dev)}</p><small>🔄 Rafraîchis la page pour voir la nouveauté · ${chatTime.format(d)}</small></div>`;
      const mod=modMsg(m);if(mod){const t=escape(cn(mod.target)).toUpperCase(),by=escape(cn(p)),fresh=!modShown.has(m.id)&&Date.now()-Date.parse(m.at||0)<30000;modShown.add(m.id);
        const big=mod.kind==='shut'?`🤐 ${t} FERME TA SALE GUEULE`:mod.secs<0?`🚫 ${t} EST EXCLU DÉFINITIVEMENT`:`⛔ ${t} EST BANNI ${mod.secs<60?mod.secs+' SECONDES':mod.secs<3600?(mod.secs/60)+' MIN':(mod.secs/3600)+' H'}`;
        return `<div class="chat-mod ${mod.kind} ${mod.me?'me':''} ${fresh?'fresh':''}" data-mid="${m.id}"><div class="chat-mod-siren" aria-hidden="true">🚨</div><span class="chat-mod-tag">${p.admin?'ADMIN':'MODO'} · ${by}</span><p class="chat-mod-big">${big}</p><p class="chat-mod-sub">${mod.kind==='shut'?`Message de ${by}. On se calme.`:`Décision de ${by}. Ça t’apprendra.`}</p><time>${chatTime.format(d)}</time></div>`;}
      const media=mediaOf(m.body);
      const trBox=!media&&!m.temp&&!mine?translateBlock(m):'';
      return `<div data-mid="${m.temp?'':m.id}" class="chat-msg ${chatReactFor===m.id?'picked':''} ${mine?'mine':''} ${m.temp?'temp':''} ${media?'media':''} ${!mine&&mentionsMe(m)?'tagged':''}"><div class="chat-meta"><i class="player-dot" style="background:${p.color}"></i><b data-who="${m.player}">${escape(cn(p))}</b><time>${dayKey(d)===today?'':chatDay.format(d)+' '}${chatTime.format(d)}</time></div>${media||`<p>${richBody(m.body)}</p>`}${trBox}</div>${reactLine(m)}${seenLine(m)}`;}).join(''):'<p class="chat-empty">Pas encore de message. Lance les hostilités.<br><small>Le chat se vide toutes les 15 min.</small></p>';
    if(stick||toEnd){chatBottom();
      // les GIF se chargent après coup : on redescend quand chacun arrive
      list.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',chatBottom,{once:true});});}
    if(chatOpen){chatRead=chatLast;try{localStorage.setItem('yeti-chat-read',String(chatRead));}catch(_){}sendSeen();}
    const unread=chatMsgs.filter(m=>!m.temp&&m.id>chatRead&&m.player!==selectedPlayer).length;
    $('chat-badge').hidden=!unread||chatMuted();$('chat-badge').textContent=unread>9?'9+':String(unread);
    const can=!!selectedPlayer&&!privateAccess;
    $('chat-input').disabled=!can;$('chat-send').disabled=!can;$('chat-pick').disabled=!can;$('chat-pop').disabled=!can;if(!can)closePicker();
    $('chat-input').placeholder=can?`Écris en tant que ${cn(player(selectedPlayer))}…`:'Choisis ton pseudo pour écrire';
  }
  function toggleChat(open){
    chatOpen=open;$('chat-panel').hidden=!open;if(typeof applyWide==='function')applyWide();if(!open){closePicker();closeMention();}$('chat-fab').setAttribute('aria-expanded',String(open));$('chat-fab').classList.toggle('open',open);
    if(open){$('chat-peek').hidden=true;chatReactFor=0;renderChat(true);loadChat();if(!$('chat-input').disabled&&matchMedia('(pointer:fine)').matches)$('chat-input').focus();}
  }
  $('chat-fab').addEventListener('click',()=>toggleChat(!chatOpen));
  $('chat-peek').addEventListener('click',()=>{$('chat-peek').hidden=true;toggleChat(true);});
  $('chat-close').addEventListener('click',()=>toggleChat(false));
  $('chat-form').addEventListener('submit',async e=>{
    e.preventDefault();const input=$('chat-input'),body=input.value.trim();if(!body||!selectedPlayer)return;
    input.value='';closeMention();if(typingOn)typingOn=false;sendChat(body);
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
  // Message spécial posté par un modo (« ferme ta… »)
  // Annonce des développeurs (« [dev:texte] », postée par l'admin)
  function devMsg(m){const x=/^\[dev:([\s\S]{1,270})\]$/.exec(String(m.body||''));return x&&player(m.player).admin?x[1]:null;}
  const modShown=new Set();
  function modMsg(m){const b=String(m.body||''),x=/^\[mod:shut:(\d+)\]$/.exec(b),y=/^\[mod:ban:(\d+):(-?\d+)\]$/.exec(b);if((!x&&!y)||!player(m.player).mod)return null;const t=Number((x||y)[1]);return {kind:x?'shut':'ban',secs:y?Number(y[2]):0,target:player(t),me:t===selectedPlayer};}
  function mediaOf(body){
    const gm=/^\[gif:([A-Za-z0-9]{5,40})\]$/.exec(body||'');if(gm)return `<img class="chat-gif giphy" src="https://media.giphy.com/media/${gm[1]}/200w.webp" alt="GIF" loading="lazy">`;
    let m=/^\[g:([0-9a-f_]{2,24})\]$/.exec(body||'');if(m&&GIFS.includes(m[1]))return `<img class="chat-gif" src="${gifUrl(m[1])}" alt="GIF" loading="lazy" width="120" height="120">`;
    m=/^\[s:(.{1,12})\]$/u.exec(body||'');if(m&&STICKERS.includes(m[1]))return `<span class="chat-sticker" role="img" aria-label="sticker">${m[1]}</span>`;
    return '';
  }
  function plainBody(body){if(/^\[(g|gif):/.test(body||''))return 'a envoyé un GIF';const dv=/^\[dev:([\s\S]+)\]$/.exec(body||'');if(dv)return '🛠️ '+dv[1];const mm=/^\[mod:shut:(\d+)\]$/.exec(body||'');if(mm)return `🚨 ${cn(player(Number(mm[1])))}, ferme ta sale gueule.`;const mb=/^\[mod:ban:(\d+):(-?\d+)\]$/.exec(body||'');if(mb)return `⛔ ${cn(player(Number(mb[1])))} a été banni.`;const m=/^\[s:(.{1,12})\]$/u.exec(body||'');return m?m[1]:String(body||'');}
  const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // Nom affiché dans le chat : surnom optionnel (players.chat_name), sinon le prénom ; @surnom et @prénom taguent tous les deux.
  function cn(p){return p?(p.chat||p.name):'';}
  function lc(t){return String(t||'').toLocaleLowerCase('fr');}
  function byTag(t){return PLAYERS.find(q=>lc(q.name)===lc(t)||(q.chat&&lc(q.chat)===lc(t)));}
  function mentionRe(){const names=PLAYERS.flatMap(p=>p.chat?[p.name,p.chat]:[p.name]).sort((a,b)=>b.length-a.length).map(reEsc);return names.length?new RegExp('@('+names.join('|')+')(?![\\p{L}\\p{N}_])','giu'):null;}
  // Tags spéciaux : @tous, @here (les connectés) et les groupes (@lesarabes…).
  function specialRe(){const tags=['tous','all','everyone','here',...GROUPS.map(g=>g.tag)].sort((a,b)=>b.length-a.length).map(reEsc);return new RegExp('@('+tags.join('|')+')(?![\\p{L}\\p{N}_])','giu');}
  function specialHitsMe(tag){tag=tag.toLowerCase();if(['tous','all','everyone','here'].includes(tag))return true;const g=GROUPS.find(x=>x.tag.toLowerCase()===tag);return !!(g&&selectedPlayer&&g.members.includes(selectedPlayer));}
  function mentionsMe(m){if(!selectedPlayer||m.player===selectedPlayer)return false;const body=String(m.body||'');const re=mentionRe();if(re)for(const x of body.matchAll(re)){const q=byTag(x[1]);if(q&&q.id===selectedPlayer)return true;}for(const x of body.matchAll(specialRe()))if(specialHitsMe(x[1]))return true;return false;}
  function richBody(body){
    const re=mentionRe();let out='',last=0;const text=String(body||'');
    const sre=specialRe();const esc=t=>{let o='',l=0;for(const x of t.matchAll(sre)){o+=escape(t.slice(l,x.index))+`<span class="mention group ${specialHitsMe(x[1])?'me':''}">@${escape(x[1])}</span>`;l=x.index+x[0].length;}return o+escape(t.slice(l));};
    if(re)for(const x of text.matchAll(re)){out+=esc(text.slice(last,x.index));const p=byTag(x[1]);const isMe=!!(p&&p.id===selectedPlayer);out+=`<span class="mention ${isMe?'me':''}" style="--mc:${p?p.color:'#1b4e3b'}">@${escape(p?cn(p):x[1])}</span>`;last=x.index+x[0].length;}
    return out+esc(text.slice(last));
  }
  // Suggestions quand on tape @
  let mentionSel=0,mentionItems=[];
  function mentionQuery(){const i=$('chat-input'),pos=i.selectionStart??i.value.length,before=i.value.slice(0,pos);const m=/(^|\s)@([\p{L}\p{N}_-]{0,24})$/u.exec(before);return m?{q:m[2],start:pos-m[2].length-1,pos}:null;}
  function closeMention(){$('chat-mention').hidden=true;mentionItems=[];}
  function renderMention(){
    const q=mentionQuery();if(!q){closeMention();return;}
    const n=q.q.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const groupItems=[...GROUPS.map(g=>({id:0,name:g.tag,ico:'👥',sub:g.members.map(id=>player(id)).filter(Boolean).map(cn).join(', ')})),{id:0,name:'here',ico:'🟢',sub:'les connectés'},{id:0,name:'tous',ico:'📣',sub:'tout le club'}].filter(g=>g.name.toLowerCase().startsWith(n));
    mentionItems=[...PLAYERS.filter(p=>p.id!==selectedPlayer&&[p.name,p.chat].some(x=>x&&x.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').startsWith(n))),...groupItems].slice(0,10);
    if(!mentionItems.length){closeMention();return;}
    mentionSel=Math.min(mentionSel,mentionItems.length-1);
    $('chat-mention').innerHTML=mentionItems.map((p,i)=>`<button type="button" role="option" aria-selected="${i===mentionSel}" class="${i===mentionSel?'on':''}" data-mention="${i}">${p.id?avatar(p):`<span class="ranking-avatar ranking-avatar-empty" style="--ring:#f08b50">${p.ico||'📣'}</span>`}<span>@${escape(p.id?cn(p):p.name)}${p.sub?`<small class="mention-sub">${escape(p.sub)}</small>`:''}</span>${online.has(p.id)?'<i class="online-mini"></i>':''}</button>`).join('');
    $('chat-mention').hidden=false;
  }
  function pickMention(i){
    const p=mentionItems[i],q=mentionQuery();if(!p||!q)return;const input=$('chat-input');
    const ins='@'+(p.id?cn(p):p.name)+' ';input.value=input.value.slice(0,q.start)+ins+input.value.slice(q.pos);
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
  // Sélecteur de GIF (GIPHY) : tendances à l'ouverture, recherche au fil de la frappe.
  let gifQ='',gifOffset=0,gifTimer=null,gifSeq=0;
  // Les GIF passent par notre serveur (fonction yeti-giphy) qui garde en cache, pour tout le club,
  // les tendances et chaque recherche déjà faite : la limite GIPHY (100 appels/h) ne compte que les nouvelles recherches.
  const gifCache=new Map();
  async function giphyGet(url){
    const k='yeti-giphy2:'+url.replace(/code=[^&]+&?/,''),hit=gifCache.get(k);if(hit&&Date.now()-hit.t<18e5)return hit.j;
    try{const c=JSON.parse(localStorage.getItem(k)||'null');if(c&&Date.now()-c.t<18e5){gifCache.set(k,c);return c.j;}}catch(_){}
    const r=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error('giphy');e.status=r.status;throw e;}
    const e={t:Date.now(),j};gifCache.set(k,e);try{localStorage.setItem(k,JSON.stringify(e));}catch(_){}
    return j;
  }
  async function loadGifs(more){
    const grid=$('chat-picker-grid'),cfg=window.YETI_CONFIG||{},code=clubCode();
    if(!code||!cfg.supabaseUrl){grid.innerHTML='<p class="gif-empty">Entre dans le club pour chercher des GIF.</p>';$('gif-more').hidden=true;return;}
    if(!more){gifOffset=0;grid.innerHTML='<p class="gif-empty">Chargement…</p>';}
    const seq=++gifSeq,q=gifQ.trim();
    const url=`${cfg.supabaseUrl}/functions/v1/yeti-giphy?code=${encodeURIComponent(code)}&q=${encodeURIComponent(q)}&offset=${gifOffset}`;
    try{
      const j=await giphyGet(url);if(seq!==gifSeq)return;
      const items=(j.data||[]).filter(g=>/^[A-Za-z0-9]{5,40}$/.test(g.id)).map(g=>`<button type="button" data-send="[gif:${g.id}]" title="${escape(g.title||'GIF')}"><img src="${escape(g.url||`https://media.giphy.com/media/${g.id}/100w.webp`)}" alt="${escape(g.title||'GIF')}" loading="lazy"></button>`).join('');
      if(!more)grid.innerHTML=items||'<p class="gif-empty">Aucun GIF trouvé.</p>';else grid.insertAdjacentHTML('beforeend',items);
      gifOffset+=(j.data||[]).length;$('gif-more').hidden=!(j.total>gifOffset&&gifOffset<480);
    }catch(e){if(seq===gifSeq&&!more)grid.innerHTML=e&&e.status===429?'<p class="gif-empty">Trop de nouvelles recherches cette heure-ci (limite GIPHY). Les recherches déjà faites marchent toujours, réessaie un peu plus tard pour les nouvelles.</p>':'<p class="gif-empty">GIPHY ne répond pas, réessaie.</p>';}
  }
  function closePicker(){$('chat-picker').hidden=true;$('chat-pick').setAttribute('aria-expanded','false');}
  $('chat-pick').addEventListener('click',()=>{const open=$('chat-picker').hidden;if(open){$('chat-picker').hidden=false;$('chat-pick').setAttribute('aria-expanded','true');loadGifs(false);setTimeout(()=>$('gif-q').focus(),50);}else closePicker();});
  $('gif-q').addEventListener('input',()=>{gifQ=$('gif-q').value;clearTimeout(gifTimer);gifTimer=setTimeout(()=>{if(gifQ.trim().length!==1)loadGifs(false);},500);});
  $('gif-q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(gifTimer);gifQ=$('gif-q').value;loadGifs(false);}if(e.key==='Escape')closePicker();});
  $('gif-more').addEventListener('click',()=>loadGifs(true));
  $('chat-picker-grid').addEventListener('click',e=>{const b=e.target.closest('[data-send]');if(!b)return;closePicker();$('gif-q').value='';gifQ='';sendChat(b.dataset.send);});
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
      if(r&&noteChatSince(r.chat_since))renderChat();
      if(r&&'chat_cleared' in r){const c=Date.parse(r.chat_cleared||'')||0;if(chatClearedSeen===null)chatClearedSeen=c;else if(c>chatClearedSeen){chatClearedSeen=c;reloadAfterClear();}}
      if(r&&r.reactions&&typeof r.reactions==='object'){const key=JSON.stringify(r.reactions);if(key!==JSON.stringify(chatReacts)){chatReacts=r.reactions;if(chatOpen)renderChat();}}
      if(r&&r.reads&&typeof r.reads==='object'){const key=JSON.stringify(r.reads);if(key!==JSON.stringify(chatReads)){chatReads=r.reads;if(chatOpen)renderChat();}}
      if(r&&Array.isArray(r.hidden)&&r.hidden.length){const hid=new Set(r.hidden.map(Number)),n=chatMsgs.length;chatMsgs=chatMsgs.filter(m=>m.temp||!hid.has(m.id));if(chatMsgs.length!==n)renderChat();}
      if(r)modPresence(r);
      if(r&&Array.isArray(r.popups))popPresence(r.popups);
      if(r&&Array.isArray(r.typing)){const t=r.typing.map(Number);if(t.join()!==chatTyping.join()){chatTyping=t;renderTyping();}}
      if(r&&Array.isArray(r.online)){const next=new Set(r.online.map(Number));if([...next].join()!==[...online].join()){online=next;renderProfiles();}}}
    catch(_){}finally{presenceBusy=false;}
  }
  // Toutes les 2,5 s quand le chat est ouvert (pour « … est en train d'écrire »), sinon toutes les 5 s.
  // Toutes les 2,5 s : messages écran et « en train d'écrire » arrivent vite.
  setInterval(pingPresence,2500);
  // ---------- Modos : « ferme ta… », bans express, alerte spam ----------
  function isMod(){return !!(authed&&authed===selectedPlayer&&player(authed).mod);}
  let modFocus=0,spamDismissed=new Set(),warnSeen=0;try{warnSeen=Number(localStorage.getItem('yeti-warn-seen'))||0;}catch(_){}
  function modEl(){
    let o=$('mod-overlay');if(o)return o;
    o=document.createElement('div');o.className='access-overlay';o.id='mod-overlay';o.hidden=true;
    o.innerHTML='<div class="access-card admin-card" role="dialog" aria-modal="true" aria-labelledby="mod-title"><span class="brand-mark" aria-hidden="true">🚨</span><p class="eyebrow">MODO</p><h2 id="mod-title">Calmer quelqu’un.</h2><p>« Ferme ta gueule » affiche un gros panneau sur son écran. Le ban express le déconnecte 30 s ou 1 min.</p><div class="admin-list" id="mod-list"></div><p id="mod-error" role="alert"></p><button class="text-button add-player-cancel" id="mod-close" type="button">Fermer</button></div>';
    document.body.appendChild(o);
    o.addEventListener('click',async e=>{
      if(e.target===o||e.target.id==='mod-close'){o.hidden=true;return;}
      const b=e.target.closest('[data-mod]');if(!b)return;
      const ok=await modAction(Number(b.dataset.target),b.dataset.mod,null,b);if(ok)renderMod();
    });
    return o;
  }
  function renderMod(){
    const list=PLAYERS.filter(p=>p.id!==authed&&(!modFocus||p.id===modFocus));
    $('mod-list').innerHTML=list.map(p=>{const b=banLeft(p.id);return `<div class="admin-row ${b?'banned':''}"><div class="admin-who">${avatar(p)}<span><b>${escape(p.name)}</b><small>${b?`⛔ ${banText(p.id)}`:online.has(p.id)?'🟢 en ligne':'hors ligne'}${p.mod?' · 🚨 modo':''}</small></span></div><div class="admin-actions"><button type="button" class="shut" data-mod="warn" data-target="${p.id}">🤐 Ferme ta gueule</button>${p.mod?'':`<button type="button" data-mod="ban30" data-target="${p.id}">⛔ 30 s</button><button type="button" data-mod="ban60" data-target="${p.id}">⛔ 1 min</button>`}${b&&!banPerm(p.id)?`<button type="button" class="unban" data-mod="unban" data-target="${p.id}">✅ Débannir</button>`:''}</div></div>`;}).join('')+(modFocus?'<button type="button" class="text-button" id="mod-all" style="margin-top:6px">Voir tout le monde</button>':'');
    const all=$('mod-all');if(all)all.onclick=()=>{modFocus=0;renderMod();};
  }
  function openMod(id){modEl();modFocus=id||0;$('mod-error').textContent='';renderMod();$('mod-overlay').hidden=false;}
  $('mod-open').addEventListener('click',()=>openMod(0));
  async function modAction(target,action,body,btn){
    const s=getSession();if(!s||s.player!==authed){showToast('Reconnecte-toi.');return false;}
    if(btn)btn.disabled=true;
    try{const r=await request('/api/mod',{mod:authed,token:s.token,target,action,body});const name=player(target).name;
      if(r.banned_until){bans[target]=r.banned_until;online.delete(target);renderProfiles();}
      if(action==='unban'){delete bans[target];renderProfiles();}
      if(action==='purge'){chatMsgs=chatMsgs.filter(m=>m.temp||!(m.player===target&&String(m.body).trim().toLowerCase()===String(body).trim().toLowerCase()));renderChat();}
      showToast(action==='warn'?`🤐 ${name} a reçu ton message.`:action==='purge'?`🗑️ ${r.hidden||0} message${r.hidden>1?'s':''} de ${name} supprimé${r.hidden>1?'s':''}.`:action==='unban'?`✅ ${name} est débanni.`:`⛔ ${name} est banni ${action==='ban30'?'30 s':'1 min'}.`);
      return true;
    }catch(e){showToast(e.message||'Action impossible.');if(btn)btn.disabled=false;return false;}
  }
  function warnEl(){
    let o=$('warn-overlay');if(o)return o;
    o=document.createElement('div');o.id='warn-overlay';o.className='warn-overlay';o.hidden=true;
    o.innerHTML='<div class="warn-card" role="alertdialog" aria-modal="true" aria-labelledby="warn-title"><div class="warn-sign" aria-hidden="true">⚠️</div><p class="warn-top">ATTENTION</p><h2 id="warn-title"></h2><button type="button" id="warn-ok" disabled>OK… 🤐</button></div>';
    document.body.appendChild(o);o.querySelector('#warn-ok').addEventListener('click',()=>{o.hidden=true;});return o;
  }
  function spamEl(){
    let o=$('spam-alert');if(o)return o;
    o=document.createElement('div');o.id='spam-alert';o.className='spam-alert';o.hidden=true;document.body.appendChild(o);
    o.addEventListener('click',async e=>{const b=e.target.closest('[data-spam]');if(!b)return;const key=o.dataset.key,target=Number(o.dataset.player),body=o.dataset.body;
      if(b.dataset.spam==='ignore'){spamDismissed.add(key);o.hidden=true;return;}
      if(await modAction(target,b.dataset.spam,body,b)){spamDismissed.add(key);o.hidden=true;}});
    return o;
  }
  function modPresence(r){
    // le panneau « ferme ta… » pour le joueur visé
    if(r.warn&&r.warn.id&&selectedPlayer&&Number(r.warn.id)>warnSeen){
      warnSeen=Number(r.warn.id);try{localStorage.setItem('yeti-warn-seen',String(warnSeen));}catch(_){}
      const o=warnEl();o.querySelector('#warn-title').innerHTML=`<b>${escape(r.warn.from||'Un modo')}</b> te dit de fermer ta sale gueule.`;
      const ok=o.querySelector('#warn-ok');ok.disabled=true;setTimeout(()=>{ok.disabled=false;},2500);o.hidden=false;
      try{navigator.vibrate&&navigator.vibrate([200,100,200,100,400]);}catch(_){}
    }
    // alerte spam pour les modos
    if(!isMod()){const o=$('spam-alert');if(o)o.hidden=true;return;}
    const items=(Array.isArray(r.spam)?r.spam:[]).filter(x=>Number(x.player)!==authed);
    const it=items.find(x=>!spamDismissed.has(`${x.player}|${String(x.body).trim().toLowerCase()}|${x.n}`));
    const o=spamEl();
    if(!it){o.hidden=true;return;}
    const key=`${it.player}|${String(it.body).trim().toLowerCase()}|${it.n}`;if(!o.hidden&&o.dataset.key===key)return;
    const p=player(Number(it.player));o.dataset.key=key;o.dataset.player=it.player;o.dataset.body=it.body;
    o.innerHTML=`<p><b>🚨 ${escape(cn(p))}</b> a envoyé <b>${it.n} fois</b> le même message : « ${escape(plainBody(it.body).slice(0,80))} »</p><div class="spam-actions"><button type="button" data-spam="purge">🗑️ Supprimer ces messages</button>${p.mod?'':'<button type="button" data-spam="ban30">⛔ Ban 30 s</button><button type="button" data-spam="ban60">⛔ Ban 1 min</button>'}<button type="button" class="ghost" data-spam="ignore">Ignorer</button></div>`;
    o.hidden=false;
  }
  // ---------- Messages écran : un texte + un GIF en fond, en grand sur l'écran de quelqu'un (3 par quart d'heure) ----------
  let popSeen=0,popQueue=[],popShowing=false,popTarget=0,popGif='',popGifOffset=0,popGifQ='',popGifTimer=0,popSeq=0;
  try{popSeen=Number(localStorage.getItem('yeti-pop-seen'))||0;}catch(_){}
  function popPresence(list){
    if(!selectedPlayer)return;
    for(const x of list){const id=Number(x.id);if(id>popSeen&&!popQueue.some(q=>q.id===id)){popQueue.push({...x,id});}}
    popQueue.sort((a,b)=>a.id-b.id);showNextPop();
  }
  function showNextPop(){
    if(popShowing||!popQueue.length)return;const x=popQueue.shift();popShowing=true;
    popSeen=Math.max(popSeen,x.id);try{localStorage.setItem('yeti-pop-seen',String(popSeen));}catch(_){}
    let o=$('pop-show');if(!o){o=document.createElement('div');o.id='pop-show';o.className='pop-show';document.body.appendChild(o);
      o.addEventListener('click',e=>{if(o.dataset.ready!=='1')return;if(e.target.closest('.pop-close')||e.target===o||e.target.closest('.pop-inner')){o.hidden=true;popShowing=false;setTimeout(showNextPop,300);}});}
    const gif=/^[A-Za-z0-9]{5,40}$/.test(x.gif||'')?`https://media.giphy.com/media/${x.gif}/giphy.webp`:'';
    o.style.setProperty('--pop-bg',gif?`url("${gif}")`:'none');o.classList.toggle('nogif',!gif);
    o.innerHTML=`<div class="pop-bg"></div><div class="pop-inner"><p class="pop-from">💥 Message de <b>${escape(x.from||'?')}</b></p><p class="pop-text">${escape(x.text||'')}</p><button type="button" class="pop-close" disabled>Fermer</button></div>`;
    o.dataset.ready='0';o.hidden=false;setTimeout(()=>{o.dataset.ready='1';const b=o.querySelector('.pop-close');if(b)b.disabled=false;},1500);
    try{navigator.vibrate&&navigator.vibrate([120,80,120]);}catch(_){}
  }
  function popEl(){
    let o=$('pop-compose');if(o)return o;
    o=document.createElement('div');o.className='access-overlay';o.id='pop-compose';o.hidden=true;
    o.innerHTML=`<form class="access-card pop-card" role="dialog" aria-modal="true" aria-labelledby="pop-title">
      <div class="pop-head"><span class="pop-icon" aria-hidden="true">💥</span><div><p class="eyebrow">MESSAGE ÉCRAN · 3 PAR QUART D’HEURE</p><h2 id="pop-title">Envahis l’écran de quelqu’un</h2></div><button type="button" class="pop-x" id="pop-x" aria-label="Fermer">✕</button></div>
      <p class="pop-step"><b>1</b> Pour qui ?</p><div class="pop-targets" id="pop-targets"></div>
      <p class="pop-step"><b>2</b> Ton message <small id="pop-count">0/120</small></p><input id="pop-text" class="pop-input" type="text" maxlength="120" autocomplete="off" placeholder="Ex. : T’as vu mon score ? 😎">
      <p class="pop-step"><b>3</b> Le GIF en fond</p>
      <div class="pop-preview" id="pop-preview"><div class="pop-preview-bg" id="pop-preview-bg"></div><p class="pop-preview-text" id="pop-preview-text">Ton message ici</p><span class="pop-preview-hint" id="pop-preview-hint">Aperçu · choisis un GIF ci-dessous</span></div>
      <input id="pop-q" class="pop-input" type="search" placeholder="🔍 Chercher un GIF (ex. : rire, bravo, chat…)" autocomplete="off" enterkeyhint="search">
      <div class="pop-gifs" id="pop-gifs"></div><button type="button" class="pop-more" id="pop-more" hidden>Plus de GIFs</button>
      <div class="pop-foot"><button type="submit" class="primary-button" id="pop-send" disabled>💥 Envoyer</button><p id="pop-error" role="alert"></p></div></form>`;
    document.body.appendChild(o);
    const upd=()=>{const t=$('pop-text').value.trim();$('pop-count').textContent=`${$('pop-text').value.length}/120`;$('pop-send').disabled=!(popTarget&&t&&popGif);
      $('pop-preview-text').textContent=t||'Ton message ici';$('pop-preview').classList.toggle('has-gif',!!popGif);
      $('pop-preview-bg').style.backgroundImage=popGif?`url("https://media.giphy.com/media/${popGif}/giphy.webp")`:'none';
      $('pop-preview-hint').textContent=popGif?'Aperçu de ce qu’il verra':'Aperçu · choisis un GIF ci-dessous';};
    o._upd=upd;
    $('pop-text').addEventListener('input',upd);
    $('pop-targets').addEventListener('click',e=>{const b=e.target.closest('[data-pop-to]');if(!b)return;popTarget=Number(b.dataset.popTo);renderPopTargets();upd();});
    $('pop-gifs').addEventListener('click',e=>{const b=e.target.closest('[data-pop-gif]');if(b){popGif=b.dataset.popGif;$('pop-gifs').querySelectorAll('[data-pop-gif]').forEach(x=>x.classList.toggle('on',x===b));upd();}});
    $('pop-more').addEventListener('click',()=>loadPopGifs(true));$('pop-x').addEventListener('click',()=>{o.hidden=true;});
    $('pop-q').addEventListener('input',()=>{popGifQ=$('pop-q').value;clearTimeout(popGifTimer);popGifTimer=setTimeout(()=>{if(popGifQ.trim().length!==1)loadPopGifs(false);},500);});
    $('pop-q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(popGifTimer);popGifQ=$('pop-q').value;loadPopGifs(false);}});
    o.addEventListener('click',e=>{if(e.target===o)o.hidden=true;});
    o.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const s=getSession();
      if(!s||!authed||s.player!==authed){$('pop-error').textContent='Connecte-toi pour envoyer ça.';return;}
      $('pop-send').disabled=true;$('pop-error').textContent='';
      try{const r=await request('/api/popup',{player:authed,token:s.token,target:popTarget,text:$('pop-text').value,gif:popGif});
        o.hidden=true;showToast(`💥 Envoyé à ${cn(player(popTarget))} ! ${r&&r.left>0?`Encore ${r.left} possible${r.left>1?'s':''} ce quart d’heure.`:'C’était ton dernier pour ce quart d’heure.'}`);
      }catch(err){$('pop-error').textContent=err.message||'Envoi impossible.';$('pop-send').disabled=false;}});
    return o;
  }
  function renderPopTargets(){$('pop-targets').innerHTML=PLAYERS.filter(p=>p.id!==authed).map(p=>`<button type="button" class="pop-to ${popTarget===p.id?'on':''}" data-pop-to="${p.id}">${avatar(p)}<span>${escape(cn(p))}</span>${online.has(p.id)?'<i class="online-mini"></i>':''}</button>`).join('');}
  async function loadPopGifs(more){
    const grid=$('pop-gifs'),cfg=window.YETI_CONFIG||{},code=clubCode();if(!code||!cfg.supabaseUrl){grid.innerHTML='<p class="gif-empty">GIF indisponibles.</p>';return;}
    if(!more){popGifOffset=0;grid.innerHTML='<p class="gif-empty">Chargement…</p>';}
    const seq=++popSeq,q=popGifQ.trim();
    try{const j=await giphyGet(`${cfg.supabaseUrl}/functions/v1/yeti-giphy?code=${encodeURIComponent(code)}&q=${encodeURIComponent(q)}&offset=${popGifOffset}`);if(seq!==popSeq)return;
      const items=(j.data||[]).filter(g=>/^[A-Za-z0-9]{5,40}$/.test(g.id)).map(g=>`<button type="button" data-pop-gif="${g.id}" class="${g.id===popGif?'on':''}"><img src="${escape(g.url||`https://media.giphy.com/media/${g.id}/100w.webp`)}" alt="${escape(g.title||'GIF')}" loading="lazy"></button>`).join('');
      if(!more){grid.innerHTML=items||'<p class="gif-empty">Aucun GIF trouvé.</p>';grid.scrollTop=0;}else grid.insertAdjacentHTML('beforeend',items);
      popGifOffset+=(j.data||[]).length;$('pop-more').hidden=!(j.total>popGifOffset&&popGifOffset<240);
    }catch(e){if(seq===popSeq&&!more)grid.innerHTML='<p class="gif-empty">GIPHY ne répond pas, réessaie.</p>';}
  }
  $('chat-pop').addEventListener('click',()=>{if(!authed||authed!==selectedPlayer){showToast('Connecte-toi pour envoyer un message écran.');return;}
    const o=popEl();closePicker();$('pop-error').textContent='';$('pop-send').disabled=true;popGif='';$('pop-text').value='';$('pop-count').textContent='0/120';$('pop-q').value='';popGifQ='';
    renderPopTargets();if(o._upd)o._upd();o.hidden=false;loadPopGifs(false);setTimeout(()=>$('pop-text').focus(),60);});
  // ---------- « … est en train d'écrire » ----------
  let typingSent=0,typingOn=false,chatTyping=[];
  function sendTyping(on){const s=getSession();if(!s||!authed||s.player!==authed)return;typingOn=on;typingSent=on?Date.now():0;request('/api/typing',{player:authed,token:s.token,on}).catch(()=>{});}
  $('chat-input').addEventListener('input',()=>{const v=$('chat-input').value.trim();if(v&&(!typingOn||Date.now()-typingSent>2500))sendTyping(true);else if(!v&&typingOn)sendTyping(false);});
  $('chat-input').addEventListener('blur',()=>{if(typingOn)sendTyping(false);});
  function renderTyping(){
    let el=$('chat-typing');if(!el){el=document.createElement('div');el.id='chat-typing';el.className='chat-typing';el.setAttribute('aria-live','polite');$('chat-list').insertAdjacentElement('afterend',el);}
    const names=chatTyping.filter(id=>id!==selectedPlayer).map(id=>escape(cn(player(id))));
    if(!names.length){el.hidden=true;el.innerHTML='';return;}
    const who=names.length===1?`${names[0]} est en train d’écrire`:names.length===2?`${names[0]} et ${names[1]} écrivent`:`${names.length} personnes écrivent`;
    el.innerHTML=`<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${who}</span>`;el.hidden=false;
  }
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
    if(clean&&what){const u=new URL(location.href);u.searchParams.delete('open');u.searchParams.delete('id');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}
    if(what==='chat')toggleChat(true);
    if(what==='duel'||what==='game'){competTab='duel';renderCompet();const c=$('compet');if(c)c.scrollIntoView({behavior:'smooth',block:'start'});}
    if(what==='game'){let gid=0;try{gid=Number(new URL(url,location.href).searchParams.get('id'))||0;}catch(_){}if(gid){const go=()=>{if(selectedPlayer&&lastStateSig)openBoard(gid);else setTimeout(go,800);};go();}}
    if(what==='top'){const c=document.querySelector('.top-card');if(c)c.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;renderAppButtons();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;renderAppButtons();showToast('📲 Appli installée ! Ouvre-la depuis ton écran d’accueil.');});
  function renderAppButtons(){
    const inst=$('install-app'),nb=$('notif-btn');
    inst.hidden=isStandalone()||!(installPrompt||isIOS||isAndroid);
    const logged=!!authed&&authed===selectedPlayer;
    if(!logged){nb.hidden=true;return;}
    if(!pushOK()){nb.hidden=!((isIOS&&!isStandalone())||isAndroid);nb.textContent='🔔 Notifs';nb.className='app-button';return;}
    nb.hidden=false;
    const perm=Notification.permission;
    nb.textContent=perm==='denied'?'🔕 Notifs bloquées':pushOn?'🔔 Notifs activées':'🔔 Activer les notifs';
    nb.className='app-button'+(pushOn?' on':perm==='denied'?' off':'');
  }
  function b64u(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
  function pushDiag(step,msg){try{const s=getSession();request('/api/push/diag',{player:authed||0,token:s&&s.token||'',step,msg:String(msg||'').slice(0,300),ua:navigator.userAgent.slice(0,300)}).catch(()=>{});}catch(_){}}
  const sameKey=(a,b)=>{if(!a||!b||a.byteLength!==b.byteLength)return false;const x=new Uint8Array(a),y=new Uint8Array(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;return true;};
  async function syncPush(ask){
    let step='start';
    try{
      if(!authed||authed!==selectedPlayer){renderAppButtons();return false;}
      if(!pushOK()){if(ask){pushDiag('unsupported','');showInstallHelp(true);}renderAppButtons();return false;}
      step='sw';
      if(!swReg){try{swReg=await navigator.serviceWorker.register('sw.js');}catch(e){throw new Error('Service worker impossible : '+(e.message||e));}}
      if(Notification.permission!=='granted'){
        if(!ask||Notification.permission==='denied'){pushOn=false;renderAppButtons();if(ask)pushDiag('denied','');return false;}
        step='permission';
        const p=await Notification.requestPermission();
        if(p!=='granted'){pushOn=false;renderAppButtons();pushDiag('permission',p);
          showToast(p==='denied'?'Notifications refusées. Pour changer : réglages du téléphone → Applis → Chrome (ou Yeti rich club) → Notifications.'
            :'Le navigateur n’a pas affiché la demande. Touche le cadenas 🔒 à gauche de l’adresse → Autorisations → Notifications → Autoriser, puis réessaie.');
          return false;}
      }
      step='ready';const reg=await navigator.serviceWorker.ready.catch(()=>swReg)||swReg;swReg=reg;
      step='subscribe';
      const appKey=b64u(window.YETI_CONFIG.vapidPublicKey);
      let sub=await reg.pushManager.getSubscription();
      if(sub&&sub.options&&sub.options.applicationServerKey&&!sameKey(sub.options.applicationServerKey,appKey.buffer)){try{await sub.unsubscribe();}catch(_){}sub=null;}
      if(!sub){
        try{sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:appKey});}
        catch(e){const old=await reg.pushManager.getSubscription();if(old){try{await old.unsubscribe();}catch(_){}}
          sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:appKey});}
      }
      step='session';const s=getSession();if(!s||s.player!==authed){renderAppButtons();return false;}
      const key=sub.endpoint+'|'+authed;
      step='save';
      if(key!==pushKey||ask){await request('/api/push',{player:authed,token:s.token,sub:{...sub.toJSON(),ua:navigator.userAgent.slice(0,300)}});pushKey=key;}
      if(ask)pushDiag('ok',sub.endpoint.slice(0,60));
      pushOn=true;renderAppButtons();return true;
    }catch(error){
      const m=(error&&(error.name?error.name+': ':'')+(error.message||error))||'?';pushDiag(step,m);
      if(ask)showToast('Impossible d’activer les notifications ('+step+') : '+(error.message||error)+(isAndroid?' — essaie dans Chrome (pas Samsung Internet ni le navigateur d’Insta/Snap).':''));
      pushOn=false;renderAppButtons();return false;}
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
    if(pushOn||await syncPush(true)){
      try{const s=getSession();const r=await request('/api/push/test',{player:authed,token:s&&s.token||''});
        showToast(`🔔 Notifs activées ! Notif de test envoyée sur ${r&&r.devices||0} appareil(s) — elle doit arriver dans quelques secondes.`);}
      catch(e){showToast('🔔 Notifs activées, mais le test a échoué : '+(e.message||e));}
    }
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
  // L'admin a demandé de changer le mot de passe : on enchaîne directement sur le nouveau.
  function askNewPassword(id,token){
    const p=player(id),o=$('pin-overlay');
    $('pin-eyebrow').textContent='NOUVEAU MOT DE PASSE';
    $('pin-title').textContent=`${p.name}, change ton mot de passe`;
    $('pin-text').textContent='L’admin te demande de choisir un nouveau mot de passe (4 caractères minimum, différent de l’ancien) avant de continuer.';
    $('pin-confirm-wrap').hidden=false;$('pin-confirm').required=true;$('pin-input').setAttribute('autocomplete','new-password');
    $('pin-input').value='';$('pin-confirm').value='';$('pin-error').textContent='';
    $('pin-submit').textContent='Changer mon mot de passe →';
    o.dataset.player=id;o.dataset.mode='change';o.dataset.token=token;o.hidden=false;
    setTimeout(()=>$('pin-input').focus(),50);
  }
  function closePin(ok){$('pin-overlay').hidden=true;const r=pinResolve;pinResolve=null;if(r)r(ok);}
  $('pin-cancel').addEventListener('click',()=>{$('pin-overlay').dataset.token='';closePin(false);});
  $('pin-form').addEventListener('submit',async e=>{
    e.preventDefault();const o=$('pin-overlay'),id=Number(o.dataset.player),mode=o.dataset.mode,create=mode==='create'||mode==='change',pw=$('pin-input').value;
    if(pw.length<4){$('pin-error').textContent='4 caractères minimum.';return;}
    if(create&&pw!==$('pin-confirm').value){$('pin-error').textContent='Les deux mots de passe ne sont pas identiques.';return;}
    $('pin-submit').disabled=true;$('pin-error').textContent='';
    try{
      if(mode==='change'){
        const r=await request('/api/password/change',{player:id,token:o.dataset.token||'',password:pw});
        if(!r||!r.ok||!r.token){$('pin-error').textContent='Changement impossible, réessaie.';return;}
        setSession({player:id,token:r.token});o.dataset.token='';closePin(true);showToast('🔒 Nouveau mot de passe enregistré. Garde-le bien !');return;
      }
      const r=await request(mode==='create'?'/api/password':'/api/login',{player:id,password:pw});
      if(!r||!r.ok||!r.token){$('pin-error').textContent='Mauvais mot de passe.';$('pin-input').select();return;}
      const p=PLAYERS.find(x=>x.id===id);if(p)p.locked=true;
      if(r.must_change){askNewPassword(id,r.token);return;}
      setSession({player:id,token:r.token});
      closePin(true);if(mode==='create')showToast('🔒 Mot de passe créé. Garde-le bien !');
    }catch(error){
      const msg=error.message||'Connexion impossible pour le moment.';
      if(mode==='create'&&/déjà un mot de passe/.test(msg)){const p=PLAYERS.find(x=>x.id===id);if(p)p.locked=true;const r=pinResolve;pinResolve=null;askPassword(id).then(r);$('pin-error').textContent='Ce prénom a déjà un mot de passe.';return;}
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
  function showBan(id){$('ban-text').textContent=`${player(id).name} est ${banPerm(id)?'exclu définitivement par l’admin. Plus de jeu ni de chat.':`banni par l’admin jusqu’à ${hhmm(bans[id])}. Pas de jeu ni de chat d’ici là.`}`;$('ban-overlay').hidden=false;}
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
      return `<div class="admin-row ${b?'banned':''}"><div class="admin-who">${avatar(p)}<span><b>${escape(p.name)}</b><small>${b?`⛔ ${banText(p.id)}`:online.has(p.id)?'🟢 en ligne':'hors ligne'}${p.muted?' · 🔕 notifs chat coupées':''}</small></span></div><div class="admin-actions">${BAN_TIMES.map(m=>`<button type="button" data-ban="${p.id}" data-min="${m}">${m<60?m+' min':m/60+' h'}</button>`).join('')}${banPerm(p.id)&&b?'':`<button type="button" class="perm" data-ban="${p.id}" data-min="-1">🚫 Définitif</button>`}${b?`<button type="button" class="unban" data-ban="${p.id}" data-min="0">Débannir</button>`:''}<button type="button" class="mute ${p.muted?'on':''}" data-mute="${p.id}">${p.muted?'🔔 Remettre les notifs chat':'🔕 Couper les notifs chat'}</button></div></div>`;}).join('')||'<p class="br-empty">Personne à virer.</p>';
  }
  $('admin-open').addEventListener('click',()=>{$('admin-error').textContent='';renderAdmin();$('admin-overlay').hidden=false;});
  $('admin-close').addEventListener('click',()=>{$('admin-overlay').hidden=true;});
  $('admin-overlay').addEventListener('click',e=>{if(e.target===e.currentTarget)$('admin-overlay').hidden=true;});
  $('admin-list').addEventListener('click',async e=>{
    const mb=e.target.closest('[data-mute]');
    if(mb){const target=Number(mb.dataset.mute),s=getSession(),p=PLAYERS.find(x=>x.id===target);if(!p)return;
      if(!s||s.player!==authed){$('admin-error').textContent='Reconnecte-toi en tant qu’admin.';return;}
      mb.disabled=true;$('admin-error').textContent='';
      try{const r=await request('/api/mute',{admin:authed,token:s.token,target,muted:!p.muted});p.muted=!!r.muted;renderAdmin();
        showToast(p.muted?`🔕 ${p.name} n’aura plus de notifs du chat.`:`🔔 ${p.name} a de nouveau les notifs du chat.`);}
      catch(error){$('admin-error').textContent=error.message||'Action impossible.';mb.disabled=false;}
      return;}
    const b=e.target.closest('[data-ban]');if(!b)return;const target=Number(b.dataset.ban),minutes=Number(b.dataset.min),s=getSession();
    if(minutes===-1&&!b.dataset.sure){b.dataset.sure='1';b.textContent='Confirmer l’exclusion ?';b.classList.add('sure');setTimeout(()=>{if(b.isConnected){delete b.dataset.sure;b.textContent='🚫 Définitif';b.classList.remove('sure');}},4000);return;}
    if(!s||s.player!==authed){$('admin-error').textContent='Reconnecte-toi en tant qu’admin.';return;}
    b.disabled=true;$('admin-error').textContent='';
    try{const r=await request('/api/ban',{admin:authed,token:s.token,target,minutes});
      if(r.banned_until)bans[target]=r.banned_until;else delete bans[target];
      online.delete(target);renderAdmin();renderProfiles();
      showToast(minutes===-1?`🚫 ${player(target).name} est exclu définitivement.`:minutes?`⛔ ${player(target).name} est viré pour ${minutes<60?minutes+' min':minutes/60+' h'}.`:`✅ ${player(target).name} est débanni.`);
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
