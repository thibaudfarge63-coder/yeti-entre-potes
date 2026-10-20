/* Shared scores through Supabase. Only a publishable/anon key belongs in config.js. */
(() => {
  'use strict';

  const memoryCodes = new Map();
  let inviteValidation = null;

  function failure(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
  }

  function settings() {
    const raw = window.YETI_CONFIG || {};
    let base;
    try {
      base = new URL(raw.supabaseUrl);
    } catch (_) {
      throw failure('La connexion aux scores partagés reste à configurer.', 503, 'not_configured');
    }
    const key = typeof raw.publishableKey === 'string' ? raw.publishableKey.trim() : '';
    if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(base.hostname) ||
        base.username || base.password || base.search || base.hash ||
        base.pathname !== '/' || !key || key.startsWith('sb_secret_')) {
      throw failure('La connexion aux scores partagés reste à configurer.', 503, 'not_configured');
    }
    let legacy = false;
    if (!key.startsWith('sb_publishable_')) {
      try {
        const part = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const claims = JSON.parse(atob(part));
        if (claims.role !== 'anon') throw new Error('public key required');
        legacy = true;
      } catch (_) {
        throw failure('Une clé publique Supabase est nécessaire.', 503, 'not_configured');
      }
    }
    return {base: base.origin, key, legacy, storageKey: `yeti:room:${base.origin}`};
  }

  function storedCode(config) {
    try {
      return window.localStorage.getItem(config.storageKey) || memoryCodes.get(config.storageKey) || '';
    } catch (_) {
      return memoryCodes.get(config.storageKey) || '';
    }
  }

  function saveCode(config, code) {
    memoryCodes.set(config.storageKey, code);
    try { window.localStorage.setItem(config.storageKey, code); } catch (_) { /* Private browsing fallback. */ }
  }

  function forgetCode(config) {
    memoryCodes.delete(config.storageKey);
    try { window.localStorage.removeItem(config.storageKey); } catch (_) { /* No persistent storage. */ }
  }

  function accessRequired() {
    return failure('Entre le code de votre groupe pour retrouver les scores.', 401, 'private_access_required');
  }

  function inviteCode() {
    return new URLSearchParams(window.location.hash.slice(1)).get('club') || '';
  }

  function removeInviteFragment() {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!fragment.has('club')) return;
    fragment.delete('club');
    url.hash = fragment.toString();
    window.history.replaceState(window.history.state, '', url.href);
  }

  async function rpc(config, name, args) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const headers = {'Content-Type': 'application/json', apikey: config.key};
    if (config.legacy) headers.Authorization = `Bearer ${config.key}`;
    try {
      const response = await fetch(`${config.base}/rest/v1/rpc/${name}`, {
        method: 'POST', headers, body: JSON.stringify(args),
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      let data;
      try { data = await response.json(); } catch (_) {
        throw failure('Le serveur de scores ne répond pas correctement.', 503, 'invalid_response');
      }
      if (!response.ok) {
        if (data && data.code === '28000') throw accessRequired();
        if (data && (data.code === 'PGRST202' || data.code === '42883')) {
          throw failure('L’ajout de joueurs n’est pas encore activé sur le serveur du club.', 501, 'not_supported');
        }
        if (data && data.code === '23505') throw failure('Ce joueur existe déjà.', 409, 'duplicate_player');
        if (data && data.code === '22023' && (name === 'yeti_send_message' || name === 'yeti_create_duel' || name === 'yeti_answer_duel' || name === 'yeti_set_password' || name === 'yeti_change_password' || name === 'yeti_login' || name === 'yeti_ban' || name === 'yeti_admin_mute' || name === 'yeti_push_subscribe' || name === 'yeti_push_test' || name === 'yeti_chat_react' || name === 'yeti_admin_clear_chat' || name === 'yeti_push_diag' || name === 'yeti_create_game' || name === 'yeti_game_state' || name === 'yeti_game_move')) throw failure(data.message || 'Message refusé.', 400, 'invalid_message');
        if (data && data.code === '22023') {
          throw failure('Ces scores ne peuvent pas être enregistrés. Ils restent en attente.', 400, 'invalid_scores');
        }
        throw failure('La connexion aux scores partagés est indisponible. Réessaie dans un instant.', 503, 'unavailable');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw failure('Le serveur de scores ne répond pas correctement.', 503, 'invalid_response');
      }
      return data;
    } catch (error) {
      if (error && error.code && error.status) throw error;
      throw failure('Connexion interrompue. Les scores restent en attente dans ce navigateur.', 503, 'unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  async function readState(config, code) {
    const data = await rpc(config, 'yeti_get_state', {p_room_code: code});
    if (!Array.isArray(data.players) || !Array.isArray(data.scores)) {
      throw failure('Le serveur de scores ne répond pas correctement.', 503, 'invalid_response');
    }
    return data;
  }

  async function unlock(config, input) {
    let code = typeof input === 'string' ? input.trim() : '';
    if (code.length < 32) code = code.toUpperCase();
    if (code.length < 4 || code.length > 128) throw accessRequired();
    const state = await readState(config, code);
    saveCode(config, code);
    removeInviteFragment();
    return state;
  }

  async function validateInvite(config) {
    const invite = inviteCode();
    if (!invite) return null;
    if (!inviteValidation) {
      inviteValidation = unlock(config, invite).finally(() => { inviteValidation = null; });
    }
    return inviteValidation;
  }

  async function request(path, body) {
    const config = settings();
    if (path === '/api/unlock') {
      await unlock(config, body && body.code);
      return {ok: true};
    }
    if (path === '/api/lock') {
      forgetCode(config);
      return {ok: true};
    }
    if (path !== '/api/state' && path !== '/api/scores' && path !== '/api/players' && path !== '/api/version' && path !== '/api/chat' && path !== '/api/chat/send' && path !== '/api/chat/seen' && path !== '/api/chat/react' && path !== '/api/chat/clear' && path !== '/api/duel' && path !== '/api/duel/answer' && path !== '/api/skins' && path !== '/api/presence' && path !== '/api/password' && path !== '/api/password/change' && path !== '/api/login' && path !== '/api/session' && path !== '/api/ban' && path !== '/api/mute' && path !== '/api/push' && path !== '/api/push/test' && path !== '/api/push/diag' && path !== '/api/game/create' && path !== '/api/game/state' && path !== '/api/game/move') {
      throw failure('Cette action est introuvable.', 404, 'not_found');
    }
    const invitedState = await validateInvite(config);
    const code = storedCode(config);
    if (!code) throw accessRequired();
    try {
      if (path === '/api/state') return invitedState || await readState(config, code);
      if (path === '/api/chat') return await rpc(config, 'yeti_get_messages', {p_room_code: code, p_after: Number(body && body.after) || 0});
      if (path === '/api/duel/answer') return await rpc(config, 'yeti_answer_duel', {p_room_code: code, p_duel: Number(body.duel), p_player: Number(body.player), p_accept: !!body.accept});
      if (path === '/api/duel') return await rpc(config, 'yeti_create_duel', {p_room_code: code, p_challenger: Number(body.challenger), p_opponent: Number(body.opponent)});
      if (path === '/api/chat/send') return await rpc(config, 'yeti_send_message', {p_room_code: code, p_player: Number(body.player), p_body: String(body.body || '')});
      if (path === '/api/password/change') return await rpc(config, 'yeti_change_password', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_password: String(body.password || '')});
      if (path === '/api/password') return await rpc(config, 'yeti_set_password', {p_room_code: code, p_player: Number(body.player), p_password: String(body.password || '')});
      if (path === '/api/login') return await rpc(config, 'yeti_login', {p_room_code: code, p_player: Number(body.player), p_password: String(body.password || '')});
      if (path === '/api/session') return await rpc(config, 'yeti_check_session', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || '')});
      if (path === '/api/chat/clear') return await rpc(config, 'yeti_admin_clear_chat', {p_room_code: code, p_admin: Number(body.admin), p_token: String(body.token || '')});
      if (path === '/api/chat/react') return await rpc(config, 'yeti_chat_react', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_msg: Number(body.msg) || 0, p_emoji: String(body.emoji || '')});
      if (path === '/api/chat/seen') return await rpc(config, 'yeti_chat_seen', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_msg: Number(body.msg) || 0});
      if (path === '/api/push/test') return await rpc(config, 'yeti_push_test', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || '')});
      if (path === '/api/push/diag') return await rpc(config, 'yeti_push_diag', {p_room_code: code, p_player: Number(body.player) || 0, p_step: String(body.step || ''), p_msg: String(body.msg || ''), p_ua: String(body.ua || '')});
      if (path === '/api/push') return await rpc(config, 'yeti_push_subscribe', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_sub: body.sub || {}});
      if (path === '/api/game/create') return await rpc(config, 'yeti_create_game', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_opponent: Number(body.opponent), p_game: String(body.game || '')});
      if (path === '/api/game/state') return await rpc(config, 'yeti_game_state', {p_room_code: code, p_player: Number(body.player) || null, p_token: String(body.token || ''), p_duel: Number(body.duel)});
      if (path === '/api/game/move') return await rpc(config, 'yeti_game_move', {p_room_code: code, p_player: Number(body.player), p_token: String(body.token || ''), p_duel: Number(body.duel), p_ply: Number(body.ply) || 0, p_move: body.move || {}});
      if (path === '/api/mute') return await rpc(config, 'yeti_admin_mute', {p_room_code: code, p_admin: Number(body.admin), p_token: String(body.token || ''), p_target: Number(body.target), p_muted: !!body.muted});
      if (path === '/api/ban') return await rpc(config, 'yeti_ban', {p_room_code: code, p_admin: Number(body.admin), p_token: String(body.token || ''), p_target: Number(body.target), p_minutes: Number(body.minutes)});
      if (path === '/api/presence') return await rpc(config, 'yeti_presence', {p_room_code: code, p_player: Number(body && body.player) || null});
      if (path === '/api/skins') return await rpc(config, 'yeti_save_skins', {p_room_code: code, p_player: Number(body.player), p_skins: Array.isArray(body.skins) ? body.skins.map(String).slice(0, 100) : []});
      if (path === '/api/version') return await rpc(config, 'yeti_get_version', {p_room_code: code});
      if (path === '/api/players') {
        const name = body && typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 2 || name.length > 24) throw failure('Le prénom doit faire entre 2 et 24 caractères.', 400, 'invalid_player');
        return await rpc(config, 'yeti_add_player', {p_room_code: code, p_name: name});
      }
      if (!body || !Array.isArray(body.scores)) {
        throw failure('Liste de scores requise.', 400, 'invalid_scores');
      }
      return await rpc(config, 'yeti_save_scores', {p_room_code: code, p_scores: body.scores});
    } catch (error) {
      if (error.status === 401 && error.code === 'private_access_required') forgetCode(config);
      throw error;
    }
  }

  window.YetiData = Object.freeze({
    request,
    get configured() {
      try { settings(); return true; } catch (_) { return false; }
    },
    getInviteUrl() {
      const config = settings();
      const code = storedCode(config);
      if (!code) throw accessRequired();
      const url = new URL(window.location.href);
      url.hash = new URLSearchParams({club: code}).toString();
      return url.href;
    },
  });
})();
