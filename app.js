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
  function showToast(message) { clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4500); }
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
    $('profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button ${selectedPlayer===p.id?'active':''}" data-player="${p.id}" type="button" aria-pressed="${selectedPlayer===p.id}" ${busy}><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</button>`).join('')+add;
    $('cover-profiles').innerHTML=PLAYERS.map(p=>`<button class="profile-button" data-player="${p.id}" type="button"><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</button>`).join('')+add;
    $('round-tag').textContent=activeRound?'Lancer en cours…':'Prêt pour le lancer';
    $('restart-game').disabled=!gameLoaded||!!activeRound||loadingGame;
    if(typeof renderSkins==='function')renderSkins();
  }
  async function choosePlayer(id) {
    if(activeRound||loadingGame||privateAccess)return;
    selectedPlayer=id;persist();renderProfiles();$('game-cover').hidden=true;
    renderSkins();
    if(!gameLoaded||loadedSkin!==gameKey(id))await loadGame();else showToast('Tu joues avec '+player(id).name+'.');
  }
  function handleTrace(message) {
    const text=String(message).trim();
    if(text==='YETI_START') {
      if(selectedPlayer&&!activeRound) { activeRound={id:uuid(),player:selectedPlayer};renderProfiles(); }
      return;
    }
    const match=/^YETI_SCORE:([0-9]+(?:[.,][0-9]+)?)$/.exec(text);
    if(!match||!activeRound)return;
    const value=Number(match[1].replace(',','.'));if(!Number.isFinite(value)||value<0||value>1000000)return;
    const round=activeRound;activeRound=null;
    const score={id:round.id,player:round.player,played_at:new Date().toISOString(),score:Math.round(value*100)/100};
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
      if(gameKey(score.player)!==loadedSkin)setTimeout(()=>{if(!activeRound&&!loadingGame&&selectedPlayer===score.player)loadGame();},3500);
    }
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
      await playerApi.load({...(data?{data}:{url:'game.swf'}),autoplay:'on',backgroundColor:'#c9e8f7',allowScriptAccess:false,allowNetworking:'none',openUrlMode:'deny',splashScreen:false,contextMenu:'off',warnOnUnsupportedContent:false});
      playerApi.traceObserver=handleTrace;gameLoaded=true;loadedSkin=key;
    } catch(error) {
      gameLoaded=false;showToast(error.message||'Le jeu ne démarre pas. Réessaie en rechargeant la page.');$('game-cover').hidden=false;
    } finally { loadingGame=false;$('game-loading').hidden=true;renderProfiles(); }
  }
  async function refresh() {
    try {
      const data=await request('/api/state');
      if(!data||!Array.isArray(data.scores))throw new Error('Historique indisponible.');
      setPlayers(data.players);
      serverScores=data.scores.map(s=>({...s,player:Number(s.player),score:Number(s.score)})).filter(validScore);
      privateAccess=false;$('access-overlay').hidden=true;setConnection(true);render();
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
          const accepted=new Set(result.accepted);if(!batch.some(s=>accepted.has(s.id)))throw new Error('Aucun lancer confirmé.');
          batch.filter(s=>accepted.has(s.id)).forEach(s=>{if(!serverScores.some(r=>r.id===s.id))serverScores.push(s);});
          outbox=outbox.filter(s=>!accepted.has(s.id));persist();lastSaveError='';setConnection(true);render();
        }
        return true;
      } catch(error) {
        lastSaveError=error.message||'Enregistrement momentanément indisponible.';
        if(error.status===401||error.code==='private_access_required'){privateAccess=true;$('access-overlay').hidden=false;}
        setConnection(false,'Lancers en attente');render();return false;
      } finally { flushing=null;renderSaveStatus(); }
    })();return flushing;
  }
  function renderLeaderboard(scores) {
    const records=PLAYERS.map(p=>({...p,...stats(scores.filter(s=>s.player===p.id))})).sort((a,b)=>(b.best??-1)-(a.best??-1)||a.id-b.id);
    let rank=0,previous=null;
    $('leaderboard').innerHTML=records.map((p,index)=>{
      if(p.best!==previous||index===0)rank=index+1;previous=p.best;
      return `<div class="ranking-row ${rank===1&&p.best!==null?'leader':''}"><span class="rank-number">${p.count?String(rank).padStart(2,'0'):'—'}</span><div><div class="ranking-name"><span class="player-dot" style="background:${p.color}"></span>${escape(p.name)}</div><div class="ranking-sub">${p.count?`${p.count} lancer${p.count>1?'s':''} · moy. ${oneDecimal.format(p.average)} m`:'Le sommet attend'}</div></div><div class="ranking-score">${p.best===null?'—':number.format(p.best)}<small>mètres</small></div></div>`;
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
    const fresh=all.filter(s=>!knownScoreIds.has(s.id));fresh.forEach(s=>knownScoreIds.add(s.id));
    const crack=fresh.filter(s=>s.score>=400).sort((a,b)=>b.score-a.score)[0];
    if(crack){$('crack-alert-text').textContent=player(crack.player).name+' vient d’envoyer '+number.format(crack.score)+' m';$('crack-alert').hidden=false;clearTimeout(crackTimer);crackTimer=setTimeout(()=>$('crack-alert').hidden=true,7000);}
  }
  let loadedSkin=null,skinChoices={};
  try{skinChoices=JSON.parse(localStorage.getItem('yeti-skins')||'{}')||{};}catch(_){}
  function bestOf(id){return stats(allScores().filter(s=>s.player===id)).best||0;}
  function skinState(id){return window.YetiSkins&&id?window.YetiSkins.evaluate(allScores().filter(s=>s.player===id)):null;}
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
  const SKIN_GROUPS=[['base','Départ'],['record','Paliers de record'],['defi','Défis'],['ultra','Ultra rares'],['curse','Malédictions']];
  function renderSkins(){
    const box=$('skins');if(!box||!window.YetiSkins)return;
    const st=skinState(selectedPlayer),current=skinFor(selectedPlayer),list=window.YetiSkins.list,busy=activeRound||loadingGame;
    const pod={gold:' · 🥇 pingouin en or massif',silver:' · 🥈 pingouin en argent massif',bronze:' · 🥉 pingouin en bronze massif'}[podiumOf(selectedPlayer)]||'';
    const name=selectedPlayer?player(selectedPlayer).name:'';
    $('skin-hint').textContent=!st?'Choisis ton pseudo pour voir tes skins.':`${name} · ${st.unlocked.size}/${list.filter(k=>k.kind!=='curse').length} skins`+(st.next?` · prochain palier à ${st.next.min} m`:'')+pod;
    $('skin-curse').hidden=!(st&&st.curse);
    if(st&&st.curse)$('skin-curse').innerHTML=`<span class="curse-emoji">${st.curse.emoji}</span><div><strong>Malédiction : ${escape(st.curse.name)}</strong><span>${escape(st.curse.tag)}. ${escape(st.curse.until)}</span></div>`;
    box.innerHTML=SKIN_GROUPS.map(([kind,label])=>{
      const cards=list.filter(k=>k.kind===kind).map(k=>{
        const curse=kind==='curse',open=!!st&&(curse?st.curse&&st.curse.id===k.id:st.unlocked.has(k.id)),active=!!st&&k.id===current;
        const cond=k.kind==='record'?k.min+' m de record':k.tag;
        const sub=active?(curse?'Imposé':'Équipé'):open?(curse?'En cours':escape(k.kind==='record'?k.tag:'Débloqué')):(curse?escape(cond):'🔒 '+escape(cond));
        const can=open&&!curse&&!busy&&!(st&&st.curse);
        return `<button type="button" class="skin-card kind-${k.kind} ${active?'active':''} ${open?'':'locked'} ${k.id==='prime'?'prime':''}" data-skin="${k.id}" ${can?'':'disabled'} aria-pressed="${active}" title="${escape(k.name+' — '+cond)}"><span class="skin-emoji">${k.emoji||'<span class=\'skin-yeti\'>Y.</span>'}</span><span class="skin-name">${escape(k.name)}</span><span class="skin-min">${sub}</span></button>`;
      }).join('');
      return `<div class="skin-group"><span class="skin-group-label">${label}</span><div class="skin-group-cards">${cards}</div></div>`;
    }).join('');
  }
  async function chooseSkin(id){
    if(!selectedPlayer||activeRound||loadingGame)return;
    const k=window.YetiSkins.byId(id),st=skinState(selectedPlayer);if(!st||st.curse||!st.unlocked.has(id))return;
    skinChoices[selectedPlayer]=id;try{localStorage.setItem('yeti-skins',JSON.stringify(skinChoices));}catch(_){}
    renderSkins();if(gameLoaded&&loadedSkin!==gameKey(selectedPlayer)){await loadGame();showToast(`${k.emoji||''} ${k.name} est sur la banquise.`);}
  }
  function render() { const scores=filteredScores();renderLeaderboard(scores);renderMetrics(scores);renderTrend(scores);renderHistory(scores);renderTicker();announceNewScores();renderSkins(); }

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
    if(polling||document.hidden||privateAccess)return;polling=true;
    try{
      if(outbox.length)await flushScores();
      let changed=Date.now()-lastFull>30000;
      try{const v=await request('/api/version');if(v&&v.version){if(v.version!==lastVersion){changed=true;lastVersion=v.version;}}}
      catch(error){if(error.status===401){changed=true;}else if(Date.now()-lastFull>10000)changed=true;}
      if(changed){lastFull=Date.now();await refresh();}
    }finally{polling=false;}
  }
  setInterval(poll,2000);
  renderPlayerOptions();renderProfiles();render();renderSaveStatus();
  (async()=>{
    const fragment=new URLSearchParams(location.hash.slice(1));const code=fragment.get('club');
    if(code){try{await request('/api/unlock',{code});history.replaceState(null,'',location.pathname+location.search);}catch(error){$('access-error').textContent=error.message||'Le lien privé n’est pas reconnu.';}}
    await refresh();await flushScores();
  })();
})();
