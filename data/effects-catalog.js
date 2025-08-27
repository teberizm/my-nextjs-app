// 28 olayın merkezi kataloğu
export type EffectTiming =
  | "IMMEDIATE"        // anında uygulanır
  | "TODAY"            // bugünü etkiler (gündüz/oy)
  | "NEXT_NIGHT"       // bir sonraki gece etkili
  | "PERSISTENT_SHORT" // kısa süreli kalıcı (ör. bugün+ertesi gece)

export interface EffectDef {
  title: string;
  desc: string;
  timing: EffectTiming;
  params?: Record<string, any>;
}

export const EFFECTS_CATALOG: Record<string, EffectDef> = {
  /* 1 */ REVIVE_RANDOM_THIS_TURN: {
    title: "Diriltme",
    desc: "Bu tur ölenlerden biri rastgele dirilir.",
    timing: "IMMEDIATE",
  },

  /* 2 */ SHIELD_RANDOM_TONIGHT: {
    title: "Kalkan",
    desc: "Rastgele bir oyuncu bir sonraki gece kalkan kazanır.",
    timing: "NEXT_NIGHT",
    params: { count: 1 },
  },

  /* 3 */ HINT_PARTIAL_ROLE: {
    title: "İpucu",
    desc: "Rastgele bir oyuncunun rolüne dair kısmen doğru/yanlış bir ipucu notlarına düşer (sadece çeken görür).",
    timing: "IMMEDIATE",
  },

  /* 4 */ DOUBLE_VOTE_TODAY: {
    title: "Çift Oy",
    desc: "Bugün çeken oyuncunun oyu 2 oy sayılır.",
    timing: "TODAY",
  },

  /* 5 */ INSTANT_DEATH: {
    title: "Patlayan Kart",
    desc: "Kartı çeken anında ölür.",
    timing: "IMMEDIATE",
  },

  /* 6 */ MASS_NOTE_FAKE_INNOCENT: {
    title: "Toplu Not",
    desc: "Rastgele MASUM birinin notlarına sahte bir bilgi düşülür.",
    timing: "IMMEDIATE",
  },

  /* 7 */ RUMOR_SUSPECT_NOTE: {
    title: "Dedikodu",
    desc: "Rastgele bir oyuncu hakkında 'hain olabilir' dedikodusu notlara eklenir.",
    timing: "IMMEDIATE",
  },

  /* 8 */ DOUBLE_SHIELD_TONIGHT: {
    title: "Çifte Kalkan",
    desc: "Bir sonraki gece iki farklı oyuncu korunur.",
    timing: "NEXT_NIGHT",
    params: { count: 2 },
  },

  /* 9 */ REVEAL_TRUE_ROLE_TO_ACTOR: {
    title: "Rol Açığa Çıktı",
    desc: "Çeken oyuncu, rastgele bir oyuncunun GERÇEK rolünü öğrenir (özel not).",
    timing: "IMMEDIATE",
  },

  /* 10 */ LYNCH_IMMUNITY_TODAY: {
    title: "Kendini Koruma (Oy ile Asılamaz)",
    desc: "Bugün çeken oyuncu oylama ile asılamaz.",
    timing: "TODAY",
  },

  /* 11 */ VOTE_BAN_TODAY_RANDOM: {
    title: "Oy Yasağı",
    desc: "Rastgele bir oyuncu bugün oy kullanamaz.",
    timing: "TODAY",
  },

  /* 12 */ REFLECT_ATTACKS_TONIGHT: {
    title: "Ayna Kartı",
    desc: "Bir sonraki gece çeken oyuncuya gelen saldırılar saldırana geri döner.",
    timing: "NEXT_NIGHT",
  },

  /* 13 */ REVERSE_PROTECT_EFFECTS: {
    title: "Ters Etki",
    desc: "Bir sonraki gece yapılan KORUMALAR ters işler, koruyan etkilenir.",
    timing: "NEXT_NIGHT",
  },

  /* 14 */ PUBLIC_ROLE_HINT: {
    title: "Sır Açığa Çıktı",
    desc: "Rastgele bir rol bilgisi tüm oyuncuların notlarına düşer (kime ait olduğu yazılmaz).",
    timing: "IMMEDIATE",
  },

  /* 15 */ SECRET_MESSAGE_TO_RANDOM: {
    title: "Gizli Mesaj",
    desc: "Rastgele bir CANLI oyuncunun notlarına gizli bir mesaj bırakılır (çeken tarafından görülür).",
    timing: "IMMEDIATE",
  },

  /* 16 */ LOVERS_BIND_PAIR: {
    title: "Aşıklar",
    desc: "Çeken oyuncu rastgele biriyle 'aşık' olur. İkisi de bu bilgiyi görür; biri ölürse diğeri de ölür. Son ikiye kalırlarsa aşıklar kazanır.",
    timing: "IMMEDIATE",
  },

  /* 17 */ SCAPEGOAT_OBJECTIVE: {
    title: "Günah Keçisi",
    desc: "Not: 'Bugünkü amacın kimseyi astırmamak. Eğer biri asılırsa sen ölürsün.'",
    timing: "TODAY",
  },

  /* 18 */ AUTO_CONFESS_ROLE: {
    title: "İtiraf",
    desc: "Çeken oyuncunun GERÇEK rolü otomatik olarak notlara yazılır.",
    timing: "IMMEDIATE",
  },

  /* 19 */ SKIP_DAY_START_NIGHT: {
    title: "Gündüzü Atlama",
    desc: "Gündüz fazı atlanır, karttan sonra doğrudan gece başlar (hain avantajı).",
    timing: "TODAY",
  },

  /* 20 */ RESURRECTION_STONE_TODAY_AND_NEXT_NIGHT: {
    title: "Diriliş Taşı",
    desc: "Çeken oyuncu bugün ve SONRAKİ GECE hiçbir şekilde ölmez (sabah kalkan kalkar).",
    timing: "PERSISTENT_SHORT",
  },

  /* 21 */ DARK_POWER_BYPASS_SHIELDS: {
    title: "Karanlık Güç",
    desc: "Bir sonraki gece çekenin saldırısı kalkanları deler; MASUM ise gardiyan tutsa bile saldırısı işler.",
    timing: "NEXT_NIGHT",
  },

  /* 22 */ DETECTIVE_NOTES_LAST_TURN: {
    title: "Dedektifin Defteri",
    desc: "Rastgele bir oyuncunun SON TUR notları çeken oyuncunun notlarına eklenir.",
    timing: "IMMEDIATE",
  },

  /* 23 */ LYNCH_SWAP_RANDOM_IF_SELF: {
    title: "Kurban Kartı",
    desc: "Bugün oylamada asılacak kişi sen isen, senin yerine RASTGELE biri asılır (bu yine sen de olabilirsin).",
    timing: "TODAY",
  },

  /* 24 */ FALSE_HINT_TO_ACTOR: {
    title: "Bulanık İpucu",
    desc: "Çekene verilen ipucu %100 YANLIŞ olur (bilerek saptırır).",
    timing: "IMMEDIATE",
  },

  /* 25 */ SAVIOR_CANCEL_LYNCH_TODAY: {
    title: "Kurtarıcı",
    desc: "Bugün oylamada en çok oy alan kişi asılmaktan kurtulur; o gün kimse asılmaz.",
    timing: "TODAY",
  },

  /* 26 */ TRUST_NOTE_PUBLIC_INNOCENT: {
    title: "Güven Kartı",
    desc: "Rastgele bir oyuncunun rolü herkesin notlarına 'Masum' olarak düşer (doğru olmayabilir).",
    timing: "IMMEDIATE",
  },

  /* 27 */ DIE_AND_TAKE_ONE: {
    title: "Son Şans",
    desc: "Kartı çeken anında ölür ama yanında götürmek için bir oyuncu seçebilir (UI yoksa rastgele seçilir).",
    timing: "IMMEDIATE",
  },

  /* 28 */ ROLE_LOCK_RANDOM_NEXT_NIGHT: {
    title: "Rol Kilidi",
    desc: "Rastgele bir oyuncunun bir sonraki gece aksiyonu iptal olur (hiçbir şey yapamaz).",
    timing: "NEXT_NIGHT",
  },
};

