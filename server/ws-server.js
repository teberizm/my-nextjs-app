// ws-server.js (authoritative server: timers + roles + actions + votes + QR card draw + full effects)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

// 🔗 Harici kart verileri
//  - /data/effects-catalog.js  => { EFFECTS_CATALOG: { [effectId]: { title, desc } } }
//  - /data/qr-cards.js         => { QR_CARDS: { [qrToken]: [effectId, effectId] } }
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
 *
 *     /* ---- Effects / flags (gün/gece kapsamı) ---- */
 *     lastCardDrawer: string | null,
 *     lastCardEffect: string | null,
 *
 *     // Geceye etki eden anlık bayraklar
 *     effectFlags: { darkPierceTonight: boolean },   // karanlık güç: o gece zırh deler
 *     mirrorTonight: Record<string, boolean>,        // ayna: bu gece hedeflenirse saldıran ölür
 *     reverseActionTonight: Record<string, boolean>, // ters etki: KILL↔PROTECT
 *     preNightProtected: string[],                   // bu gece pasif kalkan verilecek id’ler (karttan)
 *
 *     // Gündüz-oy etkileri (bugün geçerli)
 *     voteWeightToday: Record<string, number>,       // çift oy vb.
 *     voteBanToday: Record<string, boolean>,         // oy yasağı
 *     voteImmunityToday: Record<string, boolean>,    // asılamaz
 *     scapegoatToday: string | null,                 // günah keçisi (biri asılırsa bu ölür)
 *     sacrificeToday: Record<string, boolean>,       // kurban: eğer bu asılırsa yerine rastgele biri
 *     pardonToday: boolean,                          // kurtarıcı: bugün asılma bir defa iptal
 *
 *     // Diriliş taşı: bugün (turn T) ve bir sonraki gece (turn T+1) geçerli
 *     resurrectionStones: Record<string, { dayTurn: number, nightTurn: number }>,
 *
 *     // Aşıklar
 *     lovers: string[] | null,
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

/* ---------------- Roles ---------------- */
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

/* ---------------- Win condition (lovers) ---------------- */
function getWinCondition(players, state) {
  const alive = players.filter((p) => p.isAlive);
  const bombers = alive.filter((p) => p.role === 'BOMBER');
  const traitors = alive.filter((p) => isTraitorRole(p.role));
  const nonTraitors = alive.filter((p) => !isTraitorRole(p.role) && p.role !== 'BOMBER');

  // Lovers: son iki kişi ise âşıklar kazanır
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
  const room = rooms.get(roomId);
  if (!room) return;

  clearTimer(room);

  // per-phase resets
  if (phase === 'NIGHT') {
    // Gecelik sayaçlar
    const locks = room.state.roleLocks || {};
    Object.keys(locks).forEach(pid => {
      locks[pid] = Math.max(0, (locks[pid] || 0) - 1);
      if (locks[pid] === 0) delete locks[pid];
    });
    room.state.roleLocks = locks;

    room.state.effectFlags.darkPierceTonight = false; // sadece o gece
    // preNightProtected burada SAKLANIR; processNightActions içerisinde tüketilir
    room.state.nightActions = [];
    room.state.deathsThisTurn = [];
    // Gündüz etkilerini burada temizliyoruz (bir önceki gün biterken)
    room.state.voteWeightToday = {};
    room.state.voteBanToday = {};
    room.state.voteImmunityToday = {};
    room.state.scapegoatToday = null;
    room.state.sacrificeToday = {};
    room.state.pardonToday = false;
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
    const order = alive.map(p => p.id).sort(() => Math.random() - 0.5).slice(0, 1); // 1 kişi
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

/* ====== KART ETKİLERİ ======
  Aşağıdaki effectId’ler desteklenir (QR_CARDS içinde kullanılabilir):
  - REVIVE_RANDOM_THIS_TURN
  - REVIVE_RANDOM_FROM_DEATH_LOG
  - SHIELD_RANDOM_TONIGHT
  - DOUBLE_SHIELD_TONIGHT
  - HINT_BLURRY
  - DOUBLE_VOTE_TODAY
  - EXPLODING_CARD
  - MASS_FAKE_NOTE_PUBLIC
  - RUMOR_PRIVATE
  - ROLE_REVEAL_RANDOM_PUBLIC
  - SELF_IMMUNE_TODAY
  - VOTE_BAN_TODAY
  - MIRROR_TONIGHT
  - REVERSE_ACTION_TONIGHT
  - SECRET_SPILL_PUBLIC
  - SECRET_MESSAGE_PRIVATE
  - LOVERS_BIND
  - SCAPEGOAT_TODAY
  - CONFESSION_PUBLIC
  - SKIP_TO_NIGHT_IMMEDIATE
  - DARK_POWER_BYPASS_SHIELDS
  - RESURRECTION_STONE_TODAY_AND_NEXT_NIGHT
  - DETECTIVE_NOTE_LAST_TURN
  - SACRIFICE_IF_LYNCHED_TODAY
  - TRUST_RANDOM_IMMUNE_TODAY
  - SAVIOR_PARDON_TODAY
  - ROLE_LOCK_RANDOM
  - TWO_ROLE_HINT_RANDOM
*/
function applyCardEffect(room, effectId, drawerId) {
  const S = room.state;
  const players = Array.from(room.players.values());
  const alive = () => players.filter(p => p.isAlive);
  const addNoteDay = (pid, text) => {
    S.playerNotes[pid] = [...(S.playerNotes[pid] || []), `${S.currentTurn}. Gün: ${text}`];
  };

  switch (effectId) {
    /* ---- Diriltme ---- */
    case "REVIVE_RANDOM_THIS_TURN": {
      const deaths = Array.isArray(S.deathsThisTurn) ? S.deathsThisTurn : [];
      if (deaths.length === 0) return { ok: false, note: "Bu tur kimse ölmedi." };
      const target = randPick(deaths);
      const p = room.players.get(target.id);
      if (p) {
        p.isAlive = true;
        addNoteDay(p.id, "Kart ile dirildin.");
      }
      return { ok: true, revivedId: target.id };
    }
    case "REVIVE_RANDOM_FROM_DEATH_LOG": {
      const pool = (S.deathLog || []).filter(d => !room.players.get(d.id)?.isAlive);
      if (pool.length === 0) return { ok: false, note: "Ölü listesinde diriltilecek kimse yok." };
      const pick = randPick(pool);
      const p = room.players.get(pick.id);
      if (p) {
        p.isAlive = true;
        addNoteDay(p.id, "Geçmişten diriltildin.");
      }
      return { ok: true, revivedId: pick.id };
    }

    /* ---- Kalkanlar ---- */
    case "SHIELD_RANDOM_TONIGHT": {
      const a = alive();
      if (a.length === 0) return { ok: false, note: "Canlı yok." };
      const t = randPick(a);
      S.preNightProtected.push(t.id);
      return { ok: true, protected: [t.id] };
    }
    case "DOUBLE_SHIELD_TONIGHT": {
      const a = alive();
      if (a.length === 0) return { ok: false, note: "Canlı yok." };
      const shuffled = a.sort(() => Math.random() - 0.5);
      const picks = [...new Set(shuffled.slice(0, Math.min(2, a.length)).map(p => p.id))];
      S.preNightProtected.push(...picks);
      return { ok: true, protected: picks };
    }

    /* ---- İpuçları ---- */
    case "HINT_BLURRY": {
      const traitorsAlive = alive().filter(p => isTraitorRole(p.role)).length;
      const fudge = Math.max(0, traitorsAlive + (Math.random() < 0.5 ? -1 : +1));
      const text = `Bulanık ipucu: Masada ${Math.max(0, fudge)} hain olabilir.`;
      sendToPlayer(room, drawerId, "CARD_SECRET_INFO", { text });
      return { ok: true };
    }
    case "TWO_ROLE_HINT_RANDOM": {
      const a = alive();
      if (a.length === 0) return { ok: false };
      const t = randPick(a);
      const roles = ['DOCTOR','GUARDIAN','WATCHER','DETECTIVE','BOMBER','SURVIVOR'];
      const actual = t.role;
      let fake = randPick(roles);
      if (fake === actual) fake = roles[(roles.indexOf(fake)+1)%roles.length];
      const shown = [actual, fake].sort(() => Math.random()-0.5);
      const text = `Rastgele ${t.name} için olası roller: ${shown[0]} veya ${shown[1]}`;
      sendToPlayer(room, drawerId, "CARD_SECRET_INFO", { text, targetId: t.id });
      return { ok: true };
    }

    /* ---- Oy etkileri ---- */
    case "DOUBLE_VOTE_TODAY": {
      S.voteWeightToday[drawerId] = 2;
      addNoteDay(drawerId, "Bugün oyun iki sayılıyor.");
      return { ok: true, weight: 2 };
    }
    case "VOTE_BAN_TODAY": {
      S.voteBanToday[drawerId] = true;
      addNoteDay(drawerId, "Bugün oy kullanamazsın.");
      return { ok: true, banned: true };
    }
    case "SELF_IMMUNE_TODAY": {
      S.voteImmunityToday[drawerId] = true;
      addNoteDay(drawerId, "Bugün asılamazsın.");
      return { ok: true, immune: true };
    }
    case "TRUST_RANDOM_IMMUNE_TODAY": {
      const a = alive();
      if (a.length === 0) return { ok: false };
      const t = randPick(a);
      S.voteImmunityToday[t.id] = true;
      broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: `Bugün ${t.name} güvende: asılamaz.` });
      return { ok: true, immuneId: t.id };
    }
    case "SCAPEGOAT_TODAY": {
      S.scapegoatToday = drawerId;
      addNoteDay(drawerId, "Günah Keçisi: Bugün biri asılırsa sen ölürsün.");
      return { ok: true };
    }
    case "SACRIFICE_IF_LYNCHED_TODAY": {
      S.sacrificeToday[drawerId] = true;
      addNoteDay(drawerId, "Kurban: Bugün asılırsan yerine rastgele biri ölecek (bu kişi yine sen de olabilir).");
      return { ok: true };
    }
    case "SAVIOR_PARDON_TODAY": {
      S.pardonToday = true;
      broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: "Bugün bir asılma affedilecek." });
      return { ok: true };
    }

    /* ---- Gece etkileri ---- */
    case "MIRROR_TONIGHT": {
      S.mirrorTonight[drawerId] = true;
      addNoteDay(drawerId, "Ayna: Bu gece sana gelen saldırı saldırana döner.");
      return { ok: true };
    }
    case "REVERSE_ACTION_TONIGHT": {
      S.reverseActionTonight[drawerId] = true;
      addNoteDay(drawerId, "Ters Etki: Bu gece KILL↔PROTECT tersine dönecek.");
      return { ok: true };
    }
    case "DARK_POWER_BYPASS_SHIELDS": {
      S.effectFlags.darkPierceTonight = true;
      S.lastCardDrawer = drawerId;
      S.lastCardEffect = "DARK_POWER_BYPASS_SHIELDS";
      addNoteDay(drawerId, "Karanlık Güç: Bu gece saldırın kalkanları deler.");
      return { ok: true };
    }
    case "RESURRECTION_STONE_TODAY_AND_NEXT_NIGHT": {
      S.resurrectionStones[drawerId] = { dayTurn: S.currentTurn, nightTurn: S.currentTurn + 1 };
      addNoteDay(drawerId, "Diriliş Taşı: Bugün veya gelecek gece ölürsen otomatik dirilirsin (1 kez).");
      return { ok: true };
    }
    case "ROLE_LOCK_RANDOM": {
      const a = alive();
      if (a.length === 0) return { ok: false };
      const t = randPick(a);
      S.roleLocks[t.id] = Math.max(1, (S.roleLocks[t.id] || 0) + 1); // 1 gece
      addNoteDay(t.id, "Rol Kilidi: Bu gece aksiyon yapamazsın.");
      return { ok: true, lockedId: t.id, nights: S.roleLocks[t.id] };
    }

    /* ---- Bilgi / sosyal ---- */
    case "ROLE_REVEAL_RANDOM_PUBLIC": {
      const a = alive();
      if (a.length === 0) return { ok: false };
      const t = randPick(a);
      broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: `Rol Açığa Çıktı: ${t.name} → ${t.role}` });
      return { ok: true, revealedId: t.id };
    }
    case "SECRET_SPILL_PUBLIC": {
      const pl = room.players.get(drawerId);
      if (pl) {
        const text = `Sır Açığa Çıktı: ${pl.name} hakkında söylenti — rolü ${pl.displayRole || pl.role}`;
        broadcast(room, "PUBLIC_ANNOUNCEMENT", { text });
      }
      return { ok: true };
    }
    case "RUMOR_PRIVATE": {
      const candidates = alive().filter(p => p.id !== drawerId);
      if (candidates.length === 0) return { ok: false };
      const t = randPick(candidates);
      const truth = Math.random() < 0.5 ? `hain olabilir` : `masum olabilir`;
      sendToPlayer(room, drawerId, "CARD_SECRET_INFO", { text: `Dedikodu: ${t.name} ${truth}.` });
      return { ok: true };
    }
    case "SECRET_MESSAGE_PRIVATE": {
      const candidates = alive().filter(p => p.id !== drawerId);
      if (candidates.length === 0) return { ok: false };
      const t = randPick(candidates);
      sendToPlayer(room, t.id, "CARD_SECRET_INFO", { text: `Gizli mesaj: Birisi sana güveniyor. (Gönderen gizli)`, from: '???' });
      return { ok: true, to: t.id };
    }
    case "MASS_FAKE_NOTE_PUBLIC": {
      broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: "Masum biri: “Bu gece dikkatli olun.”" });
      return { ok: true };
    }
    case "CONFESSION_PUBLIC": {
      const pl = room.players.get(drawerId);
      const text = `İtiraf: ${pl?.name} “Dün gece hatalar yaptım.”`;
      broadcast(room, "PUBLIC_ANNOUNCEMENT", { text });
      return { ok: true };
    }
    case "DETECTIVE_NOTE_LAST_TURN": {
      // Son gece (bu turun gecesi) DETECT sonuçlarını özetle ve çeken kişiye gönder
      const detects = (S.nightActions || [])
        .filter(a => a.result && a.result.type === 'DETECT')
        .map(a => {
          const actor = room.players.get(a.playerId)?.name || 'Biri';
          const tgt = room.players.get(a.targetId || '')?.name || '???';
          const [r1, r2] = a.result.roles || [];
          return `${actor} → ${tgt}: ${r1}, ${r2}`;
        });
      if (detects.length > 0) {
        sendToPlayer(room, drawerId, "CARD_SECRET_INFO", { text: `Dedektifin defteri:\n- ${detects.join('\n- ')}` });
      } else {
        sendToPlayer(room, drawerId, "CARD_SECRET_INFO", { text: "Dedektifin defteri boş." });
      }
      return { ok: true };
    }

    /* ---- Oyun akışını bozanlar ---- */
    case "EXPLODING_CARD": {
      // Çeken oyuncu anında ölür (gündüz). (Zor gelirse rasgele birini de yapabilirdik.)
      const p = room.players.get(drawerId);
      if (p && p.isAlive) {
        p.isAlive = false;
        const death = { ...p };
        S.deathsThisTurn = [...(S.deathsThisTurn || []), death];
        S.deathLog = [...(S.deathLog || []), death];
        broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: `${p.name} patlayan kart ile öldü!` });
      }
      return { ok: true, dead: drawerId };
    }
    case "SKIP_TO_NIGHT_IMMEDIATE": {
      // Faz geçişi CARD_CONFIRM içinde yapılacak
      return { ok: true, skipDay: true };
    }

    /* ---- İlişki ---- */
    case "LOVERS_BIND": {
      const a = alive();
      if (a.length < 2) return { ok: false, note: "Yeterli canlı oyuncu yok." };
      let x = randPick(a);
      let y = randPick(a.filter(p => p.id !== x.id));
      S.lovers = [x.id, y.id];
      addNoteDay(x.id, `Aşık oldun: ${y.name}`);
      addNoteDay(y.id, `Aşık oldun: ${x.name}`);
      return { ok: true, lovers: [x.id, y.id] };
    }

    default:
      return { ok: true, noop: true };
  }
}

/* --------- NIGHT resolver ---------- */
function processNightActions(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const players = Array.from(room.players.values());

  // 0) Rol kilidi → aksiyon düşür
  const roleLocked = new Set(Object.keys(S.roleLocks || {}));
  S.nightActions = S.nightActions.filter(a => !roleLocked.has(a.playerId));

  // 0.5) Ters etki: oyuncunun aksiyonu KILL↔PROTECT döner
  S.nightActions = S.nightActions.map(a => {
    if (S.reverseActionTonight[a.playerId]) {
      if (a.actionType === 'KILL') return { ...a, actionType: 'PROTECT' };
      if (a.actionType === 'PROTECT') return { ...a, actionType: 'KILL' };
    }
    return a;
  });

  // 1) Guardian block
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

  // 2) Kills + attacker map
  const killers = S.nightActions.filter(
    (a) => a.actionType === 'KILL' && !blockedPlayers.has(a.playerId),
  );
  const killTargets = killers.map((k) => k.targetId).filter(Boolean);
  const attackMap = new Map(); // targetId -> [attackerId]
  killers.forEach(k => {
    if (!k.targetId) return;
    const arr = attackMap.get(k.targetId) || [];
    arr.push(k.playerId);
    attackMap.set(k.targetId, arr);
  });

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

  // 4) Bombs (kısaltılmış)
  let newBombTargets = [...S.bombTargets];
  const bombPlacers = S.nightActions.filter(
    (a) => a.actionType === 'BOMB_PLANT' && !blockedPlayers.has(a.playerId),
  );
  bombPlacers.forEach((a) => {
    if (a.targetId && !newBombTargets.includes(a.targetId)) newBombTargets.push(a.targetId);
  });
  const detonateAction = S.nightActions.find(
    (a) => a.actionType === 'BOMB_DETONATE' && !blockedPlayers.has(a.playerId),
  );

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

    // Not oluştur
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

  // 5) Bomb patlatma
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

  // Pre-night kalkanları protected set'e ekle
  (S.preNightProtected || []).forEach(pid => protectedPlayers.add(pid));
  S.preNightProtected = []; // tüketildi

  // 6) Apply effects to players map (authoritative)
  const newPlayersMap = new Map(room.players);
  Array.from(newPlayersMap.values()).forEach((pl) => { pl.hasShield = false; });

  protectedPlayers.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.hasShield = true; });
  survivorActors.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.survivorShields = Math.max((p.survivorShields || 0) - 1, 0); });
  revived.forEach((pid) => { const p = newPlayersMap.get(pid); if (p) p.isAlive = true; });

  // KILL değerlendirme (ayna + karanlık güç)
  Array.from(newPlayersMap.values()).forEach((p) => {
    const isBombTarget = bombVictimIds.includes(p.id);
    const isTargeted = targetedIds.includes(p.id);
    let pierced = false;
    if (S.effectFlags.darkPierceTonight && S.lastCardDrawer) {
      // Kartı çeken kişi bu gece saldırdıysa kalkan deler
      const killByDrawer = S.nightActions.find(a => a.actionType === 'KILL' && a.playerId === S.lastCardDrawer && a.targetId === p.id);
      if (killByDrawer) pierced = true;
    }

    if (isBombTarget && !revived.has(p.id)) {
      if (p.isAlive) { p.isAlive = false; newDeaths.push({ ...p }); }
      return;
    }

    if (isTargeted && !revived.has(p.id)) {
      const protectedNow = p.hasShield && !pierced;
      const mirrored = !!S.mirrorTonight[p.id];

      if (mirrored && !protectedNow) {
        // Saldıranlar ölür
        const attackers = attackMap.get(p.id) || [];
        attackers.forEach(attackerId => {
          const attacker = newPlayersMap.get(attackerId);
          if (attacker && attacker.isAlive) {
            attacker.isAlive = false;
            newDeaths.push({ ...attacker });
          }
        });
        // Hedef yaşamaya devam eder
        return;
      }

      if (!protectedNow) {
        if (p.isAlive) { p.isAlive = false; newDeaths.push({ ...p }); }
      }
    }
  });

  // âşık zinciri
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

  // Diriliş Taşı (gece)
  const revivedByStoneIds = [];
  for (const d of newDeaths) {
    const stone = S.resurrectionStones[d.id];
    if (stone && stone.nightTurn === S.currentTurn) {
      const pl = newPlayersMap.get(d.id);
      if (pl) { pl.isAlive = true; revivedByStoneIds.push(d.id); }
      delete S.resurrectionStones[d.id];
      S.playerNotes[d.id] = [...(S.playerNotes[d.id] || []), `${S.currentTurn}. Gece: Diriliş Taşı ile dirildin.`];
    }
  }
  const filteredDeaths = newDeaths.filter(dd => !revivedByStoneIds.includes(dd.id));

  room.players = newPlayersMap;

  // attackers notes
  S.nightActions.filter((a) => a.actionType === 'KILL').forEach((a) => {
    const actor = room.players.get(a.playerId);
    const target = a.targetId ? room.players.get(a.targetId) : null;
    if (actor && target) {
      const killed = filteredDeaths.some((d) => d.id === target.id);
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
  S.deathsThisTurn = filteredDeaths;
  if (filteredDeaths.length > 0) S.deathLog = [...S.deathLog, ...filteredDeaths];
  S.bombTargets = [];

  broadcast(room, 'NIGHT_ACTIONS_UPDATED', { actions: toPlain(S.nightActions) });
  broadcastSnapshot(roomId);

  startPhase(roomId, 'NIGHT_RESULTS', 5);
}

/* ---------- VOTE resolver (gündüz) ---------- */
function processVotes(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const S = room.state;
  const players = Array.from(room.players.values());

  const voteCount = {};
  Object.entries(S.votes).forEach(([voterId, targetId]) => {
    const voter = players.find((p) => p.id === voterId);
    if (!voter?.isAlive) return;
    if (targetId === 'SKIP') return;
    const weight = S.voteWeightToday[voterId] || 1;
    voteCount[targetId] = (voteCount[targetId] || 0) + weight;
  });

  let maxVotes = 0;
  let eliminatedId = null;
  Object.entries(voteCount).forEach(([pid, count]) => {
    if (count > maxVotes) { maxVotes = count; eliminatedId = pid; }
  });
  const top = Object.entries(voteCount).filter(([, c]) => c === maxVotes);
  if (top.length > 1) eliminatedId = null; // beraberlik

  // Pardon / asılamaz / kurban / günah keçisi sırası
  if (eliminatedId && S.pardonToday) {
    eliminatedId = null;
    S.pardonToday = false;
    broadcast(room, "PUBLIC_ANNOUNCEMENT", { text: "Kurtarıcı etkisi: asılma affedildi." });
  }

  if (eliminatedId && S.voteImmunityToday[eliminatedId]) {
    eliminatedId = null;
  }

  if (eliminatedId && S.scapegoatToday) {
    const goat = room.players.get(S.scapegoatToday);
    if (goat?.isAlive) {
      eliminatedId = null; // asılma iptal, günah keçisi ölür
      const death = { ...goat, isAlive: false };
      goat.isAlive = false;
      S.deathsThisTurn = [death];
      S.deathLog = [...S.deathLog, death];
      broadcastSnapshot(roomId);
      startPhase(roomId, 'RESOLVE', 3);
      return;
    }
  }

  if (eliminatedId && S.sacrificeToday[eliminatedId]) {
    const aliveIds = Array.from(room.players.values()).filter(p => p.isAlive).map(p => p.id);
    if (aliveIds.length > 0) {
      eliminatedId = randPick(aliveIds);
    }
  }

  // Eliminasyonu uygula
  const newPlayersMap = new Map(room.players);
  const newDeaths = [];
  if (eliminatedId && maxVotes > 0) {
    const target = newPlayersMap.get(eliminatedId);
    if (target && target.isAlive) {
      target.isAlive = false;
      newDeaths.push({ ...target });
    }
  }

  // Âşık zinciri (gündüz)
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

  // Diriliş Taşı (gündüz)
  const revivedByStoneIds = [];
  for (const d of newDeaths) {
    const stone = S.resurrectionStones[d.id];
    if (stone && stone.dayTurn === S.currentTurn) {
      const pl = newPlayersMap.get(d.id);
      if (pl) { pl.isAlive = true; revivedByStoneIds.push(d.id); }
      delete S.resurrectionStones[d.id];
      S.playerNotes[d.id] = [...(S.playerNotes[d.id] || []), `${S.currentTurn}. Gün: Diriliş Taşı ile dirildin.`];
    }
  }
  const filtered = newDeaths.filter(dd => !revivedByStoneIds.includes(dd.id));

  room.players = newPlayersMap;
  S.deathsThisTurn = filtered;
  if (filtered.length > 0) S.deathLog = [...S.deathLog, ...filtered];

  broadcast(room, "VOTE_RESULT", {
    votes: S.votes,
    voteCount: voteCount,
    eliminatedId: filtered.length ? filtered[0].id : null,
  });

  broadcastSnapshot(roomId);
  startPhase(roomId, 'RESOLVE', 3);
}

/* -------------- Phase advance -------------- */
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
      // onayla değişir
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
            settings: { nightDuration: 60, dayDuration: 120, voteDuration: 45, cardDrawCount: 1 },
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
              mirrorTonight: {},
              reverseActionTonight: {},
              preNightProtected: [],

              voteWeightToday: {},
              voteBanToday: {},
              voteImmunityToday: {},
              scapegoatToday: null,
              sacrificeToday: {},
              pardonToday: false,

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
        }

        room.players = new Map(startPlayers.map((p) => [p.id, { ...p, isAlive: p.isAlive ?? true }]));

        // reset state
        room.state.game = { startedAt: new Date() };
        room.state.currentTurn = 1;
        room.state.nightActions = [];
        room.state.votes = {};
        room.state.deathsThisTurn = [];
        room.state.deathLog = [];
        room.state.bombTargets = [];
        room.state.playerNotes = {};

        room.state.selectedCardDrawers = [];
        room.state.currentCardDrawerIndex = 0;
        room.state.currentCardDrawer = null;
        room.state.lastCardDrawer = null;
        room.state.lastCardEffect = null;

        room.state.effectFlags = { darkPierceTonight: false };
        room.state.mirrorTonight = {};
        room.state.reverseActionTonight = {};
        room.state.preNightProtected = [];

        room.state.voteWeightToday = {};
        room.state.voteBanToday = {};
        room.state.voteImmunityToday = {};
        room.state.scapegoatToday = null;
        room.state.sacrificeToday = {};
        room.state.pardonToday = false;

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
        if (room.state.voteBanToday[voterId]) {
          sendToPlayer(room, voterId, 'ERROR', { message: 'Bugün oy kullanamazsın.' });
          break;
        }

        room.state.votes[voterId] = targetId;
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
          startPhase(rid, 'NIGHT', room.settings.nightDuration || 60);
        } else {
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
          mirrorTonight: {},
          reverseActionTonight: {},
          preNightProtected: [],

          voteWeightToday: {},
          voteBanToday: {},
          voteImmunityToday: {},
          scapegoatToday: null,
          sacrificeToday: {},
          pardonToday: false,

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
