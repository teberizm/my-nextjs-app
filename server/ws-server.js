// ws-server.js (authoritative server: timers + roles + actions + votes + QR card draw)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// Initialize express app FIRST (the earlier snippet had `const app =` left unfinished)
const app = express();

// ---- Role display (TR) ----
const ROLE_TR = {
  DOCTOR: 'Doktor',
  GUARDIAN: 'Gardiyan',
  WATCHER: 'Gözcü',
  DETECTIVE: 'Dedektif',
  BOMBER: 'Bombacı',
  SURVIVOR: 'Survivor',
  EVIL_GUARDIAN: 'Hain gardiyan',
  EVIL_WATCHER: 'Hain gözcü',
  EVIL_DETECTIVE: 'Hain dedektif',
  DELI: 'Deli',
};
const roleTR = (code) => ROLE_TR[code] || code;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * Room structure:
 * roomId -> {
 *   players: Map<playerId, player>,
 *   sockets: Set<WebSocket>,
 *   settings: { nightDuration, dayDuration, voteDuration, cardDrawCount },
 *   state: {
 *     phase: 'LOBBY' | 'ROLE_REVEAL' | 'NIGHT' | 'NIGHT_RESULTS' | 'DEATH_ANNOUNCEMENT' |
 *            'CARD_DRAWING' | 'DAY_DISCUSSION' | 'VOTE' | 'RESOLVE' | 'END',
 *     currentTurn: number,
 *     nightActions: Array<NightAction>,
 *     votes: Record<string,string>,
 *     deathsThisTurn: Array<Player>,
 *     deathLog: Array<Player>,
 *     bombsByOwner: Record<string,string[]>,
 *     playerNotes: Record<string, string[]>,
 *     game: { startedAt: Date, endedAt?: Date, winningSide?: string } | null,
 *     phaseEndsAt: number,
 *     // Card drawing
 *     selectedCardDrawers: string[],
 *     currentCardDrawerIndex: number,
 *     currentCardDrawer: string | null,
 *     // QR card pending
 *     pendingCard: { playerId: string, token: string, effectId: string } | null
 *   },
 *   timer: NodeJS.Timeout | null
 * }
 */

const rooms = new Map();

const now = () => Date.now();
const toPlain = (obj) =>
  JSON.parse(JSON.stringify(obj, (k, v) => (v instanceof Date ? v.toISOString() : v)));

/* ---------------- QR Card system (real data from files) ---------------- */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// data klasörü server klasörünün bir üstünde beklenir: /srv/apps/myapp/data
const ROOT_DIR = path.resolve(__dirname, '..');
const QR_FILE = path.join(ROOT_DIR, 'data', 'qr-cards.js');
const EFFECTS_FILE = path.join(ROOT_DIR, 'data', 'effects-catalog.js');

console.log('QR_FILE =>', QR_FILE, 'exists=', fs.existsSync(QR_FILE));
console.log('EFFECTS_FILE =>', EFFECTS_FILE, 'exists=', fs.existsSync(EFFECTS_FILE));

function extractConstObjectFromFile(filePath, constName) {
  const code = fs.readFileSync(filePath, 'utf-8');
  // find "export const CONSTNAME" or "const CONSTNAME"
  let idx = code.indexOf('export const ' + constName);
  let exportLen = ('export const ' + constName).length;
  if (idx === -1) {
    idx = code.indexOf('const ' + constName);
    exportLen = ('const ' + constName).length;
  }
  if (idx === -1) throw new Error('Could not find const ' + constName + ' in ' + filePath);

  const eqIdx = code.indexOf('=', idx + exportLen);
  if (eqIdx === -1) throw new Error('Could not find "=" for ' + constName);

  // find first "{" after "="
  let i = eqIdx + 1;
  while (i < code.length && code[i] !== '{') i++;
  if (i >= code.length) throw new Error('Could not find object start for ' + constName);

  // bracket match
  let depth = 0;
  let start = i;
  let end = -1;
  for (let p = i; p < code.length; p++) {
    const ch = code[p];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = p; break; }
    }
  }
  if (end === -1) throw new Error('Could not find object end for ' + constName);

  const objLiteral = code.slice(start, end + 1);

  // Evaluate safely
  const script = new vm.Script('(' + objLiteral + ')');
  const sandbox = {};
  const context = vm.createContext(sandbox);
  const val = script.runInContext(context);
  return val;
}

let QR_CARDS = {};
let EFFECTS_CATALOG = {};

try {
  QR_CARDS = extractConstObjectFromFile(QR_FILE, 'QR_CARDS');
} catch (e) {
  console.error('⚠️ QR_CARDS yüklenemedi:', e.message);
  QR_CARDS = {};
}
try {
  EFFECTS_CATALOG = extractConstObjectFromFile(EFFECTS_FILE, 'EFFECTS_CATALOG');
} catch (e) {
  console.error('⚠️ EFFECTS_CATALOG yüklenemedi:', e.message);
  EFFECTS_CATALOG = {};
}

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function sendToPlayer(room, playerId, type, payload) {
  for (const s of room.sockets) {
    if (s.readyState === WebSocket.OPEN && s.playerId === playerId) {
      s.send(JSON.stringify({ type, payload, serverTime: now() }));
      break;
    }
  }
}

/* Effects are applied authoritatively on server */
function applyCardEffect(room, actorId, effectId, extra = {}) {
  const S = room.state;
  const players = Array.from(room.players.values());
  const actor = room.players.get(actorId);

  const addNote = (pid, text) => {
    S.playerNotes[pid] = [...(S.playerNotes[pid] || []), text];
  };
  const alivePlayers = () => Array.from(room.players.values()).filter((p) => p.isAlive);
  const randomAlive = () => {
    const alive = alivePlayers();
    return alive.length ? alive[Math.floor(Math.random()*alive.length)] : null;
  };
  const effect = EFFECTS_CATALOG[effectId] || null;
  const title = effect?.title || effectId;
  const desc = effect?.desc || '';

  switch (effectId) {
    /* 1 */ case 'REVIVE_RANDOM_THIS_TURN': {
      const deaths = Array.isArray(S.deathsThisTurn) ? S.deathsThisTurn : [];
      if (deaths.length === 0) return { ok: false, note: 'Bu tur kimse ölmedi.' };
      const target = randPick(deaths);
      const p = room.players.get(target.id);
      if (p) {
        p.isAlive = true;
        addNote(p.id, `${S.currentTurn}. Gün: Kart ile dirildin`);
      }
      return { ok: true, revivedId: target.id, title, desc };
    }

    /* 2 */ case 'SHIELD_RANDOM_TONIGHT': {
      const count = effect?.params?.count || 1;
      const alive = alivePlayers();
      if (alive.length === 0) return { ok: false, note: 'Canlı oyuncu yok.' };
      const chosen = [];
      const pool = [...alive];
      for (let i=0;i<count && pool.length>0;i++) {
        const idx = Math.floor(Math.random()*pool.length);
        chosen.push(pool[idx].id);
        pool.splice(idx,1);
      }
      S.cardShieldsNextNight = [...new Set([...(S.cardShieldsNextNight||[]), ...chosen])];
      return { ok: true, shieldIds: chosen, title, desc };
    }

    /* 8 */ case 'DOUBLE_SHIELD_TONIGHT': {
      const alive = alivePlayers();
      if (alive.length === 0) return { ok: false, note: 'Canlı oyuncu yok.' };
      const pool = [...alive];
      const chosen = [];
      for (let i=0;i<2 && pool.length>0;i++) {
        const idx = Math.floor(Math.random()*pool.length);
        chosen.push(pool[idx].id);
        pool.splice(idx,1);
      }
      S.cardShieldsNextNight = [...new Set([...(S.cardShieldsNextNight||[]), ...chosen])];
      return { ok: true, shieldIds: chosen, title, desc };
    }

    /* 12 */ case 'REFLECT_ATTACKS_TONIGHT': {
      S.reflectAttacksTonight = [...new Set([...(S.reflectAttacksTonight || []), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Bu gece gelen saldırılar geri dönecek`);
      return { ok: true, title, desc };
    }

    /* 13 */ case 'REVERSE_PROTECT_EFFECTS': {
      S.reverseProtectEffectsTonight = true;
      addNote(actorId, `${S.currentTurn}. Gün: Bu gece korumalar tersine dönecek`);
      return { ok: true, title, desc };
    }

    /* 21 */ case 'DARK_POWER_BYPASS_SHIELDS': {
      S.bypassShieldsActorNextNight = [...new Set([...(S.bypassShieldsActorNextNight || []), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Bir sonraki gecede saldırın kalkanları delecek`);
      return { ok: true, title, desc };
    }

    /* 28 */ case 'ROLE_LOCK_RANDOM_NEXT_NIGHT': {
      const alive = alivePlayers();
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      S.roleLockRandomNextNight = [...new Set([...(S.roleLockRandomNextNight || []), t.id])];
      addNote(t.id, `${S.currentTurn}. Gün: Bir sonraki gece aksiyonun kilitlendi`);
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 4 */ case 'DOUBLE_VOTE_TODAY': {
      S.doubleVoteToday = [...new Set([...(S.doubleVoteToday || []), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Bugün oy hakkın 2 sayılacak`);
      return { ok:true, title, desc };
    }

    /* 11 */ case 'VOTE_BAN_TODAY_RANDOM': {
      const alive = alivePlayers().filter(p=>p.id!==actorId);
      if (!alive.length) return { ok:false, note:'Seçilecek oyuncu yok' };
      const t = randPick(alive);
      S.voteBanToday = [...new Set([...(S.voteBanToday || []), t.id])];
      addNote(t.id, `${S.currentTurn}. Gün: Bugün oy kullanamazsın`);
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 10 */ case 'LYNCH_IMMUNITY_TODAY': {
      S.lynchImmunityToday = [...new Set([...(S.lynchImmunityToday||[]), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Bugün asılamazsın`);
      return { ok:true, title, desc };
    }

    /* 23 */ case 'LYNCH_SWAP_RANDOM_IF_SELF': {
      S.lynchSwapIfSelfToday = [...new Set([...(S.lynchSwapIfSelfToday||[]), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Asılırsan rastgele biri yerine asılacak`);
      return { ok:true, title, desc };
    }

    /* 25 */ case 'SAVIOR_CANCEL_LYNCH_TODAY': {
      S.saviorCancelLynchToday = true;
      addNote(actorId, `${S.currentTurn}. Gün: Bugün kimse asılmayabilir`);
      return { ok:true, title, desc };
    }

    /* 19 */ case 'SKIP_DAY_START_NIGHT': {
      // handled by caller to change phase
      return { ok:true, skipDay:true, title, desc };
    }

    /* 20 */ case 'RESURRECTION_STONE_TODAY_AND_NEXT_NIGHT': {
      S.resurrectionStone = { playerId: actorId, dayTurn: S.currentTurn, nightTurn: (S.currentTurn + 1) };
      addNote(actorId, `${S.currentTurn}. Gün: Diriliş taşın aktif (bugün ve sonraki gece ölemezsin)`);
      return { ok:true, title, desc };
    }

    /* 5 */ case 'INSTANT_DEATH': {
      if (!actor) return { ok:false, note:'Oyuncu bulunamadı' };
      // resurrection stone check (today)
      const res = S.resurrectionStone;
      const immune = res && res.playerId === actorId && res.dayTurn === S.currentTurn;
      if (!immune && actor.isAlive) {
        actor.isAlive = false;
        S.deathsThisTurn = [...(S.deathsThisTurn||[]), { ...actor }];
        S.deathLog = [...(S.deathLog||[]), { ...actor }];
      }
      addNote(actorId, `${S.currentTurn}. Gün: Kart seni öldürdü` + (immune? ' (Diriliş taşıyla hayatta kaldın)':''));
      return { ok:true, died: !immune, title, desc };
    }

    /* 27 */ case 'DIE_AND_TAKE_ONE': {
      if (!actor) return { ok:false, note:'Oyuncu bulunamadı' };
      const res = S.resurrectionStone;
      const immune = res && res.playerId === actorId && res.dayTurn === S.currentTurn;
      if (!immune && actor.isAlive) {
        actor.isAlive = false;
        S.deathsThisTurn = [...(S.deathsThisTurn||[]), { ...actor }];
        S.deathLog = [...(S.deathLog||[]), { ...actor }];
        // choose victim
        const alive = alivePlayers().filter(p=>p.id!==actorId);
        let target = null;
        if (extra && extra.targetId) {
          target = room.players.get(extra.targetId) || null;
          if (target && !target.isAlive) target = null;
          if (target && target.id === actorId) target = null;
        }
        if (!target) target = alive.length ? randPick(alive) : null;
        if (target) {
          target.isAlive = false;
          S.deathsThisTurn = [...S.deathsThisTurn, { ...target }];
          S.deathLog = [...S.deathLog, { ...target }];
          addNote(actorId, `${S.currentTurn}. Gün: Yanında ${target.name} oyuncusunu götürdün`);
        }
      } else {
        addNote(actorId, `${S.currentTurn}. Gün: Kart seni öldüremedi (Diriliş taşı)`);
      }
      return { ok:true, title, desc };
    }

    /* 16 */ case 'LOVERS_BIND_PAIR': {
      const alive = alivePlayers().filter(p=>p.id!==actorId);
      if (alive.length === 0) return { ok:false, note:'Eşleştirilecek oyuncu yok' };
      const t = randPick(alive);
      S.loversPairs = [...(S.loversPairs || []), [String(actorId), String(t.id)]];
      addNote(actorId, `${S.currentTurn}. Gün: ${t.name} ile âşıksın. Amacınız son ana kadar beraber hareket edip sona kalmak. Unutma biriniz ölürse diğeriniz de ölür.`);
      addNote(t.id, `${S.currentTurn}. Gün: ${actor?.name || 'Biri'} ile âşıksın. Amacınız son ana kadar beraber hareket edip sona kalmak. Unutma biriniz ölürse diğeriniz de ölür.`);
      return { ok:true, partnerId: t.id, title, desc };
    }

    /* 17 */ case 'SCAPEGOAT_OBJECTIVE': {
      S.scapegoatToday = [...new Set([...(S.scapegoatToday || []), actorId])];
      addNote(actorId, `${S.currentTurn}. Gün: Amaç kimseyi astırmamak; biri asılırsa sen ölürsün.`);
      return { ok:true, title, desc };
    }

    /* 18 */ case 'AUTO_CONFESS_ROLE': {
      if (actor) addNote(actorId, `${S.currentTurn}. Gün: GERÇEK rolün: ${roleTR(actor.role)}`);
      return { ok:true, title, desc };
    }

    /* 14 */ case 'PUBLIC_ROLE_HINT': {
      const roles = ['DOCTOR','GUARDIAN','WATCHER','DETECTIVE','BOMBER','SURVIVOR'];
      const hint = 'Bir oyuncunun rolü şuna benziyor: ' + roleTR(randPick(roles));
      Array.from(room.players.keys()).forEach(pid => addNote(pid, `${S.currentTurn}. Gün: ${hint}`));
      return { ok:true, title, desc };
    }

    /* 15 */ case 'SECRET_MESSAGE_TO_RANDOM': {
      const alive = alivePlayers();
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      addNote(actorId, `${S.currentTurn}. Gün: ${t.name} oyuncusuna gizli mesaj: (notlara bak)`);
      addNote(t.id, `${S.currentTurn}. Gün: Hain tahmininden daha da yakın.`);
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 3 */ case 'HINT_PARTIAL_ROLE': {
      const alive = alivePlayers().filter(p=>p.id!==actorId);
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      addNote(actorId, `${S.currentTurn}. Gün: ${t.name} için ipucu: rolü ${Math.random()<0.5?'masuma yakın':'hain gibi'}`);
      return { ok:true, title, desc };
    }
    /* 6 */ case 'MASS_NOTE_FAKE_INNOCENT': {
      // Rastgele masum birine sahte "masum" notu düş
      const innocents = Array.from(room.players.values()).filter(p => p.isAlive && !['BOMBER','EVIL_GUARDIAN','EVIL_WATCHER','EVIL_DETECTIVE'].includes(p.role));
      if (!innocents.length) return { ok:false, note:'Masum bulunamadı' };
      const t = randPick(innocents);
      Array.from(room.players.keys()).forEach(pid => {
        S.playerNotes[pid] = [...(S.playerNotes[pid] || []), `${S.currentTurn}. Gün: ${t.name} kesin masum!`];
      });
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 7 */ case 'RUMOR_SUSPECT_NOTE': {
      const alive = Array.from(room.players.values()).filter(p => p.isAlive);
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      Array.from(room.players.keys()).forEach(pid => {
        S.playerNotes[pid] = [...(S.playerNotes[pid] || []), `${S.currentTurn}. Gün: Dedikodu → ${t.name} hain olabilir.`];
      });
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 24 */ case 'FALSE_HINT_TO_ACTOR': {
      const alive = Array.from(room.players.values()).filter(p=>p.id!==actorId);
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      const roles = ['DOCTOR','GUARDIAN','WATCHER','DETECTIVE','BOMBER','SURVIVOR'];
      let fake = randPick(roles);
      if (fake === t.role) fake = roles[(roles.indexOf(fake)+1)%roles.length];
      S.playerNotes[actorId] = [...(S.playerNotes[actorId] || []), `${S.currentTurn}. Gün: ipucu → ${t.name} aslında ${roleTR(fake)}`];
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 9 */ case 'REVEAL_TRUE_ROLE_TO_ACTOR': {
      const alive = alivePlayers().filter(p=>p.id!==actorId);
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      addNote(actorId, `${S.currentTurn}. Gün: ${t.name} GERÇEK rolü: ${roleTR(t.role)}`);
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 22 */ case 'DETECTIVE_NOTES_LAST_TURN': {
      const alive = alivePlayers().filter(p=>p.id!==actorId);
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      const notes = (S.playerNotes[t.id] || []).filter(line => line.startsWith(`${S.currentTurn-1}. `));
      if (notes.length) addNote(actorId, `${S.currentTurn}. Gün: ${t.name} geçen tur notları → ` + notes.join(' | '));
      else addNote(actorId, `${S.currentTurn}. Gün: ${t.name} geçen tur notu yok`);
      return { ok:true, targetId:t.id, title, desc };
    }

    /* 26 */ case 'TRUST_NOTE_PUBLIC_INNOCENT': {
      const alive = alivePlayers();
      if (!alive.length) return { ok:false, note:'Canlı yok' };
      const t = randPick(alive);
      Array.from(room.players.keys()).forEach(pid => addNote(pid, `${S.currentTurn}. Gün: ${t.name} masum olabilir`));
      return { ok:true, targetId:t.id, title, desc };
    }

    default:
      return { ok: true, noop: true, title: effectId, desc };
  }
}

/* ---------------- Broadcast helpers ---------------- */
function broadcast(room, type, payload = {}) {
  const message = JSON.stringify({ type, payload, serverTime: now() });
  const count = room.sockets ? room.sockets.size : 0;
  console.log(`[WS→clients] ${type} → ${count} clients`);
  if (type === 'PHASE_CHANGED' || type === 'STATE_SNAPSHOT' || type === 'GAME_STARTED') {
    console.log('[WS→clients]', type, 'payload:', payload?.phase ?? payload);
  }
  room.sockets.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function snapshotRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const players = Array.from(room.players.values()).map((p) => {
    const copy = { ...p };
    if ('hasShield' in copy) delete copy.hasShield;
    return copy;
  });
  const state = { ...room.state, players };
  return toPlain(state);
}
function broadcastSnapshot(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const snap = snapshotRoom(roomId);
  broadcast(room, 'STATE_SNAPSHOT', { roomId, state: snap });
}
function clearTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

/* ---------------- Role helpers (server-authoritative) ---------------- */
const isTraitorRole = (role) =>
  role === 'EVIL_GUARDIAN' || role === 'EVIL_WATCHER' || role === 'EVIL_DETECTIVE';

function assignRolesServer(players, settings) {
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  const roles = [];

  const innocentOnly = ['DOCTOR', 'DELI'];
  const convertible = ['GUARDIAN', 'WATCHER', 'DETECTIVE'];
  const special = ['BOMBER', 'SURVIVOR'];

  const specialCount = Math.min(settings?.specialRoleCount ?? 0, players.length);
  for (let i = 0; i < specialCount; i++) {
    roles.push(special[Math.floor(Math.random() * special.length)]);
  }

  const allInnocent = [...innocentOnly, ...convertible];
  while (roles.length < players.length) {
    roles.push(allInnocent[Math.floor(Math.random() * allInnocent.length)]);
  }

  // convert some to traitor variants (never DELI)
  const convertibleIdx = roles
    .map((role, index) => ({ role, index }))
    .filter((r) => convertible.includes(r.role));
  const traitorCount = Math.min(settings?.traitorCount ?? 0, convertibleIdx.length);
  convertibleIdx.sort(() => Math.random() - 0.5).slice(0, traitorCount).forEach(({ role, index }) => {
    if (role === 'GUARDIAN') roles[index] = 'EVIL_GUARDIAN';
    if (role === 'WATCHER') roles[index] = 'EVIL_WATCHER';
    if (role === 'DETECTIVE') roles[index] = 'EVIL_DETECTIVE';
  });

  const shuffledRoles = roles.sort(() => Math.random() - 0.5);

  return shuffledPlayers.map((p, i) => {
    const role = shuffledRoles[i];
    if (role === 'DELI') {
      const innocent = ['DOCTOR', 'GUARDIAN', 'WATCHER', 'DETECTIVE'];
      const fake = innocent[Math.floor(Math.random() * innocent.length)];
      return { ...p, role, displayRole: fake, survivorShields: 0 };
    }
    return {
      ...p,
      role,
      displayRole: role,
      survivorShields: role === 'SURVIVOR' ? 2 : 0,
    };
  });
}

function getWinCondition(players, loversPairs) {
  const alive = players.filter((p) => p.isAlive);
  const bombers = alive.filter((p) => p.role === 'BOMBER');
  const traitors = alive.filter((p) => isTraitorRole(p.role));
  const nonTraitorsNonBombers = alive.filter(
    (p) => !isTraitorRole(p.role) && p.role !== 'BOMBER'
  );

  // Lovers override: son 3 kişi ve içlerinden herhangi iki kişi sevgiliyse → Lovers kazanır
  if (alive.length === 3 && Array.isArray(loversPairs)) {
    const aliveIds = new Set(alive.map((p) => p.id));
    for (const pair of loversPairs) {
      const [a, b] = pair || [];
      if (aliveIds.has(a) && aliveIds.has(b)) {
        return { winner: 'LOVERS', gameEnded: true };
      }
    }
  }

  // YENİ KURAL: Son 2 kişi hayattaysa ve aralarında tam 1 Bombacı varsa → Bombacı kazanır
  if (alive.length === 2) {
    const bomberCount = bombers.length;
    if (bomberCount === 1) {
      return { winner: 'BOMBER', gameEnded: true };
    }
  }

  // Tek başına kalan Bombacı → kazanır
  if (alive.length === 1 && alive[0].role === 'BOMBER') {
    return { winner: 'BOMBER', gameEnded: true };
  }

  // Hainler: (Bombacı yokken) Hain sayısı, Bombacı-dışı masumlara >= ise → Hainler kazanır
  if (
    traitors.length > 0 &&
    bombers.length === 0 &&
    traitors.length >= nonTraitorsNonBombers.length
  ) {
    return { winner: 'TRAITORS', gameEnded: true };
  }

  // Masumlar: Bombacı da Hain de kalmadıysa → Masumlar kazanır
  if (bombers.length === 0 && traitors.length === 0) {
    return { winner: 'INNOCENTS', gameEnded: true };
  }

  return { winner: null, gameEnded: false };
}


/* -------------- Phase control -------------- */
function startPhase(roomId, phase, durationSec) {
  console.log('[WS] startPhase', roomId, phase, 'sec=', durationSec);
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimer(room);

  // per-phase resets
  if (phase === 'NIGHT') {
    room.state.nightActions = [];
    room.state.deathsThisTurn = [];
    // clear day-scoped modifiers
    room.state.doubleVoteToday = [];
    room.state.voteBanToday = [];
    room.state.lynchImmunityToday = [];
    room.state.lynchSwapIfSelfToday = [];
    room.state.saviorCancelLynchToday = false;
    room.state.scapegoatToday = [];
  }
  if (phase === 'VOTE') {
    room.state.votes = {};
  }

  if (phase === 'ROLE_REVEAL') {
    room.state.roleRevealReady = [];
  }
  if (phase === 'DAY_DISCUSSION') {
    room.state.discussionEndVoters = [];
  }
  room.state.phase = phase;
  room.state.phaseEndsAt = now() + Math.max(0, durationSec) * 1000;

  // 🔽 Kart çekme fazına girerken: 1 canlı oyuncu seç, yalnız ona READY gönder
  if (phase === 'CARD_DRAWING') {
    const S = room.state;
    const alive = Array.from(room.players.values()).filter((p) => p.isAlive);
    const count = Math.min(1, alive.length); // şimdilik 1'e sabit
    const order = alive.map((p) => p.id).sort(() => Math.random() - 0.5).slice(0, count);
    S.selectedCardDrawers = order;
    S.currentCardDrawerIndex = 0;
    S.currentCardDrawer = order[0] || null;
    if (S.currentCardDrawer) {
      sendToPlayer(room, S.currentCardDrawer, 'CARD_DRAW_READY', {
        message: 'Kamerayı aç ve QR kartını okut.',
      });
    }
  }

  broadcast(room, 'PHASE_CHANGED', {
    phase,
    phaseEndsAt: room.state.phaseEndsAt,
    turn: room.state.currentTurn,
    selectedCardDrawers: room.state.selectedCardDrawers || [],
    currentCardDrawer: room.state.currentCardDrawer ?? null,
  });
  broadcastSnapshot(roomId);

  if (durationSec > 0) {
    room.timer = setTimeout(() => {
      room.timer = null;
      advancePhase(roomId);
    }, durationSec * 1000 + 50);
  }
}

/* --------- Core resolvers (authoritative) ---------- */


/* === DELI fake-feedback generator (adds notes only for DELI; no real effects) === */
function generateFakeForDeli(room) {
  const S = room.state;
  const players = Array.from(room.players.values());
  const alive = players.filter(p => p.isAlive);

  const addNote = (pid, text) => {
    S.playerNotes[pid] = [...(S.playerNotes[pid] || []), text];
  };

  // WATCHER sahte notu üretirken "gerçek ziyaretçileri" dışarıda bırakmak için
  const trueVisitorsByTarget = {};
  (S.nightActions || []).forEach(a => {
    if (!a || !a.targetId) return;
    if (!trueVisitorsByTarget[a.targetId]) trueVisitorsByTarget[a.targetId] = new Set();
    trueVisitorsByTarget[a.targetId].add(a.playerId);
  });

  // DELI oyuncularının, hedefli aksiyonlarını topla
  const deliActions = (S.nightActions || []).filter(a => {
    if (!a || !a.targetId) return false;
    const actor = players.find(p => p.id === a.playerId);
    return actor && actor.role === 'DELI';
  });

  deliActions.forEach(a => {
    const actor = players.find(p => p.id === a.playerId);
    const target = players.find(p => p.id === a.targetId);
    if (!actor || !target) return;

    const turn = S.currentTurn;
    const emu = actor.displayRole; // DOCTOR | GUARDIAN | WATCHER | DETECTIVE

    if (emu === 'DOCTOR') {
      // Rastgele "iyileştirdin" veya "gittin ama bir şey olmadı"
      const variants = [
        `${turn}. Gece: ${target.name} kişisini iyileştirdin.`,
        `${turn}. Gece: ${target.name} kişisine gittin ama bir şey olmadı.`
      ];
      addNote(actor.id, variants[Math.floor(Math.random() * variants.length)]);

    } else if (emu === 'GUARDIAN') {
      addNote(actor.id, `${turn}. Gece: ${target.name} kişisini tuttun (aksiyonunu kilitledin).`);

    } else if (emu === 'WATCHER') {
      // Gerçek ziyaretçileri havuzdan çıkar → bilinçli yanlış bilgi
      const trueSet = new Set(Array.from((trueVisitorsByTarget[target.id] || new Set()).values()));
      const pool = alive.filter(p => p.id !== actor.id && p.id !== target.id && !trueSet.has(p.id));

      // 0, 1 veya 2 sahte ziyaretçi → tamamen rastgele
      const maxPick = Math.min(pool.length, 2);
      const choices = [0, 1, 2].filter(n => n <= maxPick);
      const n = choices[Math.floor(Math.random() * choices.length)];

      // benzersiz n kişi seç
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      const picked = shuffled.slice(0, n);
      const names = picked.map(p => p.name);

      let line;
      if (names.length === 0) {
        line = `${turn}. Gece: ${target.name} kişisine kimse gelmedi.`;
      } else if (names.length === 1) {
        line = `${turn}. Gece: ${target.name} kişisine ${names[0]} gitti.`;
      } else {
        line = `${turn}. Gece: ${target.name} kişisine ${names[0]} ve ${names[1]} gitti.`;
      }
      addNote(actor.id, line);

    } else if (emu === 'DETECTIVE') {
      // Hedefin GERÇEK rolünü hariç tutarak iki farklı RASTGELE rol öner
      const ROLE_POOL = [
        'DOCTOR','GUARDIAN','WATCHER','DETECTIVE',
        'BOMBER','SURVIVOR','EVIL_GUARDIAN','EVIL_WATCHER','EVIL_DETECTIVE'
      ];
      const pool = ROLE_POOL.filter(r => r !== target.role);
      const pick = () => pool[Math.floor(Math.random() * pool.length)];
      const r1 = pick();
      let r2 = pick();
      if (r2 === r1) r2 = pool[(pool.indexOf(r1) + 1) % pool.length];

      // roleTR varsa kullanıyoruz (dosyada global fonksiyon). Yoksa r1/r2 olduğu gibi kalır.
      const t1 = (typeof roleTR === 'function') ? roleTR(r1) : r1;
      const t2 = (typeof roleTR === 'function') ? roleTR(r2) : r2;

      addNote(actor.id, `${turn}. Gece: ${target.name}, ${t1} veya ${t2} olabilir.`);

    } else {
      // Güvenli varsayılan
      addNote(actor.id, `${turn}. Gece: ${target.name} üzerinde bir hareket yaptın.`);
    }
  });
}


function processNightActions(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const players = Array.from(room.players.values());

  // role-lock from QR (pre-block)
  const blockedPlayers = new Set([...(S.roleLockRandomNextNight || [])]);

  // 1) Guardians block (by timestamp)
  const guardianActions = S.nightActions
    .filter((a) => {
      const actor = players.find((p) => p.id === a.playerId);
      return (
        a.actionType === 'PROTECT' &&
        actor &&
        (actor.role === 'GUARDIAN' || actor.role === 'EVIL_GUARDIAN') &&
        a.targetId
      );
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  guardianActions.forEach((a) => {
    if (!blockedPlayers.has(a.playerId) && a.targetId) {
      blockedPlayers.add(a.targetId);
      S.playerNotes[a.targetId] = [
        ...(S.playerNotes[a.targetId] || []),
        `${S.currentTurn}. Gece: Gardiyan tarafından tutuldun`,
      ];
    }
  });
  guardianActions.forEach((a) => {
  if (!a.targetId) return;
  const tgt = players.find(p => p.id === a.targetId);
  const tName = tgt ? tgt.name : 'bir oyuncu';
  S.playerNotes[a.playerId] = [
    ...(S.playerNotes[a.playerId] || []),
    `${S.currentTurn}. Gece: ${tName} oyuncusunu tuttun (aksiyonunu kilitledin).`,
  ];
});
  // 2) Kills (pair with actor)
  const killers = S.nightActions.filter(
    (a) => a.actionType === 'KILL' && !blockedPlayers.has(a.playerId),
  ).map(a => ({ actorId: a.playerId, targetId: a.targetId }));

  // Reflect attacks tonight
  const reflectSet = new Set(S.reflectAttacksTonight || []);
  const adjustedKills = killers.map(k => {
    if (k.targetId && reflectSet.has(k.targetId)) {
      return { actorId: k.actorId, targetId: k.actorId, reflected: true };
    }
    return { ...k, reflected: false };
  });

  // 3) Doctor, Survivor, other protects
  const revived = new Set();
  const doctorResults = new Map();
  const doctorTargetsByActor = new Map(); // 🆕 Doktor → hedef eşlemi
  const protectedPlayers = new Set();
  const survivorActors = new Set();

  S.nightActions
    .filter((a) => {
      const actor = players.find((p) => p.id === a.playerId);
      return a.actionType === 'PROTECT' && actor;
    })
    .forEach((a) => {
      const actor = players.find((p) => p.id === a.playerId);
      const target = players.find((p) => p.id === a.targetId);

      if (!actor) return;
      if ((actor.role === 'GUARDIAN' || actor.role === 'EVIL_GUARDIAN') && a.targetId) {
        // already handled as block
      } else if (actor.role === 'SURVIVOR') {
        if (actor.survivorShields && actor.survivorShields > 0 && a.targetId === actor.id) {
          protectedPlayers.add(actor.id);
          survivorActors.add(actor.id);
          const remaining = Math.max((actor.survivorShields || 0) - 1, 0);
          // note
          const note = `${S.currentTurn}. Gece: Kendini korudun (${remaining} hak kaldı)`;
          S.playerNotes[actor.id] = [...(S.playerNotes[actor.id] || []), note];
        }
      } else if (actor.role === 'DOCTOR') {
  // Engellendiyse burada sadece "blocked" bilgisini kaydet, karar verme
     if (blockedPlayers.has(actor.id)) {
    doctorResults.set(actor.id, { blocked: true, targetId: target ? target.id : (a?.targetId ?? null) });
    return;
  }
  if (!target) {
    doctorResults.set(actor.id, { blocked: false, targetId: null }); // hedef yok
    return;
  }
  // Kararı ŞİMDİ verme: finalde (deathMark sonrası) uygulayacağız
  doctorTargetsByActor.set(actor.id, target.id); // doktor -> hedef
  revived.add(target.id);                         // bu tur sonunda yaşatmayı dene
  doctorResults.set(actor.id, { pending: true, targetId: target.id }); // uyumluluk için
}
      else if (a.targetId && actor.role !== 'DELI') { protectedPlayers.add(a.targetId); }
    });
  // QR-based extra shields for tonight
  (S.cardShieldsNextNight || []).forEach(pid => protectedPlayers.add(pid));

  // Reverse protectors effect: protectors get targeted
  let reverseProtectKillers = [];
  if (S.reverseProtectEffectsTonight) {
    const protectors = S.nightActions.filter(a => a.actionType === 'PROTECT' && (players.find(p => p.id === a.playerId)?.role !== 'DELI')).map(a => a.playerId);
    reverseProtectKillers = protectors.map(pid => ({ actorId: pid, targetId: pid, reverse: true }));
  }

  // Bombs (per-owner)
  const bombPlacers = S.nightActions.filter(
    (a) => a.actionType === 'BOMB_PLANT' && !blockedPlayers.has(a.playerId),
  );
  const detonateActions = S.nightActions.filter(
    (a) => a.actionType === 'BOMB_DETONATE' && !blockedPlayers.has(a.playerId),
  );

  // ensure structure
  let bombsByOwner = { ...(S.bombsByOwner || {}) };
  // normalize arrays
  Object.keys(bombsByOwner).forEach(k => {
    if (!Array.isArray(bombsByOwner[k])) bombsByOwner[k] = [];
  });

  // apply new plants (each bomber has own list; can target anyone, including other bombers)
  // apply new plants (each bomber has own list; can target anyone, including other bombers)
bombPlacers.forEach((a) => {
  if (!a.targetId) return;
  const owner = a.playerId;
  const list = bombsByOwner[owner] || [];
  const tName = (players.find(p => p.id === a.targetId)?.name) || 'bir oyuncu';

  if (!list.includes(a.targetId)) {
    list.push(a.targetId);
    S.playerNotes[owner] = [
      ...(S.playerNotes[owner] || []),
      `${S.currentTurn}. Gece: ${tName} üzerine bomba yerleştirdin.`,
    ];
  } else {
    // zaten bombalı hedef → tekrar ekleme ve oyuncuyu bilgilendir
    S.playerNotes[owner] = [
      ...(S.playerNotes[owner] || []),
      `${S.currentTurn}. Gece: ${tName} üzerinde zaten bomban vardı (yenisini yerleştirmedin).`,
    ];
  }

  bombsByOwner[owner] = list;
});

  // === REAL WATCHER RESULTS ===
// === REAL WATCHER RESULTS ===
(() => {
  // hedefe giden gerçek ziyaretçiler (tüm gece aksiyonlarından derlenir)
  const trueVisitorsByTarget = new Map();
  for (const a of (S.nightActions || [])) {
    if (!a || !a.targetId || !a.playerId) continue;
    if (!trueVisitorsByTarget.has(a.targetId)) {
      trueVisitorsByTarget.set(a.targetId, new Set());
    }
    trueVisitorsByTarget.get(a.targetId).add(a.playerId);
  }

  // watcher/e. watcher aksiyonları
  const watcherActs = (S.nightActions || []).filter(a => {
    if (!a || !a.targetId) return false;
    const actor = players.find(p => p.id === a.playerId);
    return !!actor && (actor.role === 'WATCHER' || actor.role === 'EVIL_WATCHER');
  });

  // aynı watcher birden fazla kayıt girdiyse tek kez not yaz
  const seen = new Set();
  for (const a of watcherActs) {
    if (seen.has(a.playerId)) continue;
    seen.add(a.playerId);

    const actor = players.find(p => p.id === a.playerId);
    if (!actor) continue;

    const blocked = blockedPlayers.has(actor.id);
    const t = players.find(p => p.id === a.targetId);
    const tName = t ? t.name : 'hedef';

    if (blocked) {
      S.playerNotes[actor.id] = [
        ...(S.playerNotes[actor.id] || []),
        `${S.currentTurn}. Gece: ${tName} üzerinde gözcülük yapamadın (tutuldun).`,
      ];
      continue;
    }

    // ziyaretçi isimlerini toparla (kendini listeden çıkar)
    const set = new Set([...(trueVisitorsByTarget.get(a.targetId) || new Set())]);
    set.delete(actor.id);
    const names = Array.from(set).map(pid => (players.find(p => p.id === pid)?.name || 'biri'));

    let line;
    if (names.length === 0) {
      line = `${S.currentTurn}. Gece: ${tName} yanına kimse gitmedi.`;
    } else if (names.length === 1) {
      line = `${S.currentTurn}. Gece: ${tName} yanına ${names[0]} gitti.`;
    } else {
      line = `${S.currentTurn}. Gece: ${tName} yanına ${names.slice(0, -1).join(', ')} ve ${names[names.length - 1]} gitti.`;
    }

    S.playerNotes[actor.id] = [ ...(S.playerNotes[actor.id] || []), line ];
  }
})();

//dedective


  // === REAL DETECTIVE RESULTS (gerçek rol + rastgele başka bir rol) ===
(() => {
  const roleLabel = (role) => {
    switch (role) {
      case 'WATCHER': return 'Gözcü';
      case 'EVIL_WATCHER': return 'Hain Gözcü';
      case 'DETECTIVE': return 'Dedektif';
      case 'EVIL_DETECTIVE': return 'Hain Dedektif';
      case 'GUARDIAN': return 'Gardiyan';
      case 'EVIL_GUARDIAN': return 'Hain Gardiyan';
      case 'DOCTOR': return 'Doktor';
      case 'BOMBER': return 'Bombacı';
      case 'SURVIVOR': return 'Survivor';
      default: return 'Bilinmeyen Rol';
    }
  };

  // Havuz: sahte aday burada rastgele seçilir (gerçek rol HARİÇ)
  const ROLE_POOL = [
    'WATCHER', 'EVIL_WATCHER',
    'DETECTIVE', 'EVIL_DETECTIVE',
    'GUARDIAN', 'EVIL_GUARDIAN',
    'DOCTOR',
    'BOMBER',
    'SURVIVOR',
  ];

  // Havuzdan, gerçek role eşit olmayan rastgele bir rol çek
  const pickRandomOtherRole = (trueRole) => {
    const pool = ROLE_POOL.filter(r => r !== trueRole);
    if (pool.length === 0) return null;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx];
  };

  const detectiveActs = (S.nightActions || []).filter(a => {
    const actor = players.find(p => p.id === a.playerId);
    return actor && (actor.role === 'DETECTIVE' || actor.role === 'EVIL_DETECTIVE') && a.targetId;
  });

  detectiveActs.forEach(a => {
    const actor = players.find(p => p.id === a.playerId);
    if (!actor) return;

    const blocked = blockedPlayers.has(actor.id);
    const t = players.find(p => p.id === a.targetId);
    const tName = t ? t.name : 'hedef';

    if (blocked) {
      S.playerNotes[actor.id] = [...(S.playerNotes[actor.id] || []),
        `${S.currentTurn}. Gece: ${tName} için soruşturma yapamadın (tutuldun).`
      ];
      return;
    }
    if (!t) return;

    // 1) GERÇEK rol etiketi
    const trueLbl = roleLabel(t.role);

    // 2) RASTGELE farklı bir rol etiketi
    const fakeRole = pickRandomOtherRole(t.role);
    const fakeLbl = roleLabel(fakeRole || 'SURVIVOR'); // emniyetli fallback

    // Çıkış: "X, [GerçekRol] veya [Rastgele Rol] olabilir."
    S.playerNotes[actor.id] = [
      ...(S.playerNotes[actor.id] || []),
      `${S.currentTurn}. Gece: ${tName} ${trueLbl} veya ${fakeLbl} olabilir.`,
    ];
  });
})();

  // 5) Bomb detonate victims (per owner; no chain detonation)
  let bombVictims = [];
  detonateActions.forEach((det) => {
    const owner = det.playerId;
    const targets = (bombsByOwner[owner] || []).slice();
    const victims = players.filter((p) => targets.includes(p.id) && p.isAlive);
    bombVictims.push(...victims);
    const victimNames = victims.map((p) => p.name);
    const text = victimNames.length > 0 ? victimNames.join(', ') : 'kimse ölmedi';
    S.playerNotes[owner] = [
      ...(S.playerNotes[owner] || []),
      `${S.currentTurn}. Gece: bombalarını patlattın: ${text}`,
    ];
    // clear only this owner's bombs
    bombsByOwner[owner] = [];
  });
  // dedupe victims
  bombVictims = Array.from(new Set(bombVictims));

  // persist bombs state
  S.bombsByOwner = bombsByOwner;
  
  // 6 ) Apply effects to players map (authoritative)
  const newPlayersMap = new Map(room.players);
  // clear previous shields
  Array.from(newPlayersMap.values()).forEach((pl) => { pl.hasShield = false; });

  protectedPlayers.forEach((pid) => {
    const p = newPlayersMap.get(pid);
    if (p) p.hasShield = true;
  });
  survivorActors.forEach((pid) => {
    const p = newPlayersMap.get(pid);
    if (p) p.survivorShields = Math.max((p.survivorShields || 0) - 1, 0);
  });
  revived.forEach((pid) => {
    const p = newPlayersMap.get(pid);
    if (p) p.isAlive = true;
  });

  // compute deaths considering shield-bypass
  const res = S.resurrectionStone;
  const bypassSet = new Set(S.bypassShieldsActorNextNight || []);
  const allKillPairs = [...adjustedKills, ...reverseProtectKillers];
  const deathMark = new Set();

  players.forEach((p) => {
    if (!p.isAlive) return;
    const targetedBy = allKillPairs.filter(k => k.targetId === p.id);
    if (targetedBy.length === 0) return;
    const hasBypass = targetedBy.some(k => bypassSet.has(k.actorId));
    const isProtected = protectedPlayers.has(p.id);
    // Resurrection stone night protection
    const hasResStone = res && res.playerId === p.id && res.nightTurn === S.currentTurn;

    if (!hasResStone && (!isProtected || hasBypass)) {
      deathMark.add(p.id);
    }
  });

  const bombVictimIds = bombVictims.map((p) => p.id);
  bombVictimIds.forEach(id => {
    const hasResStone = res && res.playerId === id && res.nightTurn === S.currentTurn;
    if (!hasResStone) deathMark.add(id);
  });
  const deathMarkBeforeRevive = new Set(deathMark); // not için referans
  revived.forEach(pid => deathMark.delete(pid));    // doktor hedefleri ölmesin

  doctorTargetsByActor.forEach((targetId, docId) => {
  const t = room.players.get(targetId);
  const tName = t ? t.name : 'hedef';
  const wasDying = deathMarkBeforeRevive.has(targetId); // doktor olmasa ölecek miydi?

  const blocked = doctorResults.get(docId)?.blocked === true;
  if (blocked) {
    S.playerNotes[docId] = [
      ...(S.playerNotes[docId] || []),
      `${S.currentTurn}. Gece: ${tName} için iyileştirme yapamadın (tutuldun).`,
    ];
    doctorResults.set(docId, { success: false, blocked: true, targetId });
    return;
  }

  if (wasDying) {
    S.playerNotes[docId] = [
      ...(S.playerNotes[docId] || []),
      `${S.currentTurn}. Gece: ${tName} oyuncusunu kurtardın.`,
    ];
    doctorResults.set(docId, { success: true, blocked: false, targetId });
  } else {
    S.playerNotes[docId] = [
      ...(S.playerNotes[docId] || []),
      `${S.currentTurn}. Gece: ${tName} için gittin; saldırı yoktu veya kurtarma gerekmedi.`,
    ];
    doctorResults.set(docId, { success: false, blocked: false, targetId });
  }
});


  
  const newDeaths = [];
  Array.from(newPlayersMap.values()).forEach((p) => {
    if (deathMark.has(p.id)) {
      if (p.isAlive) {
        p.isAlive = false;
        newDeaths.push({ ...p });
      }
    }
  });

  room.players = newPlayersMap;

  // attackers notes for kills
  adjustedKills.forEach((k) => {
    const actor = room.players.get(k.actorId);
    const target = k.targetId ? room.players.get(k.targetId) : null;
    if (actor && target) {
      const killed = newDeaths.some((d) => d.id === target.id);
      const note = `${S.currentTurn}. Gece: ${target.name} oyuncusuna saldırdın${killed ? ' ve öldürdün' : ''}`;
      S.playerNotes[actor.id] = [...(S.playerNotes[actor.id] || []), note];
    }
  });

  const actedIds = new Set(S.nightActions.map((a) => a.playerId));
  Array.from(room.players.values()).forEach((p) => {
    if (p.isAlive && !actedIds.has(p.id)) {
      S.playerNotes[p.id] = [...(S.playerNotes[p.id] || []), `${S.currentTurn}. Gece: hiçbir şey yapmadın`];
    }
  });

  // Lovers chain death
  const lovers = S.loversPairs || [];
  let added = true;
  while (added) {
    added = false;
    for (const [a, b] of lovers) {
      const pa = room.players.get(a);
      const pb = room.players.get(b);
      if (pa && pb) {
        if (!pa.isAlive && pb.isAlive) {
          const hasResStone = res && res.playerId === b && res.nightTurn === S.currentTurn;
          if (!hasResStone) {
            pb.isAlive = false; newDeaths.push({ ...pb }); added = true;
          }
        } else if (!pb.isAlive && pa.isAlive) {
          const hasResStone = res && res.playerId === a && res.nightTurn === S.currentTurn;
          if (!hasResStone) {
            pa.isAlive = false; newDeaths.push({ ...pa }); added = true;
          }
        }
      }
    }
  }

  const updatedActions = S.nightActions;
  S.nightActions = updatedActions;
  S.deathsThisTurn = newDeaths;
  if (newDeaths.length > 0) S.deathLog = [...S.deathLog, ...newDeaths];
  // bombsByOwner persisted above

  // Clear one-night flags
  S.reflectAttacksTonight = [];
  S.reverseProtectEffectsTonight = false;
  S.bypassShieldsActorNextNight = [];
  S.roleLockRandomNextNight = [];
  S.cardShieldsNextNight = [];
  {
  const { winner, gameEnded } = getWinCondition(Array.from(room.players.values()), (room.state.loversPairs || []));
  if (gameEnded) {
    room.state.game = { ...(room.state.game || {}), endedAt: new Date(), winningSide: winner, loversPairs: (room.state.loversPairs ? [...room.state.loversPairs] : []) };
    broadcast(room, 'GAME_ENDED', {
      winner,
      loversPairs: room.state.loversPairs || [],
      loverIds: (room.state.loversPairs || []).flatMap(([a, b]) => [a, b]),
      turn: room.state.currentTurn,
    });
    startPhase(roomId, 'END', 0);
    return; // oyun bitti, gece sonuçlarına geçme
  }
}
  generateFakeForDeli(room);
  broadcast(room, 'NIGHT_ACTIONS_UPDATED', { actions: toPlain(S.nightActions) });
  broadcastSnapshot(roomId);

  startPhase(roomId, 'NIGHT_RESULTS', 5);
}

function processVotes(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const players = Array.from(room.players.values());

  const voteCount = {};
  Object.entries(S.votes).forEach(([voterId, targetId]) => {
    const voter = players.find((p) => p.id === voterId);
    if (!voter?.isAlive || targetId === 'SKIP') return;
    // vote ban today
    if ((S.voteBanToday || []).includes(voterId)) return;
    const weight = (S.doubleVoteToday || []).includes(voterId) ? 2 : 1;
    voteCount[targetId] = (voteCount[targetId] || 0) + weight;
  });

  let maxVotes = 0;
  let eliminatedId = null;
  Object.entries(voteCount).forEach(([pid, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      eliminatedId = pid;
    }
  });

  const top = Object.entries(voteCount).filter(([, c]) => c === maxVotes);
  if (top.length > 1) eliminatedId = null; // beraberlik → kimse elenmez

  // Savior: cancel lynch
  if (S.saviorCancelLynchToday && eliminatedId) {
    eliminatedId = null;
  }

  // Lynch immunity
  if (eliminatedId && (S.lynchImmunityToday || []).includes(eliminatedId)) {
    eliminatedId = null;
  }

  // Lynch swap if self for those with card
  if (eliminatedId && (S.lynchSwapIfSelfToday || []).includes(eliminatedId)) {
    const aliveOthers = players.filter(p=>p.isAlive && p.id !== eliminatedId);
    if (aliveOthers.length > 0) {
      const replacement = aliveOthers[Math.floor(Math.random()*aliveOthers.length)];
      eliminatedId = replacement.id;
    } else {
      eliminatedId = null;
    }
  }

  // Apply death unless resurrection stone today
  const res = S.resurrectionStone;
  const newPlayersMap = new Map(room.players);
  const newDeaths = [];
  if (eliminatedId && maxVotes > 0) {
    const target = newPlayersMap.get(eliminatedId);
    if (target && target.isAlive) {
      const hasResStone = res && res.playerId === eliminatedId && res.dayTurn === S.currentTurn;
      if (!hasResStone) {
        target.isAlive = false;
        newDeaths.push({ ...target });
      } else {
        eliminatedId = null; // saved
      }
    }
  }

  // Scapegoat: if someone is eliminated, scapegoat dies
  if (newDeaths.length > 0 && (S.scapegoatToday || []).length > 0) {
    (S.scapegoatToday || []).forEach(pid => {
      const sg = newPlayersMap.get(pid);
      if (sg && sg.isAlive) {
        const hasResStone = res && res.playerId === pid && res.dayTurn === S.currentTurn;
        if (!hasResStone) {
          sg.isAlive = false;
          newDeaths.push({ ...sg });
        }
      }
    });
  }

  // Lovers chain during day
  const lovers = S.loversPairs || [];
  let added = true;
  while (added) {
    added = false;
    for (const [a, b] of lovers) {
      const pa = newPlayersMap.get(a);
      const pb = newPlayersMap.get(b);
      if (pa && pb) {
        if (!pa.isAlive && pb.isAlive) {
          const hasResStone = res && res.playerId === b && res.dayTurn === S.currentTurn;
          if (!hasResStone) {
            pb.isAlive = false; newDeaths.push({ ...pb }); added = true;
          }
        } else if (!pb.isAlive && pa.isAlive) {
          const hasResStone = res && res.playerId === a && res.dayTurn === S.currentTurn;
          if (!hasResStone) {
            pa.isAlive = false; newDeaths.push({ ...pa }); added = true;
          }
        }
      }
    }
  }

  room.players = newPlayersMap;
  S.deathsThisTurn = newDeaths;
  if (newDeaths.length > 0) S.deathLog = [...S.deathLog, ...newDeaths];

  broadcast(room, 'VOTE_RESULT', {
    votes: S.votes,
    voteCount: voteCount,
    eliminatedId: eliminatedId || null,
  });

  broadcastSnapshot(roomId);
  startPhase(roomId, 'RESOLVE', 3);
}

function advancePhase(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const settings = room.settings || { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 1 };

  const { winner, gameEnded } = getWinCondition(Array.from(room.players.values()), (room.state && room.state.loversPairs) || []);
  if (gameEnded && S.phase !== 'END') {
    S.game = { ...(S.game || {}), endedAt: new Date(), winningSide: winner, loversPairs: (S.loversPairs ? [...S.loversPairs] : []) };
        broadcast(room, 'GAME_ENDED', { winner, loversPairs: S.loversPairs || [], loverIds: (S.loversPairs || []).flatMap(([a,b]) => [a,b]), turn: S.currentTurn });
    startPhase(roomId, 'END', 0);
    return;
  }

  switch (S.phase) {
    case 'ROLE_REVEAL':
      // no auto-advance; wait for all players to send PLAYER_READY
      break;
    case 'NIGHT':
      processNightActions(roomId);
      break;
    case 'NIGHT_RESULTS':
      startPhase(roomId, 'DEATH_ANNOUNCEMENT', 5);
      break;
    case 'DEATH_ANNOUNCEMENT':
      if ((settings.cardDrawCount || 0) > 0) startPhase(roomId, 'CARD_DRAWING', 0);
      else startPhase(roomId, 'DAY_DISCUSSION', settings.dayDuration);
      break;
    case 'CARD_DRAWING':
      // onay gelince CARD_CONFIRM içinde geçilecek
      break;
    case 'DAY_DISCUSSION':
      startPhase(roomId, 'VOTE', settings.voteDuration);
      break;
    case 'VOTE':
      processVotes(roomId);
      break;
    case 'RESOLVE':
      S.currentTurn = (S.currentTurn || 1) + 1;
      startPhase(roomId, 'NIGHT', settings.nightDuration);
      break;
    default:
      break;
  }
}

/* -------------- WebSocket events ------------ */
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid WS message', e);
      return;
    }

    const { type, payload, roomId, playerId } = data || {};
    const rid = roomId || ws.roomId;

    switch (type) {
      case 'JOIN_ROOM': {
        const { roomId: joinRoomId, player } = payload || {};
        if (!joinRoomId || !player || !player.id) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'JOIN_ROOM payload invalid' } }));
          return;
        }
        ws.roomId = joinRoomId;
        ws.playerId = player.id;

        if (!rooms.has(joinRoomId)) {
          rooms.set(joinRoomId, {
            players: new Map(),
            sockets: new Set(),
            settings: { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 1 },
            state: {
              phase: 'LOBBY',
              currentTurn: 1,
              nightActions: [],
              votes: {},

              // QR effects state
              cardShieldsNextNight: [],
              reflectAttacksTonight: [],
              reverseProtectEffectsTonight: false,
              bypassShieldsActorNextNight: [],
              roleLockRandomNextNight: [],
              doubleVoteToday: [],
              voteBanToday: [],
              lynchImmunityToday: [],
              lynchSwapIfSelfToday: [],
              saviorCancelLynchToday: false,
              scapegoatToday: [],
              loversPairs: [],
              resurrectionStone: null,

              deathsThisTurn: [],
              deathLog: [],
              bombsByOwner: {},
              playerNotes: {},
              roleRevealReady: [],
              discussionEndVoters: [],
              game: null,
              phaseEndsAt: 0,
              // cards
              selectedCardDrawers: [],
              currentCardDrawerIndex: 0,
              currentCardDrawer: null,
              // pending card
              pendingCard: null,
            },
            timer: null,
            ownerId: null,
          });
        }

        const room = rooms.get(joinRoomId);

        // Oyuncuyu odaya ekle/güncelle
        const existing = room.players.get(player.id) || {};
        room.players.set(player.id, { ...existing, ...player, isAlive: existing.isAlive ?? true });
        if (!room.ownerId && player.isOwner) {
          room.ownerId = player.id;
        }
        room.sockets.add(ws);

        ws.send(JSON.stringify({ type: 'ROOM_JOINED', payload: { roomId: joinRoomId } }));

        broadcast(room, 'PLAYER_LIST_UPDATED', {
          players: Array.from(room.players.values()),
          newPlayer: player,
        });

        const snap = snapshotRoom(joinRoomId);
        ws.send(JSON.stringify({ type: 'STATE_SNAPSHOT', payload: { roomId: joinRoomId, state: snap }, serverTime: now() }));
        break;
      }

      case 'KICK_PLAYER': {
        if (!rid) return;
        const room = rooms.get(rid);
        if (!room) return;

        const targetId = payload && payload.playerId;
        if (!targetId) return;

        const removed = room.players.get(targetId);
        const targetSocket = Array.from(room.sockets).find((s) => s.playerId === targetId);

        if (targetSocket) {
          targetSocket.send(JSON.stringify({ type: 'PLAYER_KICKED', payload: { playerId: targetId } }));
          try {
            targetSocket.close();
          } catch (_) {}
        }

        room.players.delete(targetId);
        broadcast(room, 'PLAYER_LIST_UPDATED', {
          players: Array.from(room.players.values()),
          removedPlayer: removed,
        });
        break;
      }

      case 'GAME_STARTED': {
        const room = rooms.get(rid);
        if (!room) return;
        if (room.state.phase !== 'LOBBY') break;

        if (payload && payload.settings) {
          room.settings = { ...room.settings, ...payload.settings };
        }

        let startPlayers = Array.isArray(payload?.players) ? payload.players : Array.from(room.players.values());

        const hasRoles =
          startPlayers.length > 0 &&
          startPlayers.every((p) => typeof p.role === 'string' && p.role.length > 0);

        if (!hasRoles) {
          startPlayers = assignRolesServer(startPlayers, room.settings);
          console.log('[WS] Roles assigned on server for', startPlayers.length, 'players');
        } else {
          console.log('[WS] Roles provided by client for', startPlayers.length, 'players');
        }

        room.players = new Map(startPlayers.map((p) => [p.id, { ...p, isAlive: p.isAlive ?? true }]));

        room.state.game = { startedAt: new Date() };
        room.state.currentTurn = 1;
        room.state.nightActions = [];
        room.state.votes = {};
        room.state.deathsThisTurn = [];
        room.state.deathLog = [];
        room.state.bombsByOwner = {};
        room.state.playerNotes = {};
        // reset card state
        room.state.selectedCardDrawers = [];
        room.state.currentCardDrawerIndex = 0;
        room.state.currentCardDrawer = null;
        // reset QR/effect state
        room.state.cardShieldsNextNight = [];
        room.state.reflectAttacksTonight = [];
        room.state.reverseProtectEffectsTonight = false;
        room.state.bypassShieldsActorNextNight = [];
        room.state.roleLockRandomNextNight = [];
        room.state.doubleVoteToday = [];
        room.state.voteBanToday = [];
        room.state.lynchImmunityToday = [];
        room.state.lynchSwapIfSelfToday = [];
        room.state.saviorCancelLynchToday = false;
        room.state.scapegoatToday = [];
        room.state.loversPairs = [];
        room.state.resurrectionStone = null;
        room.state.pendingCard = null;

        room.state.roleRevealReady = [];
        room.state.playerNotes = {};
        Array.from(room.players.keys()).forEach(pid => { room.state.playerNotes[pid] = []; });
        startPhase(rid, 'ROLE_REVEAL', 0);

        broadcast(room, 'GAME_STARTED', { players: toPlain(startPlayers), settings: room.settings });
        break;
      }

      case 'REQUEST_SNAPSHOT': {
        const room = rooms.get(rid);
        if (!room) return;
        const snap = snapshotRoom(rid);
        ws.send(JSON.stringify({ type: 'STATE_SNAPSHOT', payload: { roomId: rid, state: snap }, serverTime: now() }));
        break;
      }

      case 'NIGHT_ACTION_SUBMITTED': {
        const room = rooms.get(rid);
        if (!room) return;
        const action = payload && payload.action;
        if (!action) return;

        const fixed = {
          ...action,
          playerId: ws.playerId || playerId || action.playerId,
          timestamp: new Date(),
        };

        room.state.nightActions = [
          ...room.state.nightActions.filter((a) => a.playerId !== fixed.playerId),
          fixed,
        ];

        broadcast(room, 'NIGHT_ACTIONS_UPDATED', { actions: toPlain(room.state.nightActions) });
        broadcastSnapshot(rid);
        break;
      }

      case 'SUBMIT_VOTE': {
        const room = rooms.get(rid);
        if (!room) break;

        const voterId = ws.playerId;
        const targetId = payload?.targetId;
        if (!voterId || typeof targetId !== 'string') break;

        const voter = room.players.get(voterId);
        if (!voter || !voter.isAlive) break;

        room.state.votes[voterId] = targetId;
        console.log('[WS] vote:', voterId, '->', targetId);

        broadcast(room, 'VOTES_UPDATED', { votes: toPlain(room.state.votes) });
        broadcastSnapshot(rid);

        const aliveIds = Array.from(room.players.values()).filter((p) => p.isAlive).map((p) => p.id);
        const votedAliveCount = aliveIds.filter((id) => Object.prototype.hasOwnProperty.call(room.state.votes, id)).length;

        if (room.state.phase === 'VOTE' && votedAliveCount >= aliveIds.length) {
          clearTimer(room);
          processVotes(rid);
        }
        break;
      }

      case 'UPDATE_SETTINGS': {
        if (!rid) return;
        const room = rooms.get(rid);
        if (!room) return;
        if (ws.playerId !== room.ownerId) return;
        room.settings = { ...room.settings, ...payload.settings };
        broadcast(room, 'SETTINGS_UPDATED', { settings: room.settings });
        broadcastSnapshot(rid);
        break;
      }

      /* ---------- Card drawing flow ---------- */
      case 'CARD_QR_SCANNED': {
        const room = rooms.get(rid);
        if (!room) break;
        const S = room.state;

        if (S.phase !== 'CARD_DRAWING') break;
        if (ws.playerId !== S.currentCardDrawer) break;

        const token = payload?.token;
        const effects = Array.isArray(QR_CARDS[token]) ? QR_CARDS[token] : [];
        if (effects.length === 0) {
          sendToPlayer(room, ws.playerId, 'CARD_PREVIEW', { error: 'Geçersiz veya tanımsız QR kodu.' });
          break;
        }

        const picked = effects[Math.floor(Math.random() * effects.length)];
        const effectId = (typeof picked === 'string') ? picked : (picked?.effectId || picked?.id || null);
        if (!effectId) {
          sendToPlayer(room, ws.playerId, 'CARD_PREVIEW', { error: 'QR içeriği tanınamadı.' });
          break;
        }

        const eff = EFFECTS_CATALOG[effectId] || null;

        // Confirm eşleşmesi için pending kaydet
        S.pendingCard = { playerId: ws.playerId, token, effectId };

        sendToPlayer(room, ws.playerId, 'CARD_PREVIEW', {
          effectId,
          title: eff?.title || effectId,
          text: eff?.desc || '',
          token,
        });
        break;
      }

      case 'CARD_CONFIRM': {
        const room = rooms.get(rid);
        if (!room) break;
        const S = room.state;

        if (S.phase !== 'CARD_DRAWING') break;
        if (ws.playerId !== S.currentCardDrawer) break;

        const effectId = payload?.effectId;

        // pending doğrulaması
        const pc = S.pendingCard;
        if (!pc || pc.playerId !== ws.playerId || pc.effectId !== effectId) {
          sendToPlayer(room, ws.playerId, 'CARD_PREVIEW', { error: 'Kart oturumu bulunamadı' });
          break;
        }

        const extra = { targetId: payload?.targetId };
        const result = applyCardEffect(room, ws.playerId, effectId, extra);

        // clear pending & bildir
        S.pendingCard = null;
        sendToPlayer(room, ws.playerId, 'CARD_APPLIED_PRIVATE', { effectId, result });

        // herkes güncel durumu görsün
        broadcastSnapshot(rid);

        // sırayı kapat
        S.selectedCardDrawers = [];
        S.currentCardDrawer = null;
        S.currentCardDrawerIndex = 0;

        // Faz geçişi (gündüzü atlayabilir)
        if (result && result.skipDay) {
          startPhase(rid, 'NIGHT', room.settings.nightDuration || 60);
        } else {
          startPhase(rid, 'DAY_DISCUSSION', room.settings.dayDuration || 120);
        }
        break;
      }
      /* -------------------------------------- */

      case 'PLAYER_READY': {
        const room = rooms.get(rid);
        if (!room) break;
        const S = room.state;
        if (S.phase !== 'ROLE_REVEAL') break;
        const voterId = ws.playerId;
        const p = room.players.get(voterId);
        if (!p || !p.isAlive) break;
        if (!S.roleRevealReady.includes(voterId)) {
          S.roleRevealReady.push(voterId);
        }
        const aliveIds = Array.from(room.players.values()).filter(pl => pl.isAlive).map(pl => pl.id);
        const readyCount = S.roleRevealReady.filter(id => aliveIds.includes(id)).length;
        broadcast(room, 'ROLE_REVEAL_READY_UPDATED', { ready: readyCount, total: aliveIds.length });
        if (readyCount >= aliveIds.length) {
          clearTimer(room);
          startPhase(rid, 'NIGHT', room.settings.nightDuration || 60);
        }
        break;
      }

      case 'REQUEST_END_DISCUSSION': {
        const room = rooms.get(rid);
        if (!room) break;
        const S = room.state;
        if (S.phase !== 'DAY_DISCUSSION') break;
        const voterId = ws.playerId;
        const p = room.players.get(voterId);
        if (!p || !p.isAlive) break;
        if (!S.discussionEndVoters.includes(voterId)) {
          S.discussionEndVoters.push(voterId);
        }
        const aliveIds = Array.from(room.players.values()).filter(pl => pl.isAlive).map(pl => pl.id);
        const voteCount = S.discussionEndVoters.filter(id => aliveIds.includes(id)).length;
        broadcast(room, 'DISCUSSION_END_PROGRESS', { votes: voteCount, total: aliveIds.length });
        if (voteCount >= aliveIds.length) {
          clearTimer(room);
          startPhase(rid, 'VOTE', room.settings.voteDuration || 45);
        }
        break;
      }

      case 'OWNER_START_VOTE_NOW': {
        const room = rooms.get(rid);
        if (!room) break;
        const S = room.state;
        if (S.phase !== 'DAY_DISCUSSION') break;
        if (ws.playerId !== room.ownerId) break;
        clearTimer(room);
        startPhase(rid, 'VOTE', room.settings.voteDuration || 45);
        break;
      }

      case 'RESET_GAME': {
        if (!rid) break;
        const room = rooms.get(rid);
        if (!room) break;

        room.state = {
          phase: 'LOBBY',
          currentTurn: 1,
          nightActions: [],
          votes: {},
          deathsThisTurn: [],
          deathLog: [],
          bombsByOwner: {},
          playerNotes: {},
          roleRevealReady: [],
          discussionEndVoters: [],
          game: null,
          phaseEndsAt: 0,
          selectedCardDrawers: [],
          currentCardDrawerIndex: 0,
          currentCardDrawer: null,

          // QR effects state
          cardShieldsNextNight: [],
          reflectAttacksTonight: [],
          reverseProtectEffectsTonight: false,
          bypassShieldsActorNextNight: [],
          roleLockRandomNextNight: [],
          doubleVoteToday: [],
          voteBanToday: [],
          lynchImmunityToday: [],
          lynchSwapIfSelfToday: [],
          saviorCancelLynchToday: false,
          scapegoatToday: [],
          loversPairs: [],
          resurrectionStone: null,
          pendingCard: null,
        };

        clearTimer(room);

        room.players.forEach((p, id) => {
          room.players.set(id, {
            ...p,
            role: undefined,
            displayRole: undefined,
            isAlive: true,
            isMuted: false,
            hasShield: false,
          });
        });

        broadcast(room, 'RESET_GAME', { players: Array.from(room.players.values()) });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const { roomId, playerId } = ws;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const removed = room.players.get(playerId);
      room.players.delete(playerId);
      room.sockets.delete(ws);
      broadcast(room, 'PLAYER_LIST_UPDATED', {
        players: Array.from(room.players.values()),
        removedPlayer: removed,
      });
      if (room.players.size === 0) {
        clearTimer(room);
        rooms.delete(roomId);
      }
    }
  });

  ws.on('error', (err) => console.error('WS error:', err?.message || err));
});

/* ---------------- Heartbeat ---------------- */
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      try {
        ws.terminate();
      } catch (_) {}
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (_) {}
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

/* ---------------- HTTP ---------------- */
app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});
