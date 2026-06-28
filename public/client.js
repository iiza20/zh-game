const socket = io();

const app = document.getElementById("app");
let state = null;

function showError(message) {
  alert(message);
}

socket.on("errorMsg", showError);

socket.on("state", (newState) => {
  state = newState;
  render();
});

function createRoom() {
  const name = document.getElementById("nameInput").value.trim();
  socket.emit("createRoom", { name });
}

function joinRoom() {
  const name = document.getElementById("nameInput").value.trim();
  const code = document.getElementById("codeInput").value.trim().toUpperCase();
  socket.emit("joinRoom", { name, code });
}

function startRound() {
  socket.emit("startRound");
}

function chooseRed(index) {
  socket.emit("chooseRed", { index });
}

function decision(enter) {
  socket.emit("decision", { enter });
}

function nextRound() {
  socket.emit("nextRound");
}

function restartGame() {
  socket.emit("restartGame");
}

function phaseName(phase) {
  const names = {
    waiting: "انتظار اللاعبين",
    chooseRed: "اختيار الورقة الحمراء",
    discussion: "وقت النقاش والخداع",
    result: "نتيجة الجولة",
    ended: "انتهت اللعبة"
  };

  return names[phase] || phase;
}

function render() {
  if (!state) return renderHome();

  const room = state.room;
  const me = state.me;
  const myPlayer = room.players.find(p => p.id === me.id);

  app.innerHTML = `
    <div class="header">
      <div>
        <div class="title">ZH</div>
        <div>
          <span class="pill">الغرفة: ${room.code}</span>
          <span class="pill">الجولة: ${room.round} / ${room.maxRounds}</span>
          <span class="pill">${phaseName(room.phase)}</span>
        </div>
      </div>
      <div>
        ${me.isHost ? `<span class="pill">المضيف</span>` : `<span class="pill">لاعب</span>`}
      </div>
    </div>

    <div class="grid">
      <div>
        ${renderControls(room, me)}
        ${renderLog(room)}
      </div>

      <div>
        ${renderMain(room, me, myPlayer)}
        ${renderPlayers(room, me)}
      </div>
    </div>
  `;
}

function renderHome() {
  app.innerHTML = `
    <div class="screen">
      <div class="panel">
        <div class="logo">ZH</div>
        <div class="subtitle">لعبة تشويق وخداع وتجميع كؤوس</div>

        <input id="nameInput" placeholder="اسم اللاعب">
        <input id="codeInput" placeholder="كود الغرفة">

        <button class="btn" onclick="createRoom()">إنشاء غرفة</button>
        <button class="btn secondary" onclick="joinRoom()">دخول غرفة</button>

        <div class="notice" style="margin-top:16px">
          القاعدة: أنت لا ترى ورقتك الزرقاء، لكن الآخرين يرونها. اختر ورقة حمراء تظهر للجميع وورقة تبقى سرية، ثم قرر تدخل أو تنسحب.
        </div>
      </div>
    </div>
  `;
}

function renderControls(room, me) {
  let html = `<div class="cardBox"><h2>التحكم</h2>`;

  if (room.phase === "waiting") {
    html += `
      <div class="notice">
        شاركي كود الغرفة مع اللاعبين. المضيف فقط يقدر يبدأ اللعبة.
      </div>
    `;

    if (me.isHost) {
      html += `<button class="btn" onclick="startRound()">بدء الجولة</button>`;
    }
  }

  if (room.phase === "chooseRed") {
    html += `<div class="notice">كل لاعب يختار الورقة الحمراء التي يريد إظهارها.</div>`;
  }

  if (room.phase === "discussion") {
    html += `
      <div class="timer">${room.timerLeft}</div>
      <div class="notice">وقت النقاش. حاول تقرأ اللاعبين وتخدعهم.</div>
    `;
  }

  if (room.phase === "result") {
    if (me.isHost) {
      html += `<button class="btn" onclick="nextRound()">الجولة التالية</button>`;
    } else {
      html += `<div class="notice">بانتظار المضيف يبدأ الجولة التالية.</div>`;
    }
  }

  if (room.phase === "ended") {
    html += renderWinners(room);

    if (me.isHost) {
      html += `<button class="btn" onclick="restartGame()">إعادة اللعبة</button>`;
    }
  }

  html += `</div>`;
  return html;
}

function renderMain(room, me, myPlayer) {
  if (!myPlayer) return "";

  if (!myPlayer.alive) {
    return `
      <div class="cardBox">
        <h2>خرجت من اللعبة</h2>
        <div class="notice">قلوبك خلصت. انتظري نهاية اللعبة.</div>
      </div>
    `;
  }

  let html = `
    <div class="cardBox">
      <h2>أوراقك</h2>
      <div class="stats">
        <span class="pill">قلوب: ${myPlayer.hearts}</span>
        <span class="pill">كؤوس: ${myPlayer.cups}</span>
      </div>

      <div class="playCards">
        <div class="gameCard blueCard">
          <span class="cardLabel">زرقاء</span>
          ?
        </div>
  `;

  if (room.phase === "chooseRed" && me.redOptions.length === 2) {
    html += `
      <div class="gameCard redCard">
        <span class="cardLabel">حمراء</span>
        ${me.redOptions[0]}
      </div>
      <div class="gameCard redCard">
        <span class="cardLabel">حمراء</span>
        ${me.redOptions[1]}
      </div>
    `;

    html += `</div>`;

    if (me.redShown === null) {
      html += `
        <div class="notice">اختاري الورقة التي ستظهر للجميع. الثانية ستبقى مخفية.</div>
        <div class="actions">
          <button class="btn blue" onclick="chooseRed(0)">إظهار ${me.redOptions[0]}</button>
          <button class="btn blue" onclick="chooseRed(1)">إظهار ${me.redOptions[1]}</button>
        </div>
      `;
    } else {
      html += `<div class="notice">تم اختيار الورقة. انتظري الباقين.</div>`;
    }
  } else {
    if (me.redShown !== null) {
      html += `
        <div class="gameCard redCard">
          <span class="cardLabel">ظاهرة</span>
          ${me.redShown}
        </div>
        <div class="gameCard hiddenCard">
          <span class="cardLabel">مخفية</span>
          ${me.redHidden}
        </div>
      `;
    }

    html += `</div>`;
  }

  if (room.phase === "discussion") {
    if (myPlayer.entered || myPlayer.withdrawn) {
      html += `
        <div class="notice">
          قرارك: ${myPlayer.entered ? "دخول" : "انسحاب"}
        </div>
      `;
    } else {
      html += `
        <div class="notice">قرري بعد النقاش: تدخلين وتخاطرين، أو تنسحبين بأمان.</div>
        <div class="actions">
          <button class="btn" onclick="decision(true)">دخول</button>
          <button class="btn danger" onclick="decision(false)">انسحاب</button>
        </div>
      `;
    }
  }

  if (room.phase === "result" || room.phase === "ended") {
    if (myPlayer.total !== null) {
      html += `<h2>مجموعك: ${myPlayer.total}</h2>`;
    } else {
      html += `<div class="notice">انسحبت من هذه الجولة.</div>`;
    }
  }

  html += `</div>`;
  return html;
}

function renderPlayers(room, me) {
  let html = `<div class="cardBox"><h2>اللاعبون</h2><div class="players">`;

  room.players.forEach(p => {
    const isMe = p.id === me.id;
    const blueValue = isMe ? "?" : (p.blue ?? "?");

    html += `
      <div class="player ${p.alive ? "" : "dead"}">
        <div class="playerName">
          ${p.name}
          ${isMe ? `<span class="pill">أنت</span>` : ""}
          ${p.id === room.hostId ? `<span class="pill">مضيف</span>` : ""}
          ${!p.alive ? `<span class="pill">خارج</span>` : ""}
        </div>

        <div class="stats">
          <span class="pill">قلوب: ${p.hearts}</span>
          <span class="pill">كؤوس: ${p.cups}</span>
          ${p.entered ? `<span class="pill">دخل</span>` : ""}
          ${p.withdrawn ? `<span class="pill">انسحب</span>` : ""}
          ${p.total !== null ? `<span class="pill">المجموع: ${p.total}</span>` : ""}
        </div>

        <div class="playCards">
          <div class="gameCard blueCard">
            <span class="cardLabel">زرقاء</span>
            ${blueValue}
          </div>

          <div class="gameCard redCard">
            <span class="cardLabel">ظاهرة</span>
            ${p.redShown ?? "?"}
          </div>

          <div class="gameCard hiddenCard">
            <span class="cardLabel">سرية</span>
            ?
          </div>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

function renderLog(room) {
  return `
    <div class="cardBox">
      <h2>السجل</h2>
      <div class="log">
        ${room.log.slice().reverse().map(item => `<div>${item}</div>`).join("")}
      </div>
    </div>
  `;
}

function renderWinners(room) {
  const alive = room.players.filter(p => p.alive);

  const sorted = [...room.players].sort((a, b) => {
    if (b.cups !== a.cups) return b.cups - a.cups;
    if (b.hearts !== a.hearts) return b.hearts - a.hearts;
    return a.name.localeCompare(b.name);
  });

  let html = `<h2>النتيجة النهائية</h2>`;

  sorted.forEach((p, index) => {
    html += `
      <div class="rank">
        ${index + 1}. ${p.name} — كؤوس: ${p.cups} — قلوب: ${p.hearts}
      </div>
    `;
  });

  if (alive.length === 1) {
    html += `<div class="notice">الفائز: ${alive[0].name}</div>`;
  } else if (sorted.length > 0) {
    html += `<div class="notice">الفائز: ${sorted[0].name}</div>`;
  }

  return html;
}

renderHome();