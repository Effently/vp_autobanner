import {
  Client,
  Events,
  GatewayIntentBits,
  GuildFeature,
  ChannelType,
  ActivityType,
} from "discord.js";
import { GlobalFonts, loadImage, createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import { join } from "node:path";
import conf from "./config/conf.js";
let TOKEN = process.env.TOKEN;
if(!TOKEN) {
  import("./config/token.js").then(module => {
    TOKEN = module.default;
  });
}

let textFont = "MainFont";
if (conf.font[0].filename != "default") {
  GlobalFonts.registerFromPath(
    join(".", "fonts", conf.font[0].filename),
    "MainFont"
  );
} else textFont = "sans-serif";

let textStatusFont = "SecondFont";
if (conf.font[1].filename != "default") {
  GlobalFonts.registerFromPath(
    join(".", "fonts", conf.font[1].filename),
    "SecondFont"
  );
} else textStatusFont = "sans-serif";

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
  ],
});

async function findBg() {
  const files = fs.readdirSync("./config/");
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.endsWith(conf.image)) {
      return "./config/" + file;
    } else if (file.endsWith("image.png")) {
      return "./config/" + file;
    }
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  readyClient.user.setPresence({
    activities: [{
      name: 'Обновляю кол-во участников на баннере',
      type: ActivityType.Playing,
    }],
    status: 'online',
  });

  async function bannerUpdate () {
    const imgPath = await findBg();
    if (!imgPath) {
      console.error("Error: background image not found.");
      return;
    }
    client.guilds.cache.each(async (guild) => {
      const has_banner = guild.features.includes(GuildFeature.Banner);
      if (!has_banner) {
        console.log(`Warning: ${guild.name} has no banner feature.`);
      } else {
        const background = await loadImage(imgPath);
        const canvas = createCanvas(background.width, background.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(background, 0, 0, background.width, background.height);

        let voiceCount = 0;

        guild.channels.cache.forEach((channel) => {
          if (
            channel.type == ChannelType.GuildVoice ||
            channel.type == ChannelType.GuildStageVoice
          ) {
            voiceCount = voiceCount + channel.members?.size;
          }
        });

        let text = `${voiceCount}`;
        let statusText = "В ГС";
        let inVoice = true;
        if (voiceCount == 0) {
          const onlineUsers = (await guild.members.fetch()).filter((member) =>
            ["online", "idle", "dnd"].includes(member.presence?.status)
          );
          text = `${onlineUsers.size - 1}`;
          statusText = "В СЕТИ";
          inVoice = false;
        }

        //metrics.actualBoundingBoxAscent - расстояние от базовой линии текста до верхней границы текста
        //metrics.actualBoundingBoxDescent - от б.л. до нижней границы

        let textMainFontSize = conf.font[0].size;
        let textStatusFontSize = conf.font[1].size;

        // Всегда 1 строка
        if ((Number(text) >= 10) && (Number(text) < 100)) textMainFontSize = conf.font[0].size2;
        else if (Number(text) >= 100) textMainFontSize = conf.font[0].size3;

        // Онлайн в ГС - 2 строка + 1 строка
        if (inVoice && (Number(text) >= 10) && (Number(text) < 100)) {
          textMainFontSize = conf.font[0].size3;
          textStatusFontSize = conf.font[1].size2;
        } else if (inVoice && Number(text) >= 100) {
          textMainFontSize = conf.font[0].size4;
          textStatusFontSize = conf.font[1].size3;
        }



        ctx.font = `${textMainFontSize}px ${textFont}`;
        let textMetrics = ctx.measureText(String(text));
        const [textWidth, textHeight] = [
          textMetrics.width,
          textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent,
        ];

        ctx.font = `${textStatusFontSize}px ${textStatusFont}`;
        let statusTextMetrics = ctx.measureText(statusText);
        const [statusTextWidth, statusTextHeight] = [
          statusTextMetrics.width,
          statusTextMetrics.actualBoundingBoxAscent + statusTextMetrics.actualBoundingBoxDescent,
        ];

        // Перед рисованием текста
        const totalHeight = textHeight + conf.text.gap + statusTextHeight;
        const infoBarHeight = (36 / 135) * background.height; //плашка с названием сервера в дс, не 48
        const startY = ((background.height - infoBarHeight) / 2) - (totalHeight / 2) + infoBarHeight;

        // Рисуем закругленный квадрат
        let maxTextWidth = statusTextWidth;
        if (textWidth > statusTextWidth) maxTextWidth = textWidth;

        const rectWidth = maxTextWidth + 100; // Добавляем отступы по бокам
        const rectHeight = totalHeight + 80; // Добавляем отступы сверху и снизу
        const rectX = (background.width / 2) - (rectWidth / 2);
        const rectY = startY - 40; // Сдвигаем вверх на половину отступа

        const borderRadius = 24;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, borderRadius);
        ctx.fill();

        // Рисуем две строки текста
        const gradient = ctx.createLinearGradient(
          (background.width / 2) - (textWidth / 2),
          startY,
          (background.width / 2) + (textWidth / 2),
          startY + textHeight + conf.text.gap + statusTextHeight
        );
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(1, '#f2a0a0');
        ctx.fillStyle = gradient;
        //ctx.fillStyle = conf.text.color;
        
        ctx.font = `${textMainFontSize}px ${textFont}`;
        ctx.fillText(
          String(text),
          (background.width / 2) - (textWidth / 2),
          startY + textMetrics.actualBoundingBoxAscent
        );

        ctx.font = `${textStatusFontSize}px ${textStatusFont}`;
        ctx.fillText(
          statusText,
          (background.width / 2) - (statusTextWidth / 2),
          startY + textHeight + conf.text.gap + statusTextMetrics.actualBoundingBoxAscent
        );

        try {
          await guild.edit({
            banner: canvas.toBuffer("image/png"),
          });
        } catch (error) {
          console.error(
            `Can't change banner of guild "${guild.name}". Maybe check permissions? Error:\n` +
              error
          );
        }
      }
    });
  }
  bannerUpdate();
  setInterval(bannerUpdate, 5 * 60000);
});

client.login(TOKEN);
