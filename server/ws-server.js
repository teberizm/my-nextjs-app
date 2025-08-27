// ws-server.js (authoritative server: timers + roles + actions + votes + QR card draw)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// 🔗 Harici kart verileri
const { EFFECTS_CATALOG } = require('./data/effects-catalog');
const { QR_CARDS } = require('./data/qr-cards');

const app = express();
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
 *     bombTargets: string[],
 *     playerNotes: Record<string, string[]>,
 *     game: { startedAt: Date, endedAt?: Date, winningSide?: string } | null,
 *     phaseEndsAt: number,
 *     // Card drawing
 *     selectedCardDrawers: string[],
 *     currentCardDrawerIndex: number,
 *     currentCardDrawer: string | null,
 *     // Card/effect helpers
 *     lastCardDrawer: string | null,
 *     lastCardEffect: string | null,
 *     effectFlags: {
 *       darkPierceTonight?: boolean
 *     },
 *     roleLocks: Record<string, number>,  // playerId -> remaining nights locked
 *     resurrectionStones: Record<string, number>, // playerId -> remaining nights (auto revive once)
 *     lovers: string[] | null // [id1, id2]
 *   },
 *   timer: NodeJS.Timeout | null
 * }
 */

const rooms = new Map();

const now = () => Date.now();
const toPlain = (obj) =>
  JSON.parse(JSON.stringify(obj, (k, v) => (v instanceof Date ? v.toISOString() : v)));

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
function sendToPlayer(room, playerId, type, payload) {
  for (const s of room.sockets) {
    if (s.readyState === WebSocket.OPEN && s.playerId === playerId) {
      s.send(JSON.stringify({ type, payload, serverTime: now() }));
      break;
    }
  }
}

function snapshotRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const players = Array.from(room.players.values());
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

/* ---------------- Win condition (lovers eklemeli) ---------------- */
function getWinCondition(players, state) {
  const alive = players.filter((p) => p.isAlive);
  const bombers = alive.filter((p) => p.role === 'BOMBER');
  const traitors = alive.filter((p) => isTraitorRole(p.role));
  const nonTraitors = alive.filter((p) => !isTraitorRole(p.role) && p.role !== 'BOMBER');

  // Lovers special: son iki kişi âşıklarsa âşıklar kazanır
  if (state?.lovers && state.lovers.length === 2 && alive.length === 2) {
    const ids = alive.map((p) => p.id).sort().join('|');
    const loversKey = [...state.lovers].sort().join('|');
    if (ids === loversKey) {
      return { winner: 'LOVERS', gameEnded: true };
    }
  }

  if (bombers.length > 0 && alive.length - bombers.length <= 1) {
    return { winner: 'BOMBER', gameEnded: true };
  }
  if (bombers.length === 0 && traitors.length >= nonTraitors.length && traitors.length > 0) {
    return { winner: 'TRAITORS', gameEnded: true };
  }
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
    // gece başlarken bazı sayaçlar
    // rol kilitleri düşür
    const locks = room.state.roleLocks || {};
    Object.keys(locks).forEach(pid => {
      locks[pid] = Math.max(0, (locks[pid] || 0) - 1);
      if (locks[pid] === 0) delete locks[pid];
    });
    room.state.roleLocks = locks;

    // karanlık güç bayrağı sadece o gece geçerli
    room.state.effectFlags.darkPierceTonight = false;

    room.state.nightActions = [];
    room.state.deathsThisTurn = [];
  }
  if (phase === 'VOTE') {
    room.state.votes = {};
  }

  room.state.phase = phase;
  room.state.phaseEndsAt = now() + Math.max(0, durationSec) * 1000;

  // Kart çekme fazına girerken: 1 canlı oyuncu seç, yalnız ona READY gönder
  if (phase === 'CARD_DRAWING') {
    const S = room.state;
    const alive = Array.from(room.players.values()).filter(p => p.isAlive);
    const count = Math.min(1, alive.length); // şimdilik 1'e sabit
    const order = alive.map(p => p.id).sort(() => Math.random() - 0.5).slice(0, count);
    S.selectedCardDrawers = order;
    S.currentCardDrawerIndex = 0;
    S.currentCardDrawer = order[0] || null;
    if (S.currentCardDrawer) {
      sendToPlayer(room, S.currentCardDrawer, "CARD_DRAW_READY", {
        message: "Kamerayı aç ve QR kartını okut (veya butona bas).",
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

/* --------- Helpers --------- */
const randPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Kart etkilerini uygula (özet uygulamalar) */
function applyCardEffect(room, effectId, drawerId) {
  const S = room.state;
  const players = Array.from(room.players.values());
  const getAlive = () => players.filter(p => p.isAlive);

  // Küçük yardımcılar
  const addNote = (pid, text) => {
    S.playerNotes[pid] = [...(S.playerNotes[pid] || []), `${S.currentTurn}. Gün: ${text}`];
  };

  switch (effectId) {
    // Eski id ile uyumluluk
    case "REVIVE_RANDOM_FROM_DEATHS_THIS_TURN":
    case "REVIVE_RANDOM_THIS_TURN": {
      const deaths = Array.isArray(S.deathsThisTurn) ? S.deathsThisTurn : [];
      if (deaths.length === 0) return { ok: false, note: "Bu tur kimse ölmedi." };
      const target = randPick(deaths);
      const p = room.players.get(target.id);
      if (p) {
        p.isAlive = true;
        addNote(p.id, "Kart ile dirildin");
      }
      return { ok: true, revivedId: target.id };
    }

    case "SHIELD_RANDOM_TONIGHT":
    case "GIVE_RANDOM_ALIVE_SHIELD": {
      const alive = getAlive();
      if (alive.length === 0) return { ok: false, note: "Canlı oyuncu yok." };
      const tgt = randPick(alive);
      const p = room.players.get(tgt.id);
      if (p) p.hasShield = true;
      return { ok: true, shieldedId: tgt.id };
    }

    case "DARK_POWER_BYPASS_SHIELDS": {
      // Çeken oyuncunun KILL aksiyonu bu gece kalkanları deler
      S.effectFlags.darkPierceTonight = true;
      S.lastCardDrawer = drawerId || null;
      S.lastCardEffect = effectId;
      addNote(drawerId, "Karanlık Güç: Bu gece saldırın kalkanları deler.");
      return { ok: true, flag: "darkPierceTonight" };
    }

    case "SKIP_DAY_START_NIGHT":
    case "SKIP_TO_NIGHT_IMMEDIATE": {
      // Faz geçişini CARD_CONFIRM içinde yapacağız (burada sadece işaret koy)
      S.lastCardDrawer = drawerId || null;
      S.lastCardEffect = effectId;
      return { ok: true, skipDay: true };
    }

    case "ROLE_LOCK_RANDOM": {
      const alive = getAlive();
      if (alive.length === 0) return { ok: false, note: "Canlı oyuncu yok." };
      const tgt = randPick(alive);
      S.roleLocks[tgt.id] = Math.max(1, (S.roleLocks[tgt.id] || 0) + 1); // 1 gece kilitli
      addNote(tgt.id, "Rol kilidi: Bu gece aksiyon yapamazsın.");
      return { ok: true, roleLockedId: tgt.id, nights: S.roleLocks[tgt.id] };
    }

    case "LOVERS_BIND": {
      const alive = getAlive();
      if (alive.length < 2) return { ok: false, note: "Yeterli canlı oyuncu yok." };
      // Çeken hariçten biri seç, sonra bir tane daha (veya tamamen rastgele)
      let a = randPick(alive);
      let b = randPick(alive.filter(p => p.id !== a.id));
      S.lovers = [a.id, b.id];
      addNote(a.id, `Aşık oldun: ${b.name}`);
      addNote(b.id, `Aşık oldun: ${a.name}`);
      return { ok: true, lovers: [a.id, b.id] };
    }

    default:
      return { ok: true, noop: true };
  }
}

/* --------- Core resolvers (authoritative) ---------- */
function processNightActions(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const players = Array.from(room.players.values());

  // 0) Rol kilitli oyuncuların aksiyonlarını otomatik iptal et
  const roleLocked = new Set(Object.keys(S.roleLocks || {}));
  S.nightActions = S.nightActions.filter(a => {
    if (roleLocked.has(a.playerId)) {
      const pl = room.players.get(a.playerId);
      if (pl) {
        S.playerNotes[pl.id] = [...(S.playerNotes[pl.id] || []), `${S.currentTurn}. Gece: rol kilidi nedeniyle aksiyon yapamadın`];
      }
      return false;
    }
    return true;
  });

  // 1) Guardians block (by timestamp)
  const blockedPlayers = new Set();
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
      S.playerNotes[a.targetId] = [...(S.playerNotes[a.targetId] || []), `${S.currentTurn}. Gece: Gardiyan tarafından tutuldun`];
    }
  });

  // 2) Kills
  const killers = S.nightActions.filter(
    (a) => a.actionType === 'KILL' && !blockedPlayers.has(a.playerId),
  );
  const killTargets = killers.map((k) => k.targetId).filter(Boolean);

  // 3) Doctor revives after kills
  const revived = new Set();
  const doctorResults = new Map();
  S.nightActions
    .filter((a) => {
      const actor = players.find((p) => p.id === a.playerId);
      return a.actionType === 'PROTECT' && actor && actor.role === 'DOCTOR';
    })
    .forEach((a) => {
      const actor = players.find((p) => p.id === a.playerId);
      const target = players.find((p) => p.id === a.targetId);
      if (!actor || blockedPlayers.has(actor.id)) {
        doctorResults.set(a.playerId, { success: false });
        return;
      }
      if (target && (!target.isAlive || killTargets.includes(target.id))) {
        revived.add(target.id);
        doctorResults.set(a.playerId, { success: true });
      } else {
        doctorResults.set(a.playerId, { success: false });
      }
    });

  // 4) Bombs + notes (short)
  const bombPlacers = S.nightActions.filter(
    (a) => a.actionType === 'BOMB_PLANT' && !blockedPlayers.has(a.playerId),
  );
  const detonateAction = S.nightActions.find(
    (a) => a.actionType === 'BOMB_DETONATE' && !blockedPlayers.has(a.playerId),
  );

  let newBombTargets = [...S.bombTargets];
  bombPlacers.forEach((a) => {
    if (a.targetId && !newBombTargets.includes(a.targetId)) newBombTargets.push(a.targetId);
  });

  const protectedPlayers = new Set();
  const survivorActors = new Set();
  let detonateIndex = -1;

  const updatedActions = S.nightActions.map((action, idx) => {
    const actor = players.find((p) => p.id === action.playerId);
    const target = players.find((p) => p.id === action.targetId);
    let result = null;

    if (!actor) return { ...action };
    if (blockedPlayers.has(actor.id)) return { ...action, result: { type: 'BLOCKED' } };

    if (action.actionType === 'PROTECT' && actor.role !== 'DELI') {
      if ((actor.role === 'GUARDIAN' || actor.role === 'EVIL_GUARDIAN') && action.targetId) {
        result = { type: 'BLOCK' };
      } else if (actor.role === 'SURVIVOR') {
        if (actor.survivorShields && actor.survivorShields > 0 && action.targetId === actor.id) {
          protectedPlayers.add(actor.id);
          survivorActors.add(actor.id);
          const remaining = Math.max((actor.survivorShields || 0) - 1, 0);
          result = { type: 'PROTECT', remaining };
        }
      } else if (actor.role === 'DOCTOR') {
        const doc = doctorResults.get(actor.id);
        if (doc) result = { type: 'REVIVE', success: doc.success };
      } else if (action.targetId) {
        protectedPlayers.add(action.targetId);
        result = { type: 'PROTECT' };
      }
    }

    if (action.actionType === 'INVESTIGATE' && target) {
      if (actor.role === 'DELI') {
        const pool = ['DOCTOR','GUARDIAN','WATCHER','DETECTIVE','BOMBER','SURVIVOR'];
        const r1 = pool[Math.floor(Math.random()*pool.length)];
        let r2 = pool[Math.floor(Math.random()*pool.length)];
        if (r2 === r1) r2 = pool[(pool.indexOf(r1)+1)%pool.length];
        result = { type: 'DETECT', roles: [r1, r2] };
      } else if (actor.role === 'WATCHER' || actor.role === 'EVIL_WATCHER') {
        const visitors = S.nightActions
          .filter((a) => a.targetId === target.id && a.playerId !== actor.id && a.playerId !== target.id && !blockedPlayers.has(a.playerId))
          .map((a) => players.find((p) => p.id === a.playerId)?.name || '')
          .filter(Boolean);
        result = { type: 'WATCH', visitors };
      } else if (actor.role === 'DETECTIVE' || actor.role === 'EVIL_DETECTIVE') {
        const roles = ['DOCTOR','GUARDIAN','WATCHER','DETECTIVE','BOMBER','SURVIVOR'];
        const actual = target.role;
        let fake = roles[Math.floor(Math.random()*roles.length)];
        if (fake === actual) fake = roles[(roles.indexOf(fake)+1)%roles.length];
        const shown = [actual, fake].sort(() => Math.random()-0.5);
        result = { type: 'DETECT', roles: [shown[0], shown[1]] };
      }
    }

    if (action.actionType === 'BOMB_PLANT') result = { type: 'BOMB_PLANT' };
    else if (action.actionType === 'BOMB_DETONATE') detonateIndex = idx;

    // Notes
    if (result) {
      const prefix = `${S.currentTurn}. Gece:`;
      let note = '';
      if (result.type === 'PROTECT') {
        if (actor.role === 'SURVIVOR' && action.targetId === actor.id) {
          note = `${prefix} Kendini korudun (${result.remaining} hak kaldı)`;
        } else if (target) {
          note = `${prefix} ${target.name} oyuncusunu korudun`;
        }
      } else if (result.type === 'BLOCK' && target) {
        note = `${prefix} ${target.name} oyuncusunu tuttun`;
      } else if (result.type === 'REVIVE' && target) {
        note = result.success
          ? `${prefix} ${target.name} oyuncusunu dirilttin`
          : `${prefix} ${target.name} oyuncusunu diriltmeyi denedin`;
      } else if (result.type === 'WATCH' && target) {
        const vt = (result.visitors && result.visitors.length > 0) ? result.visitors.join(', ') : 'kimse gelmedi';
        note = `${prefix} ${target.name} oyuncusunu izledin: ${vt}`;
      } else if (result.type === 'DETECT' && target) {
        const [r1, r2] = result.roles || [];
        note = `${prefix} ${target.name} oyuncusunu soruşturdun: ${r1}, ${r2}`;
      } else if (result.type === 'BOMB_PLANT' && target) {
        note = `${prefix} ${target.name} oyuncusuna bomba yerleştirdin`;
      }
      if (note) {
        S.playerNotes[actor.id] = [...(S.playerNotes[actor.id] || []), note];
      }
    }

    return { ...action, result };
  });

  // 5) Bomb detonate victims
  let bombVictims = [];
  if (detonateIndex !== -1) {
    bombVictims = players.filter((p) => newBombTargets.includes(p.id) && p.isAlive);
    const victimNames = bombVictims.map((p) => p.name);
    updatedActions[detonateIndex] = {
      ...updatedActions[detonateIndex],
      result: { type: 'BOMB_DETONATE', victims: victimNames },
    };
    const actorId = updatedActions[detonateIndex].playerId;
    const text = victimNames.length > 0 ? victimNames.join(', ') : 'kimse ölmedi';
    S.playerNotes[actorId] = [...(S.playerNotes[actorId] || []), `${S.currentTurn}. Gece: bombaları patlattın: ${text}`];
    newBombTargets = [];
  }

  const targetedIds = killTargets.filter(Boolean);
  const bombVictimIds = bombVictims.map((p) => p.id);
  const newDeaths = [];

  // 6) Apply effects to players map (authoritative)
  const newPlayersMap = new Map(room.players);
  Array.from(newPlayersMap.values()).forEach((pl) => { pl.hasShield = false; });

  protectedPlayers.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.hasShield = true; });
  survivorActors.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.survivorShields = Math.max((p.survivorShields || 0) - 1, 0); });
  revived.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.isAlive = true; });

  // KILL uygularken "karanlık güç" delme kuralı:
  Array.from(newPlayersMap.values()).forEach((p) => {
    const targeted = targetedIds.includes(p.id);
    const bombed = bombVictimIds.includes(p.id);
    let pierced = false;
    if (S.effectFlags.darkPierceTonight && S.lastCardDrawer) {
      // Bu gece KILL yapan son kart çeken oyuncuysa hedefte kalkan yokmuş gibi davran
      const killByDrawer = S.nightActions.find(a => a.actionType === 'KILL' && a.playerId === S.lastCardDrawer && a.targetId === p.id);
      if (killByDrawer) pierced = true;
    }

    if (bombed && !revived.has(p.id)) {
      if (p.isAlive) { p.isAlive = false; newDeaths.push({ ...p }); }
    } else if (targeted && !revived.has(p.id)) {
      const protectedNow = p.hasShield && !pierced;
      if (!protectedNow && p.isAlive) { p.isAlive = false; newDeaths.push({ ...p }); }
    }
  });

  // âşıklar zinciri: biri bu tur ölürse diğeri de ölür (revive edilmediyse)
  if (S.lovers && S.lovers.length === 2) {
    const [aId, bId] = S.lovers;
    const aDied = newDeaths.some(d => d.id === aId);
    const bDied = newDeaths.some(d => d.id === bId);
    if (aDied && !bDied) {
      const other = newPlayersMap.get(bId);
      if (other && other.isAlive) {
        other.isAlive = false;
        newDeaths.push({ ...other });
      }
    } else if (bDied && !aDied) {
      const other = newPlayersMap.get(aId);
      if (other && other.isAlive) {
        other.isAlive = false;
        newDeaths.push({ ...other });
      }
    }
  }

  room.players = newPlayersMap;

  // attackers notes
  S.nightActions.filter((a) => a.actionType === 'KILL').forEach((a) => {
    const actor = room.players.get(a.playerId);
    const target = a.targetId ? room.players.get(a.targetId) : null;
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

  S.nightActions = updatedActions;
  S.deathsThisTurn = newDeaths;
  if (newDeaths.length > 0) S.deathLog = [...S.deathLog, ...newDeaths];
  S.bombTargets = newBombTargets;

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
    if (voter?.isAlive && targetId !== 'SKIP') {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });

  let maxVotes = 0;
  let eliminatedId = null;
  Object.entries(voteCount).forEach(([pid, count]) => {
    if (count > maxVotes) { maxVotes = count; eliminatedId = pid; }
  });

  const top = Object.entries(voteCount).filter(([, c]) => c === maxVotes);
  if (top.length > 1) eliminatedId = null; // beraberlik → kimse elenmez

  const newPlayersMap = new Map(room.players);
  const newDeaths = [];
  if (eliminatedId && maxVotes > 0) {
    const target = newPlayersMap.get(eliminatedId);
    if (target && target.isAlive) {
      target.isAlive = false;
      newDeaths.push({ ...target });
    }
  }

  // âşık zinciri (gündüz asılmada da çalışsın)
  if (S.lovers && S.lovers.length === 2) {
    const [aId, bId] = S.lovers;
    const aDied = newDeaths.some(d => d.id === aId);
    const bDied = newDeaths.some(d => d.id === bId);
    if (aDied && !bDied) {
      const other = newPlayersMap.get(bId);
      if (other && other.isAlive) { other.isAlive = false; newDeaths.push({ ...other }); }
    } else if (bDied && !aDied) {
      const other = newPlayersMap.get(aId);
      if (other && other.isAlive) { other.isAlive = false; newDeaths.push({ ...other }); }
    }
  }

  room.players = newPlayersMap;
  S.deathsThisTurn = newDeaths;
  if (newDeaths.length > 0) S.deathLog = [...S.deathLog, ...newDeaths];

  broadcast(room, "VOTE_RESULT", {
    votes: S.votes,
    voteCount: voteCount,
    eliminatedId: eliminatedId,
  });

  broadcastSnapshot(roomId);
  startPhase(roomId, 'RESOLVE', 3);
}

function advancePhase(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const settings = room.settings || { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 1 };

  const { winner, gameEnded } = getWinCondition(Array.from(room.players.values()), S);
  if (gameEnded && S.phase !== 'END') {
    S.game = { ...(S.game || {}), endedAt: new Date(), winningSide: winner };
    startPhase(roomId, 'END', 0);
    return;
  }

  switch (S.phase) {
    case 'ROLE_REVEAL':
      startPhase(roomId, 'NIGHT', settings.nightDuration);
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
      // Otomatik geçiş yok; kart onayıyla değişir
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
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch (e) { console.error('Invalid WS message', e); return; }

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
            settings: { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 1 }, // default 1
            state: {
              phase: 'LOBBY',
              currentTurn: 1,
              nightActions: [],
              votes: {},
              deathsThisTurn: [],
              deathLog: [],
              bombTargets: [],
              playerNotes: {},
              game: null,
              phaseEndsAt: 0,
              // cards
              selectedCardDrawers: [],
              currentCardDrawerIndex: 0,
              currentCardDrawer: null,
              lastCardDrawer: null,
              lastCardEffect: null,
              effectFlags: { darkPierceTonight: false },
              roleLocks: {},
              resurrectionStones: {},
              lovers: null,
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
          try { targetSocket.close(); } catch (_) {}
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
        room.state.bombTargets = [];
        room.state.playerNotes = {};
        // reset card state
        room.state.selectedCardDrawers = [];
        room.state.currentCardDrawerIndex = 0;
        room.state.currentCardDrawer = null;
        room.state.lastCardDrawer = null;
        room.state.lastCardEffect = null;
        room.state.effectFlags.darkPierceTonight = false;
        room.state.roleLocks = {};
        room.state.resurrectionStones = {};
        room.state.lovers = null;

        startPhase(rid, 'ROLE_REVEAL', 10);

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

        // Rol kilidi kontrolü
        const pId = ws.playerId || playerId || action.playerId;
        if (room.state.roleLocks && room.state.roleLocks[pId] > 0) {
          sendToPlayer(room, pId, 'ERROR', { message: 'Rol kilidi nedeniyle bu gece aksiyon yapamazsın.' });
          break;
        }

        const fixed = {
          ...action,
          playerId: pId,
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

        const aliveIds = Array.from(room.players.values()).filter(p => p.isAlive).map(p => p.id);
        const votedAliveCount = aliveIds.filter(id => Object.prototype.hasOwnProperty.call(room.state.votes, id)).length;

        if (room.state.phase === 'VOTE' && votedAliveCount >= aliveIds.length) {
          clearTimer(room);
          processVotes(rid);
        }
        break;
      }

      case "UPDATE_SETTINGS": {
        if (!rid) return;
        const room = rooms.get(rid);
        if (!room) return;
        if (ws.playerId !== room.ownerId) return;
        room.settings = { ...room.settings, ...payload.settings };
        broadcast(room, "SETTINGS_UPDATED", { settings: room.settings });
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
        const list = QR_CARDS && QR_CARDS[token];
        if (!Array.isArray(list) || list.length === 0) {
          sendToPlayer(room, ws.playerId, "CARD_PREVIEW", { error: "Geçersiz veya tanımsız QR kodu." });
          break;
        }
        const effectId = randPick(list);
        const meta = EFFECTS_CATALOG[effectId] || {};
        const text = meta?.desc || meta?.title || `Etki: ${effectId}`;
        sendToPlayer(room, ws.playerId, "CARD_PREVIEW", {
          effectId,
          text,
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
        const result = applyCardEffect(room, effectId, ws.playerId);

        // özel: skip day ise doğrudan geceye
        const shouldSkipDay = result && result.skipDay === true;

        sendToPlayer(room, ws.playerId, "CARD_APPLIED_PRIVATE", { effectId, result });

        // herkes güncel durumu görsün
        broadcastSnapshot(rid);

        // sırayı kapat
        S.selectedCardDrawers = [];
        S.currentCardDrawer = null;
        S.currentCardDrawerIndex = 0;

        if (shouldSkipDay) {
          // direkt geceye geç
          startPhase(rid, 'NIGHT', room.settings.nightDuration || 60);
        } else {
          // normal akış
          startPhase(rid, 'DAY_DISCUSSION', room.settings.dayDuration || 120);
        }
        break;
      }
      /* -------------------------------------- */

      case "RESET_GAME": {
        if (!rid) break;
        const room = rooms.get(rid);
        if (!room) break;

        room.state = {
          phase: "LOBBY",
          currentTurn: 1,
          nightActions: [],
          votes: {},
          deathsThisTurn: [],
          deathLog: [],
          bombTargets: [],
          playerNotes: {},
          game: null,
          phaseEndsAt: 0,
          selectedCardDrawers: [],
          currentCardDrawerIndex: 0,
          currentCardDrawer: null,
          lastCardDrawer: null,
          lastCardEffect: null,
          effectFlags: { darkPierceTonight: false },
          roleLocks: {},
          resurrectionStones: {},
          lovers: null,
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

        broadcast(room, "RESET_GAME", { players: Array.from(room.players.values()) });
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
      try { ws.terminate(); } catch (_) {}
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {}
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

/* ---------------- HTTP ---------------- */
app.get('/', (req, res) => res.send('Socket server OK'));

server.listen(3001, '0.0.0.0', () => {
  console.log('✅ WebSocket sunucu çalışıyor http://0.0.0.0:3001');
});
