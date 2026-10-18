// 教師モードの素材：指導方針・相談・面談
(function (G) {
  'use strict';
  const D = G.D;

  // 指導方針。g は能力値ごとの伸びの倍率、mood は1か月ごとのやる気の増減
  D.plans = {
    balance: { label: 'バランスよく', desc: 'すべての能力を少しずつ伸ばす。無理がないので、やる気は保たれる。', g: { pow: 1.1, tec: 1.1, spd: 1.1, int: 1.1, men: 1.1 }, mood: 0 },
    fight: { label: '戦闘訓練', desc: 'パワー・技術・機動力がよく伸びる。きついので、やる気が下がりやすく、まれにけが人が出る。', g: { pow: 1.55, tec: 1.3, spd: 1.3, int: 0.8, men: 0.9 }, mood: -4, hurt: 0.03 },
    rescue: { label: '救助訓練', desc: '精神力と機動力がよく伸びる。災害救助に強いヒーローを育てる。', g: { pow: 1.1, tec: 1.0, spd: 1.3, int: 0.9, men: 1.55 }, mood: -3 },
    study: { label: '座学と捜査', desc: '知性と技術がよく伸び、試験に強くなる。体はあまり鍛えられない。', g: { pow: 0.85, tec: 1.3, spd: 0.85, int: 1.6, men: 1.0 }, mood: -2, exam: 0.04 },
    rest: { label: '休養', desc: '伸びは小さいが、やる気が大きく回復し、けがの治りも早い。', g: { pow: 0.6, tec: 0.6, spd: 0.6, int: 0.6, men: 0.6 }, mood: 12 },
  };

  D.teacherRank = [[0, '新米教師'], [40, '頼れる担任'], [60, '評判の先生'], [75, '名物教師'], [90, '伝説の教師']];
  D.teacherNames = ['佐伯 誠', '桐島 遥', '大河内 剛', '水無瀬 葵', '鳴海 透', '真壁 朔', '柊 千尋', '久遠 蓮', '三条 灯', '早乙女 環'];

  // 面談で生徒が話すこと（やる気と信頼で変わる）
  D.talk = {
    good: ['最近、訓練が楽しくなってきました', 'もっと強くなれる気がしています', '先生の授業、わかりやすいです', '{dream}って夢、本気で目指してます', '友だちと一緒に自主練してます'],
    mid: ['まあ、なんとかやってます', 'ちょっと疲れてるかもしれません', '{club}の方が楽しいときもあります', 'みんなに置いていかれないか、少し心配です'],
    low: ['……正直、きついです', 'このままでいいのか、わからなくなってます', '先生には関係ないです', '最近、眠れないんです'],
  };

  // 相談。opts の eff は効果。p があるときは確率で ok/ng に分かれる
  D.consult = {
    doubt: {
      text: '{s}が「自分はヒーローに向いていない気がする」と相談に来た。',
      opts: [
        { label: '「向いているかどうかは、これから決まる」と励ます', eff: { trust: 8, mood: 15 }, res: '{s}は少し笑って「もう少しやってみます」と言った。' },
        { label: '放課後、一緒に特訓する', eff: { trust: 6, mood: 5, st: { tec: 2, men: 2 } }, res: '二人の特訓は日が暮れるまで続いた。' },
        { label: '「答えは自分で見つけなさい」と見守る', p: 0.5, eff: { mood: 10, score: 3, st: { men: 3 } }, res: '数日後、{s}は自分なりの答えを出したようだ。', ng: { mood: -10 }, ngres: '{s}はまだ迷っているようだ。' },
      ],
    },
    rival: {
      text: '{s}が「{s2}にどうしても勝てません」と悔しそうに話した。',
      opts: [
        { label: '「人と比べなくていい」と伝える', eff: { mood: 12, trust: 5 }, res: '{s}の表情が少しやわらいだ。' },
        { label: '勝ち方を一緒に研究する', eff: { trust: 5, score: 1, st: { tec: 3, int: 2 } }, res: '{s}は{s2}の戦い方をノートにまとめ始めた。' },
        { label: '「その悔しさを忘れるな」と背中を押す', eff: { mood: -4, score: 2, st: { pow: 2 } }, res: '{s}は黙ってうなずき、訓練場へ走っていった。' },
      ],
    },
    wild: {
      text: '{s}が「自分の能力が暴走するのが怖い」と打ち明けた。',
      opts: [
        { label: '能力を制御する特訓を組む', eff: { trust: 4, st: { men: 4 } }, res: '少しずつ、{s}は能力を思いどおりに扱えるようになってきた。' },
        { label: '「怖がっていい。それが正しい感覚だ」と話す', eff: { trust: 10, mood: 8 }, res: '{s}は「そう言ってもらえて、楽になりました」と話した。' },
        { label: '能力研究の専門家に相談する', eff: { trust: 3, score: 2, st: { int: 2 } }, res: '専門家の助言で、{s}は自分の能力のしくみを理解し始めた。' },
      ],
    },
    rogue: {
      text: '{s}が校外で無許可で能力を使い、ひったくり犯を捕まえた。学校は処分を担任のあなたに任せた。',
      opts: [
        { label: '規則は規則。厳しく処分する', eff: { mor: 6, trust: -6, score: -2, rep: 1 }, res: '{s}は不満そうだったが、反省文を書き上げた。' },
        { label: '事情を聞き、校長にかけあってかばう', eff: { trust: 12, mood: 8, rep: -2 }, res: '{s}は「先生がいてくれてよかった」と頭を下げた。' },
        { label: '反省文だけで済ませる', eff: { trust: 3, mor: 2 }, res: '{s}は「次は先に通報します」と約束した。' },
      ],
    },
    love: {
      text: '{s}から「{s2}のことが気になって、訓練に集中できない」と相談された。',
      opts: [
        { label: '「気持ちは大事にしていい」と応援する', eff: { mood: 15, trust: 4 }, special: 'couple', res: '{s}は顔を赤くして「がんばってみます」と言った。' },
        { label: '「今は訓練が先だ」と伝える', eff: { score: 2, mood: -6 }, res: '{s}は小さくため息をつき、訓練に戻った。' },
        { label: '黙って話を聞く', eff: { trust: 8 }, res: '話し終えた{s}は、すっきりした顔をしていた。' },
      ],
    },
    drop: {
      text: '{s}が「学校をやめようと思っています」と退学届を持ってきた。',
      opts: [
        { label: '「もう少しだけ一緒にやろう」と引き止める', p: 0.65, eff: { trust: 8, mood: 5 }, res: '{s}は退学届を引っ込めた。「……もう少しだけ」', ng: {}, ngres: '{s}の決意は固かった。', special: 'dropIfNg' },
        { label: '本人の意思を尊重する', eff: {}, special: 'drop', res: '{s}は深く頭を下げ、学校を去った。' },
        { label: '家族も交えて三者面談をする', p: 0.85, eff: { trust: 12, mood: 8 }, res: '家族と話し合い、{s}は学校に残ることを決めた。', ng: {}, ngres: '話し合いの末、{s}は別の道を選んだ。', special: 'dropIfNg' },
      ],
    },
    path: {
      text: '3年の{s}が進路で迷っている。「ヒーローになるか、{alt}か……」',
      opts: [
        { label: 'ヒーローの道をすすめ、推薦状を書く', eff: { trust: 5, mood: 5 }, set: { recommend: true, wantOther: false }, res: '{s}は推薦状を握りしめ、「やってみます」と言った。' },
        { label: '「その道も立派だ」と背中を押す', eff: { trust: 6, mood: 10 }, set: { wantOther: true, recommend: false }, special: 'alt', res: '{s}は「ありがとうございます。決めました」と晴れやかに話した。' },
        { label: '「自分で決めていい。どちらでも応援する」と伝える', eff: { trust: 10 }, res: '{s}は「もう少し考えます」と答えた。' },
      ],
    },
    pathAlt: ['実家の店を継ぐ', '大学に進む', '警察官になる', '消防士になる', '研究者を目指す', '料理人になる', '海外に留学する', '芸能界に入る'],
    fight: {
      text: '{s}と{s2}が訓練中に言い争いになり、つかみ合いの喧嘩になった。',
      opts: [
        { label: '二人とも厳しく叱る', eff: { mor: 3, trust: -3 }, both: true, res: '二人は不満そうに謝り合った。' },
        { label: '二人で話し合わせる', p: 0.6, eff: { trust: 4 }, both: true, special: 'friend', res: '話し合いの末、二人は笑い合っていた。今では親友だという。', ng: { mood: -3 }, ngres: '話し合いは平行線のままだった。', ngSpecial: 'rival' },
        { label: '模擬戦で決着をつけさせる', eff: { st: { pow: 2 } }, both: true, special: 'rival', res: '模擬戦は引き分け。二人はライバルとして意識し合うようになった。' },
      ],
    },
    home: {
      text: '{s}が「家の事情で、学費が払えないかもしれない」と打ち明けた。',
      opts: [
        { label: '奨学金の手続きを手伝う', eff: { trust: 12, mood: 10 }, res: '奨学金が認められ、{s}はほっとした様子だった。' },
        { label: '学校に相談して支払いを待ってもらう', eff: { trust: 6, rep: 1 }, res: '学校は支払いの猶予を認めた。' },
        { label: 'アルバイトを許可する', eff: { mood: 5, score: -1, st: { men: 2 } }, res: '{s}は放課後にアルバイトを始めた。疲れているが、表情は明るい。' },
      ],
    },
    slump: {
      text: '{s}がスランプで落ち込んでいる。能力がうまく出せないらしい。',
      opts: [
        { label: 'しばらく訓練を休ませる', eff: { mood: 10, slump: -2 }, res: '休んだあと、{s}の動きに少しずつ切れが戻ってきた。' },
        { label: '基礎からやり直させる', eff: { slump: -1, st: { tec: 2 } }, res: '{s}は黙々と基礎練習を続けている。' },
        { label: '好きなことをさせて気分を変える', eff: { mood: 15, trust: 4 }, res: '{s}は久しぶりに笑顔を見せた。' },
      ],
    },
    sports: {
      text: '体育祭に向けて、クラスの作戦を決める時期になった。',
      opts: [
        { label: '全力で優勝を狙う', all: { mood: -4 }, cls: { sports: 1.12 }, res: 'クラスは連日、遅くまで練習している。' },
        { label: '全員が力を出し切ることを目標にする', all: { mood: 8 }, cls: { sports: 1.04 }, res: 'クラスの雰囲気はとても良い。' },
        { label: 'エースの{s}を中心に作戦を立てる', eff: { trust: 5 }, set: { sports: 1.25 }, all: { mood: -2 }, res: '{s}は「任せてください」と胸を張った。' },
      ],
    },
    exam: {
      text: '{exam}が近づいてきた。直前の特訓メニューを決める。',
      opts: [
        { label: '実技を徹底的に鍛える', cls: { exam: 0.08 }, all: { mood: -5 }, res: 'クラスは毎日へとへとになるまで実技に取り組んだ。' },
        { label: '筆記と状況判断の対策をする', cls: { exam: 0.05 }, all: { st: { int: 1 } }, res: '過去問の山に、生徒たちは悲鳴を上げた。' },
        { label: '体調を整えることを優先する', cls: { exam: 0.03 }, all: { mood: 8 }, res: '生徒たちは落ち着いた様子で試験の日を迎えそうだ。' },
      ],
    },
  };
})(globalThis.HG = globalThis.HG || {});

// ---------- 本格版：時間割・設備・教師の技能・絆・期末試験・査定 ----------
(function (G) {
  'use strict';
  const D = G.D;

  // 授業。g は1コマあたりの伸び、fat は疲労、unity は団結、prof は能力熟練度
  D.lessons = {
    fight: { label: '戦闘訓練', short: '戦', g: { pow: 0.6, tec: 0.4, spd: 0.4 }, fat: 8, area: 'f' },
    rescue: { label: '救助訓練', short: '救', g: { men: 0.6, spd: 0.4, pow: 0.2 }, fat: 7, unity: 0.5, area: 'r' },
    invest: { label: '捜査演習', short: '捜', g: { int: 0.6, tec: 0.4 }, fat: 4, area: 'i' },
    lecture: { label: '座学', short: '座', g: { int: 0.4, men: 0.1 }, fat: 2, mood: -0.5, exam: 1 },
    quirk: { label: '能力訓練', short: '能', g: { tec: 0.2 }, prof: 0.32, fat: 6 },
    team: { label: '連携訓練', short: '連', g: { tec: 0.2, men: 0.2 }, fat: 4, unity: 2 },
    free: { label: '自主練', short: '自', g: {}, fat: 3, mood: 0.6, free: true },
    rest: { label: '休養', short: '休', g: {}, fat: -14, mood: 1.5 },
  };
  D.days = ['月', '火', '水', '木', '金'];
  D.presets = {
    balance: ['fight', 'lecture', 'rescue', 'invest', 'quirk', 'team', 'fight', 'lecture', 'free', 'rest'],
    fight: ['fight', 'fight', 'quirk', 'fight', 'fight', 'team', 'fight', 'quirk', 'fight', 'rest'],
    rescue: ['rescue', 'lecture', 'rescue', 'team', 'rescue', 'quirk', 'rescue', 'lecture', 'free', 'rest'],
    study: ['lecture', 'invest', 'lecture', 'invest', 'quirk', 'lecture', 'invest', 'team', 'lecture', 'rest'],
    rest: ['lecture', 'rest', 'free', 'rest', 'quirk', 'rest', 'team', 'rest', 'free', 'rest'],
  };

  // 学級予算で買えるもの（万円）
  D.shop = {
    gym: { label: 'トレーニング機器', price: 90, desc: '戦闘訓練・救助訓練の伸びが15%上がる。', keep: true },
    med: { label: '医務室の設備', price: 60, desc: 'けがをしにくくなり、週ごとの疲労の回復が増える。', keep: true },
    lib: { label: '資料室', price: 50, desc: '捜査演習・座学の伸びが20%上がり、試験に少し強くなる。', keep: true },
    sim: { label: '実戦シミュレーター', price: 160, desc: 'すべての授業の伸びが10%上がり、能力熟練度も伸びやすくなる。', keep: true },
    snack: { label: 'クラスへの差し入れ', price: 8, desc: 'クラス全員のやる気が10上がる。' },
    camp: { label: '週末の強化合宿', price: 40, desc: '次の1週間の伸びが2倍になる。疲労が30たまる。' },
    item: { label: 'サポートアイテムの試作', price: 30, desc: '名簿で選んだ生徒の能力熟練度が15上がる（名簿の「アイテム」ボタン）。', pick: true },
  };

  // 教師の技能（各3段階）
  D.tskills = {
    coach: { label: '実技指導', desc: '個別指導の効果が1段階ごとに25%上がる。' },
    counsel: { label: 'カウンセリング', desc: '面談で信頼が上がりやすく、相談の答えがうまくいきやすくなる。' },
    plan: { label: '授業設計', desc: '時間割による伸びが1段階ごとに6%上がる。' },
    network: { label: '人脈', desc: '学級予算が毎月増え、推薦状がより効くようになる。' },
    stamina: { label: '体力', desc: '指導ポイントの上限が1段階ごとに1増える。' },
  };

  // 役職。rep と年数で昇進する
  D.positions = [
    { label: '担任', rep: 0, years: 0, budget: 12, ap: 0 },
    { label: '学年主任', rep: 60, years: 2, budget: 18, ap: 1 },
    { label: '教頭', rep: 75, years: 5, budget: 25, ap: 1 },
    { label: '校長', rep: 88, years: 8, budget: 35, ap: 2 },
  ];

  // 絆が深まったときの話（{dream}{club}{awaken}{look}{food} が使える）
  D.bond = [
    {
      text: '放課後、{s}が「先生、ちょっといいですか」と声をかけてきた。{club}のことや、好きな{food}の話をしたあと、ぽつりと「本当は、{dream}って夢、人に言うの恥ずかしかったんです」と打ち明けた。',
      opts: [
        { label: '「恥ずかしくない。いい夢だ」と伝える', eff: { trust: 6, mood: 10 }, res: '{s}はうれしそうに「先生に言ってよかった」と笑った。' },
        { label: '「その夢のために、何から始める？」と聞く', eff: { trust: 4, score: 2, prof: 5 }, res: '二人で、夢までの道のりを紙に書き出した。' },
      ],
    },
    {
      text: '{s}が能力のことを話してくれた。「{awaken}。あのときから、ずっとこの力が少し怖かったんです」',
      opts: [
        { label: '「その力で、誰を守りたい？」と問いかける', eff: { trust: 6, mor: 6, prof: 10 }, res: '{s}はしばらく考えてから、迷いのない顔でうなずいた。' },
        { label: '「怖さを知っている人ほど、強くなれる」と話す', eff: { trust: 8, st: { men: 4 } }, res: '{s}は「先生みたいな大人になりたいです」と言った。' },
      ],
    },
    {
      text: '夜の訓練場で、{s}がひとりで技の練習をしていた。「先生、見ていてください。今なら、できる気がするんです」',
      opts: [
        { label: '最後まで見届ける', eff: { trust: 5, prof: 15 }, res: '{s}の能力が、これまでにない輝きを放った。', special: 'awaken' },
        { label: '「無理はするな」と止める', eff: { trust: 4, mood: 8 }, res: '{s}は少し不満そうだったが、「明日またやります」と笑った。' },
      ],
    },
  ];

  // 期末実技試験の作戦。相手のタイプ（power/speed/smart）との相性がある
  D.examStrat = {
    head: { label: '正面突破', desc: '力で押し切る。パワー型の先生には不利。', beats: 'smart', loses: 'power' },
    combo: { label: '陽動と連携', desc: '二人の連携でスキを作る。団結が高いほど強い。', beats: 'power', loses: 'speed' },
    wait: { label: '持久戦', desc: '時間切れまで粘る。スピード型の先生に強い。', beats: 'speed', loses: 'smart' },
  };
  D.examFoe = { power: 'パワー型', speed: 'スピード型', smart: '頭脳派' };
  D.examPlay = {
    win: ['{a}と{b}は{foe}を相手に{how}、見事に合格した。', '{a}の機転と{b}の踏ん張りで、{a}・{b}組は合格をつかんだ。'],
    lose: ['{a}と{b}は{foe}の前に手も足も出ず、不合格となった。', '{a}・{b}組は最後まで粘ったが、条件を満たせなかった。'],
    how: { head: '真正面からぶつかり', combo: '陽動で注意をそらして', wait: '時間いっぱいまで粘り' },
  };
})(globalThis.HG = globalThis.HG || {});
