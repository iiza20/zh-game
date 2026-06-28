const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function card() {
  return Math.floor(Math.random() * 10) + 1;
}

function createPlayer(id, name) {
  return {
    id,
    name,
    hearts: 3,
    cups: 0,
    alive: true,
    blue: null,
    redOptions: [],
    redShown: null,
    redHidden: null,
    entered: false,
    withdrawn: false,
    total: null
  };
}

function createRoom(hostId, hostName) {
  let code = makeCode();
  while (rooms[code]) code = makeCode();

  rooms[code] = {
    code,
    hostId,
    round: 0,
    maxRounds: 10,
    phase: "waiting",
    timer: null,
    timerLeft: 0,
    players: [createPlayer(hostId, hostName)],
    log: [`تم إنشاء الغرفة ${code}`]
  };

  return rooms[code];
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function resetRoundPlayer(p) {
  if (!p.alive) return;

  p.blue = card();
  p.redOptions = [card(), card()];
  p.redShown = null;
  p.redHidden = null;
  p.entered = false;
  p.withdrawn = false;
  p.total = null;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    round: room.round,
    maxRounds: room.maxRounds,
    phase: room.phase,
    timerLeft: room.timerLeft,
    log: room.log.slice(-10),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      hearts: p.hearts,
      cups: p.cups,
      alive: p.alive,
      blue: p.blue,
      redShown: p.redShown,
      entered: p.entered,
      withdrawn: p.withdrawn,
      total: p.total
    }))
  };
}

function sendState(room) {
  room.players.forEach(p => {
    io.to(p.id).emit("state", {
      room: publicRoom(room),
      me: {
        id: p.id,
        isHost: room.hostId === p.id,
        redOptions: p.redOptions,
        redShown: p.redShown,
        redHidden: p.redHidden,
        total: p.total
      }
    });
  });
}

function startNewRound(room) {
  if (room.round >= room.maxRounds) {
    room.phase = "ended";
    sendState(room);
    return;
  }

  room.round++;
  room.phase = "chooseRed";
  room.timerLeft = 0;
  clearInterval(room.timer);
  room.timer = null;

  room.players.forEach(resetRoundPlayer);

  room.log.push(`بدأت الجولة ${room.round}`);
  sendState(room);
}

function startDiscussionTimer(room) {
  clearInterval(room.timer);
  room.timerLeft = 60;

  room.timer = setInterval(() => {
    room.timerLeft--;

    if (room.timerLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      autoWithdraw(room);
      resolveRound(room);
      return;
    }

    sendState(room);
  }, 1000);
}

function autoWithdraw(room) {
  alivePlayers(room).forEach(p => {
    if (!p.entered && !p.withdrawn) {
      p.withdrawn = true;
      p.entered = false;
    }
  });
}

function resolveRound(room) {
  if (room.phase !== "discussion") return;

  clearInterval(room.timer);
  room.timer = null;
  room.timerLeft = 0;
  room.phase = "result";

  const active = alivePlayers(room).filter(p => p.entered);

  if (active.length === 0) {
    room.log.push("كل اللاعبين انسحبوا، لا كؤوس ولا خسارة قلوب");
    checkGameEnd(room);
    sendState(room);
    return;
  }

  active.forEach(p => {
    p.total = p.blue + p.redShown + p.redHidden;
  });

  const max = Math.max(...active.map(p => p.total));
  const min = Math.min(...active.map(p => p.total));

  const winners = active.filter(p => p.total === max);
  const losers = active.filter(p => p.total === min);

  winners.forEach(p => p.cups++);
  losers.forEach(p => p.hearts--);

  room.log.push(`الكأس لـ: ${winners.map(p => p.name).join("، ")}`);
  room.log.push(`خسر قلب: ${losers.map(p => p.name).join("، ")}`);

  room.players.forEach(p => {
    if (p.hearts <= 0 && p.alive) {
      p.alive = false;
      room.log.push(`${p.name} خرج من اللعبة`);
    }
  });

  checkGameEnd(room);
  sendState(room);
}

function checkGameEnd(room) {
  const alive = alivePlayers(room);

  if (alive.length <= 1) {
    room.phase = "ended";
    return;
  }

  if (room.round >= room.maxRounds && room.phase === "result") {
    room.phase = "ended";
  }
}

io.on("connection", socket => {
  socket.on("createRoom", ({ name }) => {
    name = String(name || "").trim();

    if (!name) {
      socket.emit("errorMsg", "اكتبي اسم اللاعب");
      return;
    }

    const room = createRoom(socket.id, name);
    socket.roomCode = room.code;
    socket.join(room.code);

    sendState(room);
  });

  socket.on("joinRoom", ({ name, code }) => {
    name = String(name || "").trim();
    code = String(code || "").trim().toUpperCase();

    if (!name || !code) {
      socket.emit("errorMsg", "اكتبي الاسم وكود الغرفة");
      return;
    }

    const room = rooms[code];

    if (!room) {
      socket.emit("errorMsg", "الغرفة غير موجودة");
      return;
    }

    if (room.phase !== "waiting") {
      socket.emit("errorMsg", "اللعبة بدأت، ما تقدرين تدخلين الآن");
      return;
    }

    if (room.players.length >= 10) {
      socket.emit("errorMsg", "الغرفة ممتلئة");
      return;
    }

    room.players.push(createPlayer(socket.id, name));
    room.log.push(`${name} دخل الغرفة`);

    socket.roomCode = code;
    socket.join(code);

    sendState(room);
  });

  socket.on("startRound", () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit("errorMsg", "المضيف فقط يقدر يبدأ الجولة");
      return;
    }

    if (alivePlayers(room).length < 2) {
      socket.emit("errorMsg", "لازم لاعبين على الأقل");
      return;
    }

    if (room.phase !== "waiting" && room.phase !== "result") return;

    startNewRound(room);
  });

  socket.on("nextRound", () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    if (room.hostId !== socket.id) return;
    if (room.phase !== "result") return;

    startNewRound(room);
  });

  socket.on("chooseRed", ({ index }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.phase !== "chooseRed") return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    index = Number(index);
    if (index !== 0 && index !== 1) return;

    player.redShown = player.redOptions[index];
    player.redHidden = player.redOptions[index === 0 ? 1 : 0];

    const allChosen = alivePlayers(room).every(p => p.redShown !== null);

    if (allChosen) {
      room.phase = "discussion";
      room.log.push("بدأ وقت النقاش والخداع");
      startDiscussionTimer(room);
    }

    sendState(room);
  });

  socket.on("decision", ({ enter }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.phase !== "discussion") return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    player.entered = !!enter;
    player.withdrawn = !enter;

    const allDecided = alivePlayers(room).every(p => p.entered || p.withdrawn);

    if (allDecided) resolveRound(room);
    else sendState(room);
  });

  socket.on("restartGame", () => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return;

    clearInterval(room.timer);

    room.round = 0;
    room.phase = "waiting";
    room.timerLeft = 0;
    room.log = ["تمت إعادة اللعبة"];

    room.players.forEach(p => {
      p.hearts = 3;
      p.cups = 0;
      p.alive = true;
      p.blue = null;
      p.redOptions = [];
      p.redShown = null;
      p.redHidden = null;
      p.entered = false;
      p.withdrawn = false;
      p.total = null;
    });

    sendState(room);
  });

  socket.on("disconnect", () => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;

    const room = rooms[code];
    const oldPlayer = room.players.find(p => p.id === socket.id);

    room.players = room.players.filter(p => p.id !== socket.id);

    if (oldPlayer) room.log.push(`${oldPlayer.name} خرج من الغرفة`);

    if (room.players.length === 0) {
      clearInterval(room.timer);
      delete rooms[code];
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
      room.log.push(`${room.players[0].name} صار المضيف`);
    }

    sendState(room);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`ZH is running on http://localhost:${PORT}`);
});