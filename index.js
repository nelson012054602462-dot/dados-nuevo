const { 
  default: makeWASocket, 
const fs = require("fs");

const SESSION_FILE = "session.json";

async function getAuthState() {
  if (fs.existsSync(SESSION_FILE)) {
    return JSON.parse(fs.readFileSync(SESSION_FILE));
  }
  return null;
}

async function saveAuthState(state) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
}
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");

const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");

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
  return table ? table[roll - 1] : null;
}

function applyPrecision(value, precision) {
  let result = value + (precision * 3);
  return Math.max(1, Math.min(20, result));
}

async function startBot() {
let savedState = await getAuthState();

const { state, saveCreds } = await useMultiFileAuthState("auth");

sock.ev.on("creds.update", () => {
  saveCreds();
  saveAuthState(state);
});
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version });

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

  sock.ev.on("creds.update", saveCreds);

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
      if (lowerText.startsWith("!moneda") || lowerText.startsWith("!coin")) {
        const result = Math.random() < 0.5 ? "Cara" : "Cruz";
        await sock.sendMessage(msg.key.remoteJid, { text: `🪙 ${result}` });
        return;
      }

      // =========================
      // D100
      // =========================
      if (lowerText.startsWith("!d100")) {
        const roll = rollDice(100);
        await sock.sendMessage(msg.key.remoteJid, { 
          text: `🎲 d100: ${roll}%`
        });
        return;
      }

      // =========================
      // ATAQUE (VISUAL COMPLETO)
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
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Usa: !ataque d20 d10"
          });
          return;
        }

        response += `⚔️ ATAQUE\n`;

        for (let i = 0; i < d20Count; i++) {

          let r1 = rollDice(20);
          let r2 = rollDice(20);

          let hit = r1;
          let tipo = "normal";

          if (ventaja) {
            hit = Math.max(r1, r2);
            tipo = "ventaja";
          } else if (desventaja) {
            hit = Math.min(r1, r2);
            tipo = "desventaja";
          }

          let beforePrecision = hit;
          hit = applyPrecision(hit, precision);

          response += `\n🎯 Ataque ${i+1}\n`;
          response += `Tirada: ${r1}`;
          if (ventaja || desventaja) {
            response += ` / ${r2} (${tipo}) → ${beforePrecision}`;
          }
          if (precision !== 0) {
            response += ` + (${precision}×3) = ${hit}`;
          }
          response += `\nResultado: ${getD20Result(hit)}\n`;

          let totalDamage = 0;
          let damageDetails = [];

          for (let j = 0; j < damageCount; j++) {
            let roll = rollDice(damageDice);
            let dmg = calculateDamage("d" + damageDice, roll) || 0;
            damageDetails.push(`d${damageDice}:${roll}→${dmg}`);
            totalDamage += dmg;
          }

          response += `💥 Dados: ${damageDetails.join(", ")}\n`;
          response += `Suma base: ${totalDamage}\n`;

          if (bonus) {
            response += `➕ Bonus: +${bonus}\n`;
            totalDamage += bonus;
          }

          if (multiplier !== 1) {
            response += `✖️ x${multiplier}\n`;
            totalDamage *= multiplier;
          }

          let beforeHit = totalDamage;

          if (hit <= 4) totalDamage = 0;
          else if (hit <= 9) totalDamage = Math.floor(totalDamage / 2);
          else if (hit >= 20) totalDamage *= 2;

          if (beforeHit !== totalDamage) {
            response += `⚙️ Ajuste d20: ${beforeHit} → ${totalDamage}\n`;
          }

          response += `🔥 Daño final: ${totalDamage}\n`;
        }

        await sock.sendMessage(msg.key.remoteJid, { text: response });
        return;
      }

      // =========================
      // MULTI-DADOS (VISUAL)
      // =========================
      if (/^!\d+d\d+/.test(lowerText)) {

        const match = lowerText.match(/(\d+)d(\d+)/);
        const count = parseInt(match[1]);
        const sides = parseInt(match[2]);

        let rolls = [];
        let total = 0;
        let details = [];
        let d4Texts = [];

        for (let i = 0; i < count; i++) {
          let roll = rollDice(sides);
          rolls.push(roll);

          if (sides === 4) {
            d4Texts.push(D4_EFFECTS[roll - 1]);
          } else {
            let dmg = calculateDamage("d" + sides, roll) || 0;
            details.push(`${roll}→${dmg}`);
            total += dmg;
          }
        }

        response += `🎲 ${count}d${sides}\n`;
        response += `Tiradas: ${rolls.join(", ")}\n`;

        if (sides === 4) {
          response += `🎯\n- ${d4Texts.join("\n- ")}`;
        } else {
          response += `Detalle: ${details.join(", ")}\n`;
          response += `Suma: ${total}\n`;

          if (bonus) {
            response += `➕ +${bonus}\n`;
            total += bonus;
          }

          if (multiplier !== 1) {
            response += `✖️ x${multiplier}\n`;
            total *= multiplier;
          }

          response += `💢 Total: ${total}`;
        }

        await sock.sendMessage(msg.key.remoteJid, { text: response });
        return;
      }

      // =========================
      // D20 FIJO (VISUAL)
      // =========================
      const fixedD20 = lowerText.match(/d20\s+(\d+)/);
      if (fixedD20) {

        let r1 = rollDice(20);
        let r2 = rollDice(20);

        let hit = r1;
        if (ventaja) hit = Math.max(r1, r2);
        else if (desventaja) hit = Math.min(r1, r2);

        let beforePrecision = hit;
        hit = applyPrecision(hit, precision);

        let damage = parseInt(fixedD20[1]);

        response += `🎯 d20\n`;
        response += `Tirada: ${r1}`;
        if (ventaja || desventaja) {
          response += ` / ${r2} → ${beforePrecision}`;
        }
        if (precision !== 0) {
          response += ` + (${precision}×3) = ${hit}`;
        }

        response += `\nBase daño: ${damage}\n`;

        if (bonus) {
          response += `➕ +${bonus}\n`;
          damage += bonus;
        }

        if (multiplier !== 1) {
          response += `✖️ x${multiplier}\n`;
          damage *= multiplier;
        }

        let beforeHit = damage;

        if (hit <= 4) damage = 0;
        else if (hit <= 9) damage = Math.floor(damage / 2);
        else if (hit >= 20) damage *= 2;

        if (beforeHit !== damage) {
          response += `⚙️ Ajuste d20: ${beforeHit} → ${damage}\n`;
        }

        response += `🔥 Daño final: ${damage}`;

        await sock.sendMessage(msg.key.remoteJid, { text: response });
        return;
      }

      // =========================
      // TIRADA SIMPLE (VISUAL)
      // =========================
      const match = lowerText.match(/d(\d+)/);
      if (!match) return;

      const sides = parseInt(match[1]);

      let r1 = rollDice(sides);
      let r2 = rollDice(sides);

      let final = r1;
      if (ventaja) final = Math.max(r1, r2);
      else if (desventaja) final = Math.min(r1, r2);

      if (sides === 20) final = applyPrecision(final, precision);

      response += `🎲 d${sides}\n`;
      response += `Tirada: ${r1}`;
      if (ventaja || desventaja) response += ` / ${r2}`;
      response += ` → ${final}\n`;

      if (sides === 20) {
        if (precision !== 0) {
          response += `Precisión: (${precision}×3)\n`;
        }
        response += getD20Result(final);
      } else if (sides === 4) {
        response += D4_EFFECTS[final - 1];
      } else {
        let dmg = calculateDamage("d" + sides, final) || 0;

        response += `Base: ${dmg}\n`;

        if (bonus) {
          response += `➕ +${bonus}\n`;
          dmg += bonus;
        }

        if (multiplier !== 1) {
          response += `✖️ x${multiplier}\n`;
          dmg *= multiplier;
        }

        response += `💢 ${dmg}`;
      }

      await sock.sendMessage(msg.key.remoteJid, { text: response });

    } catch (err) {
      console.error("❌ Error:", err);
    }
  });
}

startBot();