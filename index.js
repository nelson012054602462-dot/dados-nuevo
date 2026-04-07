const { 
  default: makeWASocket, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const fs = require("fs");

// =========================
// DATOS
// =========================

const DAMAGE_TABLES = {
  d6: [5,10,15,20,25,30],
  d8: [10,20,25,30,35,40,50,60],
  d10: [20,35,40,50,60,70,80,90,100,120],
  d12: [40,70,85,100,115,130,145,160,175,190,210,240],
  d14: [80,110,140,170,200,230,260,290,320,350,380,410,440,480]
};

const D4_EFFECTS = [
  "Nula efectividad",
  "Poca efectividad",
  "Efectividad regular",
  "Efectividad completa"
];

// =========================
// FUNCIONES
// =========================

function rollDice(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function getD20Result(value) {
  if (value <= 4) return "❌ Fallo";
  if (value <= 9) return "⚠️ 50% daño";
  if (value <= 15) return "✅ Daño completo";
  if (value <= 19) return "💥 Golpe perfecto";
  return "🔥 CRÍTICO x2";
}

function calculateDamage(dice, roll) {
  const table = DAMAGE_TABLES[dice];
  return table ? table[roll - 1] : 0;
}

function applyPrecision(value, precision) {
  let result = value + (precision * 3);
  return Math.max(1, Math.min(20, result));
}

// =========================
// SESIÓN (PERSISTENTE)
// =========================

const SESSION_FILE = "session.json";

function saveSession(state) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.log("Error guardando sesión:", e);
  }
}

// =========================
// BOT
// =========================

async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version
  });

  // Guardar sesión
  sock.ev.on("creds.update", () => {
    saveCreds();
    saveSession(state);
  });

  // Conexión
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escanea este QR:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Bot conectado");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output?.statusCode !== 401;

      if (shouldReconnect) startBot();
      else console.log("🚫 Borra auth");
    }
  });

  // =========================
  // MENSAJES
  // =========================

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption;

      if (!text) return;

      const lowerText = text.toLowerCase().trim();
      if (!lowerText.startsWith("!")) return;

      let response = "";

      const desventaja = lowerText.includes("desventaja");
      const ventaja = lowerText.includes("ventaja") && !desventaja;

      const precisionMatch = lowerText.match(/p([+-]\d+)/);
      const precision = precisionMatch ? parseInt(precisionMatch[1]) : 0;

      const bonusMatch = lowerText.match(/\+(\d+)/);
      const bonus = bonusMatch ? parseInt(bonusMatch[1]) : 0;

      const multMatch = lowerText.match(/\*(\d+)/);
      const multiplier = multMatch ? parseInt(multMatch[1]) : 1;

      // =========================
      // MONEDA
      // =========================
      if (lowerText.startsWith("!moneda")) {
        const result = Math.random() < 0.5 ? "Cara" : "Cruz";
        return sock.sendMessage(msg.key.remoteJid, { text: `🪙 ${result}` });
      }

      // =========================
      // D100
      // =========================
      if (lowerText.startsWith("!d100")) {
        const roll = rollDice(100);
        return sock.sendMessage(msg.key.remoteJid, {
          text: `🎲 d100: ${roll}%`
        });
      }

      // =========================
      // ATAQUE
      // =========================
      if (lowerText.startsWith("!ataque")) {

        const d20Match = lowerText.match(/(\d*)d20/);
        const damageMatch = lowerText.match(/(\d*)d(6|8|10|12|14)/);

        const d20Count = d20Match && d20Match[1] ? parseInt(d20Match[1]) : 1;

        let damageCount = 1;
        let damageDice = null;

        if (damageMatch) {
          damageCount = damageMatch[1] ? parseInt(damageMatch[1]) : 1;
          damageDice = parseInt(damageMatch[2]);
        }

        if (!damageDice) {
          return sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Usa: !ataque d20 d10"
          });
        }

        response += `⚔️ ATAQUE\n`;

        for (let i = 0; i < d20Count; i++) {

          let r1 = rollDice(20);
          let r2 = rollDice(20);

          let hit = ventaja ? Math.max(r1, r2) :
                    desventaja ? Math.min(r1, r2) : r1;

          let beforePrecision = hit;
          hit = applyPrecision(hit, precision);

          response += `\n🎯 Ataque ${i+1}\n`;
          response += `Tirada: ${r1}`;
          if (ventaja || desventaja) {
            response += ` / ${r2} → ${beforePrecision}`;
          }
          if (precision !== 0) {
            response += ` + (${precision}×3) = ${hit}`;
          }
          response += `\nResultado: ${getD20Result(hit)}\n`;

          let totalDamage = 0;
          let details = [];

          for (let j = 0; j < damageCount; j++) {
            let roll = rollDice(damageDice);
            let dmg = calculateDamage("d" + damageDice, roll);
            details.push(`${roll}→${dmg}`);
            totalDamage += dmg;
          }

          response += `💥 Dados: ${details.join(", ")}\n`;

          if (bonus) {
            totalDamage += bonus;
            response += `➕ +${bonus}\n`;
          }

          if (multiplier !== 1) {
            totalDamage *= multiplier;
            response += `✖️ x${multiplier}\n`;
          }

          let final = totalDamage;

          if (hit <= 4) final = 0;
          else if (hit <= 9) final = Math.floor(final / 2);
          else if (hit >= 20) final *= 2;

          response += `🔥 Daño final: ${final}\n`;
        }

        return sock.sendMessage(msg.key.remoteJid, { text: response });
      }

      // =========================
      // TIRADA SIMPLE
      // =========================
      const match = lowerText.match(/d(\d+)/);
      if (!match) return;

      const sides = parseInt(match[1]);

      let r1 = rollDice(sides);
      let r2 = rollDice(sides);

      let final = ventaja ? Math.max(r1, r2) :
                  desventaja ? Math.min(r1, r2) : r1;

      if (sides === 20) final = applyPrecision(final, precision);

      response += `🎲 d${sides}\n`;
      response += `Tirada: ${r1}`;
      if (ventaja || desventaja) response += ` / ${r2}`;
      response += ` → ${final}\n`;

      if (sides === 20) {
        response += getD20Result(final);
      } else if (sides === 4) {
        response += D4_EFFECTS[final - 1];
      } else {
        let dmg = calculateDamage("d" + sides, final);

        if (bonus) dmg += bonus;
        if (multiplier !== 1) dmg *= multiplier;

        response += `💢 ${dmg}`;
      }

      await sock.sendMessage(msg.key.remoteJid, { text: response });

    } catch (err) {
      console.error("❌ Error:", err);
    }
  });
}

startBot();