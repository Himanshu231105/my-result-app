const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json());

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

// Serve frontend
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

let activeUsersCount = 0;

// Active Users
app.get('/api/active-users', (req, res) => {
    return res.json({
        count: activeUsersCount < 0 ? 0 : activeUsersCount
    });
});

app.post('/api/user-connected', (req, res) => {
    activeUsersCount++;
    return res.json({
        success: true,
        count: activeUsersCount
    });
});

app.post('/api/user-disconnected', (req, res) => {
    activeUsersCount--;

    if (activeUsersCount < 0)
        activeUsersCount = 0;

    return res.json({
        success: true,
        count: activeUsersCount
    });
});

app.post('/api/get-result', async (req, res) => {
const { username, password } = req.body;

  let browser;
  let stepsLog = [];

  try {
    stepsLog.push("Connecting...");

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1,1",
        "--window-position=-2000,-2000"
      ]
    });

    const page = await browser.newPage();

    await page.setViewport({
      width: 1280,
      height: 800
    });

    stepsLog.push("Opening Portal...");

    await page.goto(
      "https://student.sesrcp.in/",
      {
        waitUntil: "networkidle2"
      }
    );

    stepsLog.push("Entering Details...");

    await page.waitForSelector('input[type="text"]');

    await page.type(
      'input[type="text"]',
      username
    );

    await page.type(
      'input[type="password"]',
      password
    );

    stepsLog.push("Submitting Auth...");

    await page.click(
      'button[type="submit"], .btn-primary, button'
    );

    try {

      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 12000
      });

      stepsLog.push("Authorized successfully.");

      await new Promise(r =>
        setTimeout(r, 2000)
      );

    } catch (e) {

      stepsLog.push("Wrong PRN or Password.");

      await browser.close();

      return res.json({
        success: false,
        error: "ERP Login Fail: Kripya sahi ID aur Password dalein.",
        logs: stepsLog
      });

    }

    stepsLog.push("Navigating to gradecard...");

    await page.goto(
      "https://student.sesrcp.in/student/examination/gradecard",
      {
        waitUntil: "networkidle2"
      }
    );

    stepsLog.push("Selecting Sem & Year...");
await page.waitForSelector("select");

    await page.evaluate(() => {
      const dropdowns = document.querySelectorAll("select");

      if (dropdowns.length >= 3) {
        dropdowns[0].value = "2025-26";
        dropdowns[0].dispatchEvent(new Event("change", { bubbles: true }));

        dropdowns[1].value = "2";
        dropdowns[1].dispatchEvent(new Event("change", { bubbles: true }));

        dropdowns[2].value = "Second Year";
        dropdowns[2].dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    await new Promise(r => setTimeout(r, 2000));

    stepsLog.push("Fetching Marksheet...");

    await page.evaluate(() => {
      const proceed = [...document.querySelectorAll("button")]
        .find(btn => btn.textContent.includes("PROCEED"));

      if (proceed) proceed.click();
    });

    await new Promise(r => setTimeout(r, 4000));

    const erpScreenText = await page.evaluate(() => document.body.innerText);

    await browser.close();

    if (
      !erpScreenText.includes("SGPA") &&
      !erpScreenText.includes("Passing")
    ) {
      return res.json({
        success: false,
        error: "Record Not Found: Portal par abhi data upload nahi hua hai.",
        logs: stepsLog
      });
    }

    return res.json({
      success: true,
      rawText: erpScreenText,
      logs: stepsLog
    });

  } catch (err) {

    if (browser) {
      await browser.close();
    }

    console.error(err);

    return res.status(500).json({
      success: false,
      error: "Server timeout. Kripya dobara koshish karein.",
      logs: stepsLog
    });
  }
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});