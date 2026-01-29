const { cmd } = require("../command");
const puppeteer = require("puppeteer");

const pendingSearch = {};
const pendingQuality = {};

const launchBrowser = async () => {
  return await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ]
  });
};

const normalizeQuality = q => {
  q = q?.toUpperCase() || "";
  if (q.includes("1080")) return "1080p";
  if (q.includes("720")) return "720p";
  if (q.includes("480")) return "480p";
  return q;
};

async function searchMovies(query) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(
    `https://sinhalasub.lk/?s=${encodeURIComponent(query)}&post_type=movies`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  const results = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll(".item-box").forEach((box, i) => {
      if (i >= 10) return;
      const a = box.querySelector("a");
      items.push({
        id: i + 1,
        title: a?.getAttribute("title"),
        url: a?.href,
        quality: box.querySelector(".quality")?.innerText || "",
        language: box.querySelector(".language")?.innerText || ""
      });
    });
    return items;
  });

  await browser.close();
  return results.filter(x => x.title && x.url);
}

async function getMovieLinks(url) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  const links = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll("a[href*='pixeldrain.com']")
    ).map(a => a.href);
  });

  await browser.close();
  return [...new Set(links)];
}

cmd({
  pattern: "movie",
  alias: ["sinhalasub", "mv"],
  react: "🎬",
  desc: "Search Movies (Puppeteer)",
  category: "download",
  filename: __filename
}, async (ishan, mek, m, { from, q, sender, reply }) => {

  if (!q) return reply("🎬 movie <name>");

  reply("🔍 Movies හොයමින්...");

  const results = await searchMovies(q);
  if (!results.length) return reply("❌ No movies found");

  pendingSearch[sender] = results;

  let msg = "*🎬 Search Results*\n\n";
  results.forEach(r => {
    msg += `*${r.id}.* ${r.title}\n🎞 ${r.quality} | 🌐 ${r.language}\n\n`;
  });
  msg += "Reply with number";

  reply(msg);
});

cmd({
  filter: (text, { sender }) =>
    pendingSearch[sender] &&
    !isNaN(text) &&
    pendingSearch[sender][text - 1]
}, async (ishan, mek, m, { body, sender, reply }) => {

  const movie = pendingSearch[sender][body - 1];
  delete pendingSearch[sender];

  reply("📥 Download links හොයමින්...");

  const links = await getMovieLinks(movie.url);
  if (!links.length) return reply("❌ No pixeldrain links");

  let msg = `🎬 *${movie.title}*\n\n`;
  links.slice(0, 5).forEach((l, i) => {
    msg += `*${i + 1}.* ${l}\n\n`;
  });

  reply(msg);
});
