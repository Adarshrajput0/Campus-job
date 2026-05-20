const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
You are CampusBot, a friendly and knowledgeable AI assistant for a Campus Micro-Job Portal — a platform where students post and complete small paid tasks within their college campus community.

YOUR PERSONALITY:
- Friendly, encouraging, and concise
- Speak like a helpful senior student, not a formal bot
- Use simple language; avoid jargon
- Keep responses focused and under 120 words unless the user needs detailed help

YOU HELP STUDENTS WITH:

1. FINDING & POSTING TASKS
   - How to browse available micro-jobs (delivery, tutoring, photography, moving help, data entry, design, etc.)
   - How to post a task: title, description, reward amount, location, number of helpers needed
   - How to set a fair reward/price for a task
   - Tips for writing a good task description that attracts helpers

2. EARNING & PAYMENTS
   - How the payment/reward system works
   - When and how payment is released after task completion
   - How to track earnings on the dashboard
   - Tips for maximising earnings as a student

3. TRUST & SAFETY
   - What the trust/rating system means (⭐ trust score shown on listings)
   - How to build a high trust score
   - What "Verified Task" means and how tasks get verified
   - How to report a problem, dispute, or suspicious user
   - Safety tips when meeting someone on campus for a task

4. TASK CATEGORIES (help users identify the right type)
   - Academic: tutoring, note-taking, proofreading, assignments help
   - Errands: food pickup, parcel delivery, printing, laundry
   - Technical: coding help, fixing devices, setting up software
   - Creative: photography, video editing, poster design, social media
   - Physical: moving furniture, setting up events, cleaning
   - Other: pet sitting, plant watering, campus tours for freshers

5. PROFILE & ACCOUNT
   - How to set up a strong profile to get hired faster
   - How to add skills, portfolio, or photos to a profile
   - How to favourite/save tasks
   - How to manage active and completed tasks

6. CAMPUS LIFE (bonus context)
   - Library hours, cafeteria, health center, parking (answer if asked)
   - Exam season task demand tips (e.g. high demand for tutors before exams)
   - How to balance micro-jobs with academic workload

RULES:
- If someone asks something completely unrelated to campus life or the platform, politely redirect: "I'm best at helping with campus tasks and student life — want help with that?"
- Never make up task listings, prices, or user data — tell the user to check the portal directly for live info
- If a question is about a specific task/listing, ask them to share the task name or ID so you can help better
- Always end with a helpful next step or question if the user seems stuck
`;

exports.chatbot = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || message.trim().length === 0) return res.status(400).json({ reply: "Please send a message." });

    // ── 1. Load live DB data ──
    const Home = require("../models/home");
    const activeJobs = await Home.find({});
    const jobsSummary = activeJobs.map(j => ({
      name: j.houseName, price: j.price, location: j.location,
      type: j.propertytype, slots: j.maxguest, rating: j.rating,
      description: j.description
    }));

    // ── 2. User context ──
    let userName = "Student", userSkills = [];
    if (req.session && req.session.user) {
      userName  = req.session.user.firstName || "Student";
      userSkills = req.session.user.skills || [];
    }

    // ── 3. Try OpenAI (optional upgrade – silently falls back on any error) ──
    try {
      const sysMsg = `${SYSTEM_PROMPT}\n\nUSER: ${userName}, Skills: ${userSkills.join(", ")}\nLIVE JOBS:\n${JSON.stringify(jobsSummary)}`;
      const msgs = [
        { role: "system", content: sysMsg },
        ...history.slice(-6).filter(t => t.role && t.content),
        { role: "user", content: message.trim() }
      ];
      const response = await client.chat.completions.create({ model: "gpt-4o-mini", messages: msgs, temperature: 0.65, max_tokens: 350 });
      return res.json({ reply: response.choices[0].message.content });
    } catch (_apiErr) {
      // OpenAI unavailable – continue to local engine below
    }

    // ── 4. LOCAL SMART NLP ENGINE (always runs when OpenAI is unavailable) ──
    {

      // ── Rich local NLP engine ──
      const q = message.toLowerCase().trim();
      const has = (...words) => words.some(w => q.includes(w));
      const card = (j) =>
        `🔹 <strong>${j.name}</strong><br>&nbsp;&nbsp;📍 ${j.location} &nbsp;|&nbsp; 💰 ₹${j.price} &nbsp;|&nbsp; 👥 ${j.slots} slot${j.slots > 1 ? "s" : ""} &nbsp;|&nbsp; ⭐ ${j.rating}<br>`;
      let reply = "";

      if (has("hi","hello","hey","hola","namaste","sup","yo")) {
        const g = [
          `Hey ${userName}! 👋 I'm <strong>Campus AI</strong> — your guide for the micro-job portal. I can search live gigs, explain payments, share campus schedules, and match tasks to your skills. What's on your mind?`,
          `Good to see you here, ${userName}! 🎓 I'm connected to the live task database. Ask me about tasks, earnings, your skill matches, or anything campus life!`,
          `Hey ${userName}! Ready to help you earn on campus 💸 Ask me about live tasks, how payment works, library timings, or cafeteria specials. Go ahead!`,
        ];
        reply = g[Math.floor(Math.random() * g.length)];

      } else if (has("task","job","gig","work","opportunity","available","show","list","find")) {
        const top = jobsSummary.slice(0, 4);
        if (top.length === 0) {
          reply = `Hey ${userName}! No active listings right now — but new ones are posted daily. Set up your profile so hosts can discover you! 🔍`;
        } else {
          reply = `Hey ${userName}! Here are <strong>${top.length} live gigs</strong> on campus right now — freshly from the database! 🚀<br><br>`;
          top.forEach(j => { reply += card(j) + "<br>"; });
          reply += `👉 <a href="/homes" style="color:#6366f1;font-weight:700">Browse marketplace to apply!</a>`;
        }

      } else if (has("deliver","errand","pickup","fetch","collect","courier")) {
        const m = jobsSummary.filter(j => ["delivery","errand","courier","pickup"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found <strong>${m.length} delivery/errand task${m.length > 1 ? "s" : ""}</strong> for you 🛵<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No delivery gigs live right now, ${userName}. But tutoring and tech tasks are hot! Want me to show those instead?`;
        }

      } else if (has("tutor","teach","study","explain","coach","doubt","academic","notes","lecture")) {
        const m = jobsSummary.filter(j => ["tutor","academic","teach","notes","coaching"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Here are the <strong>tutoring & academic gigs</strong> available 📖<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
          reply += `Great for top-scorers who want to earn while helping peers! 🏆`;
        } else {
          reply = `No tutoring gigs live right now, ${userName}. Exam season is when they spike — check the <a href="/homes" style="color:#6366f1;font-weight:700">marketplace</a> for all categories!`;
        }

      } else if (has("print","photocopy","xerox","stationery","copy","handout")) {
        const m = jobsSummary.filter(j => ["print","stationery","photocopy","xerox","paper","copy"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found some printing-related tasks 🖨️<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No printing tasks live right now, ${userName}. Errand-type tasks that include stationery runs do pop up often. Want me to check those?`;
        }

      } else if (has("code","coding","program","develop","bug","debug","website","software","app","tech")) {
        const m = jobsSummary.filter(j => ["code","software","app","website","tech","program","debug"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Coding tasks pay the best! 💻 Here's what I found:<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
          reply += `Make sure your profile has your tech stack listed to stand out!`;
        } else {
          reply = `No coding gigs live right now, ${userName}. They're highly sought after — keep your profile updated with tech skills and check back soon! 🔧`;
        }

      } else if (has("design","poster","graphic","logo","banner","canva","figma","creative")) {
        const m = jobsSummary.filter(j => ["design","graphic","poster","logo","banner","creative"].some(k => (j.name+j.type+j.description).toLowerCase().includes(k)));
        if (m.length) {
          reply = `Found some creative / design gigs 🎨<br><br>`;
          m.slice(0,3).forEach(j => { reply += card(j) + "<br>"; });
        } else {
          reply = `No design gigs live right now. They come up around college fests! Add "Designing" to your skills so hosts can find you directly, ${userName}. ✨`;
        }

      } else if (has("pay","earn","money","reward","cash","wallet","transfer","income","price","rate","salary")) {
        const maxReward = jobsSummary.length > 0 ? Math.max(...jobsSummary.map(j => j.price)) : "—";
        reply = `Here's exactly how earnings work 💰<br><br>
<strong>Step 1:</strong> Browse and apply for a task you like.<br>
<strong>Step 2:</strong> Host accepts your application — you start work!<br>
<strong>Step 3:</strong> Complete the task and ask the host to mark it <em>Complete</em>.<br>
<strong>Step 4:</strong> Reward is instantly released to you 🎉<br><br>
<em>Top reward on campus right now: <strong>₹${maxReward}</strong></em> on a single task!`;

      } else if (has("profile","skill","bio","setup","account","improve","hire","hired")) {
        const skillStr = userSkills.length > 0 ? userSkills.join(", ") : "none set yet";
        reply = `Your profile is your resume here, ${userName}! ✨<br><br>
<strong>Your skills right now:</strong> ${skillStr}<br><br>
💡 <strong>Tips to get hired faster:</strong><br>
• Add specific skills: <em>Tutoring, Delivery, Coding, Designing</em><br>
• Write a clear bio about your availability & strengths<br>
• Set a realistic expected price (₹50–₹200 is the sweet spot)<br>
• Enter your campus location so nearby hosts find you first<br><br>
<a href="/profile" style="color:#6366f1;font-weight:700">→ Update your profile now</a>`;

      } else if (has("match","recommend","suggest","smart","best for me","suitable","ai")) {
        if (userSkills.length === 0) {
          reply = `${userName}, your profile doesn't have any skills set yet! Head to your <a href="/profile" style="color:#6366f1;font-weight:700">profile</a> to add skills like Tutoring, Coding, or Delivery — then I'll show perfect matches! 🎯`;
        } else {
          const skillWords = userSkills.map(s => s.toLowerCase());
          const matched = jobsSummary.filter(j => {
            const text = (j.name + " " + j.type + " " + j.description).toLowerCase();
            return skillWords.some(s => text.includes(s));
          });
          if (matched.length > 0) {
            reply = `Based on your skills (<em>${userSkills.join(", ")}</em>), here are your best matches 🎯<br><br>`;
            matched.slice(0, 3).forEach(j => { reply += card(j) + "<br>"; });
            reply += `Or see full AI analysis on your <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches page</a>!`;
          } else {
            reply = `No exact matches for your skills right now, ${userName}. New tasks are added daily! Try the <a href="/smart-matches" style="color:#6366f1;font-weight:700">Smart Matches</a> page for a full AI scan. 🔬`;
          }
        }

      } else if (has("library","lib","read","book","study room")) {
        reply = `📚 Campus Library Schedule:<br><br>
<strong>Mon – Fri:</strong> 8:00 AM – 10:00 PM<br>
<strong>Sat – Sun:</strong> 10:00 AM – 6:00 PM<br>
<strong>Basement Study Zone:</strong> Open 24/7 with student ID 🌙<br><br>
<em>Pro tip:</em> The library is peak demand for tutors during exams — post a task or add tutoring to your skills! 📌`;

      } else if (has("cafeteria","canteen","food","eat","lunch","dinner","mess","menu","hungry")) {
        const specials = ["Biryani + Raita","Paneer Butter Masala + Naan","Veg Thali (Full)","Chole Bhature","South Indian Combo"];
        const today = specials[new Date().getDay() % specials.length];
        reply = `🍽️ Today's Cafeteria Special: <strong>${today}</strong><br><br>
<strong>Central Dining Court:</strong> 8:00 AM – 9:30 PM<br>
<strong>Quick Bites Kiosk (Block B):</strong> 7:00 AM – 11:00 PM<br>
<strong>Tea & Snack Counter:</strong> Open all day ☕<br><br>
<em>Fun fact:</em> Cafeteria-to-dorm food deliveries are one of the most popular tasks on this portal! 🛵`;

      } else if (has("safe","trust","scam","fraud","verify","report","rating","secure")) {
        reply = `Safety is our top priority 🛡️<br><br>
<strong>Trust Score:</strong> Every task and user has a verified rating visible on all listings.<br><br>
<strong>Safe practices:</strong><br>
• Meet in public campus areas for in-person tasks<br>
• Communicate through the platform, not personal numbers<br>
• Never pay money upfront — rewards flow <em>to you</em>, not away<br>
• Report suspicious activity via the contact form<br><br>
Build your trust score by completing tasks & getting host reviews ⭐`;

      } else if (has("how","start","begin","use","first time","new","signup")) {
        reply = `Welcome, ${userName}! Here's how it works 🎓<br><br>
<strong>1. Browse</strong> → <a href="/homes" style="color:#6366f1;font-weight:700">Marketplace</a> to explore live gigs<br>
<strong>2. Apply</strong> → Click Apply, pick dates & team size<br>
<strong>3. Get Selected</strong> → Host reviews your profile and picks the best fit<br>
<strong>4. Complete & Get Paid</strong> → Finish the task, host marks done, you get paid! 💸<br><br>
<em>Tip:</em> Fill your <a href="/profile" style="color:#6366f1;font-weight:700">profile & skills</a> first to stand out! 🌟`;

      } else if (has("how many","count","total","stat","number","how much")) {
        const totalJobs = jobsSummary.length;
        const totalPool = jobsSummary.reduce((a, j) => a + (j.price || 0), 0);
        const avg = totalJobs > 0 ? Math.round(totalPool / totalJobs) : 0;
        reply = `📊 Live Platform Stats:<br><br>
🏷️ <strong>Active Listings:</strong> ${totalJobs} tasks<br>
💰 <strong>Total Reward Pool:</strong> ₹${totalPool}<br>
📈 <strong>Avg Reward per Task:</strong> ₹${avg}<br>
⭐ <strong>Platform Trust Score:</strong> 4.9 / 5<br><br>
New tasks are added every day — stay active to catch them first! 🚀`;

      } else if (has("exam","test","semester","marks","result","grade")) {
        reply = `Exam survival mode activated! 📝<br><br>
<strong>Earn while you study — tips:</strong><br>
• Take <em>note-taking or proofreading tasks</em> — you revise and earn simultaneously!<br>
• Avoid physical tasks during exam week — protect your schedule<br>
• <em>Tutoring</em> is peak-demand before exams — your knowledge is worth ₹200+/hour!<br><br>
Want me to find tutoring gigs you can pick up during exam prep? 🎯`;

      } else if (has("thank","thanks","thx","great","awesome","perfect","nice","cool","helpful","good")) {
        const tys = [
          `You're welcome, ${userName}! 😊 Feel free to ask anything else about the campus portal!`,
          `Happy to help! 🎉 I'm always connected to live data — ask me anything anytime!`,
          `Glad that helped, ${userName}! 🙌 Want me to find a specific task or check something else?`,
        ];
        reply = tys[Math.floor(Math.random() * tys.length)];

      } else {
        const defaults = [
          `Hmm, I didn't quite catch that, ${userName}! Try asking: <br>• "Show me live tasks" <br>• "How do I get paid?" <br>• "Match tasks to my skills" <br>• "What's in the cafeteria today?" ⚡`,
          `I'm best at campus tasks, earnings, and schedules, ${userName}! Try: "Find delivery jobs" or "Library timings" and I'll get you sorted instantly 🤖`,
          `Not sure about that one! But I can search live gigs, explain the reward process, or show your AI matches. What would you like, ${userName}? 🎯`,
        ];
        reply = defaults[Math.floor(Math.random() * defaults.length)];
      }

      return res.json({ reply });
    } // end local NLP block

  } catch (error) {
    console.error("[CampusBot Error]", error.message);
    res.status(500).json({ reply: "Something went wrong — please try again in a moment! 🔄" });
  }
};

// ────────── NEW USER PROFILE CONTROLLERS ──────────

// GET: Student Profile Page
exports.getProfile = async (req, res) => {
  try {
    const User = require("../models/user");
    // Retrieve fresh user info from MongoDB
    const user = await User.findById(req.session.user._id);
    
    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: user,
      successMessage: null,
      errorMessage: null,
    });
  } catch (error) {
    console.error("[getProfile Error]", error);
    res.redirect("/");
  }
};

// POST: Save Profile Bio and Skills
exports.postProfile = async (req, res) => {
  try {
    const User = require("../models/user");
    let { bio, skills, expectedPrice, distance, location } = req.body;

    // Parse skills (handles arrays and comma-separated strings)
    let skillsArray = [];
    if (typeof skills === "string") {
      skillsArray = skills
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (Array.isArray(skills)) {
      skillsArray = skills.map((s) => s.trim()).filter((s) => s.length > 0);
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.session.user._id,
      { 
        bio: bio || "", 
        skills: skillsArray,
        expectedPrice: expectedPrice ? Number(expectedPrice) : 0,
        distance: distance ? Number(distance) : 0,
        location: location ? location.trim() : ""
      },
      { new: true }
    );

    // Sync session
    req.session.user = updatedUser;
    await req.session.save();

    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: updatedUser,
      successMessage: "Profile updated successfully! Now explore your 🎯 Smart Matches.",
      errorMessage: null,
    });
  } catch (error) {
    console.error("[postProfile Error]", error);
    res.render("store/profile", {
      pageTitle: "My Student Profile",
      currentPage: "profile",
      isLoggedIn: true,
      user: req.session.user,
      successMessage: null,
      errorMessage: "An error occurred while saving your profile. Please try again.",
    });
  }
};

// ────────── NEW SMART MATCHING CONTROLLER ──────────

// Local NLP Fallback Engine — robust stem + synonym + price + distance matching
function localMatchEngine(user, jobs) {
  const userSkills = (user.skills || []).map((s) => s.toLowerCase().trim());
  const userBio = (user.bio || "").toLowerCase();
  const userPrice = Number(user.expectedPrice) || 0;
  const userDistance = Number(user.distance) || 0;

  // Synonym map: each skill → all keywords that count as a match in job text
  const synonymMap = {
    "printing":      ["print", "photocopy", "xerox", "stationery", "notes", "handout", "paper", "copy"],
    "stationery":    ["print", "stationery", "notes", "photocopy", "xerox", "paper", "shop"],
    "delivery":      ["deliver", "delivery", "pickup", "pick up", "bring", "collect", "drop", "courier", "fetch", "transport", "carry"],
    "errands":       ["errand", "pickup", "collect", "fetch", "bring", "shop", "buy", "get", "run"],
    "tutoring":      ["tutor", "teach", "explain", "help", "study", "lesson", "coach", "guide", "doubt"],
    "note-taking":   ["note", "notes", "write", "transcribe", "summary", "record", "jot"],
    "proofreading":  ["proof", "edit", "grammar", "review", "correct", "check", "revise"],
    "coding":        ["code", "coding", "program", "develop", "debug", "software", "app", "website", "python", "java", "script", "tech"],
    "designing":     ["design", "poster", "graphic", "banner", "logo", "illustrat", "canva", "figma", "ui", "creative", "visual"],
    "photography":   ["photo", "photograph", "camera", "picture", "shoot", "click", "portrait", "image"],
    "event help":    ["event", "setup", "arrange", "organise", "organize", "decor", "manage", "host", "fest"],
    "cleaning":      ["clean", "sweep", "mop", "wash", "tidy", "sanitise", "sanitize", "dust", "scrub"],
  };

  return jobs.map((job) => {
    const title    = (job.houseName    || "").toLowerCase();
    const desc     = (job.description  || "").toLowerCase();
    const category = (job.propertytype || "").toLowerCase();
    const jobText  = `${title} ${desc} ${category}`; // single blob to search

    let score = 0;
    let matchingSkills = [];

    // ── Score each skill against job text ──────────────────────────
    userSkills.forEach((skill) => {
      const keywords = synonymMap[skill] || [skill];
      let matched = false;

      // 1. Synonym keyword match (e.g. "printing" → looks for "print" in job)
      for (const kw of keywords) {
        if (jobText.includes(kw)) {
          score += 40;
          matched = true;
          break;
        }
      }

      // 2. Stem fallback: strip last 2-3 chars (e.g. "printing"→"printi", "delivery"→"delive")
      if (!matched && skill.length >= 5) {
        const stem = skill.substring(0, skill.length - 2);
        if (jobText.includes(stem)) {
          score += 25;
          matched = true;
        }
      }

      // 3. Direct skill name in job text (last resort)
      if (!matched && jobText.includes(skill)) {
        score += 35;
        matched = true;
      }

      if (matched && !matchingSkills.includes(skill)) {
        matchingSkills.push(skill);
      }
    });

    // ── Small bio word boost ────────────────────────────────────────
    userBio.split(/\s+/).filter((w) => w.length > 3).forEach((word) => {
      if (jobText.includes(word)) score += 3;
    });

    // ── Price & Distance Boost/Penalties ────────────────────────────
    let priceReason = "";
    if (userPrice > 0) {
      if (job.price >= userPrice) {
        score += 10;
        priceReason = "Matches your rate expectations! ";
      } else {
        score -= 15;
        priceReason = "Pay is slightly below your expected rate. ";
      }
    }

    let distanceReason = "";
    if (userDistance > 0) {
      const isPhysical = ["cleaning", "delivery", "event help", "errands"].includes(category);
      if (userDistance <= 1.0) {
        score += 5;
        distanceReason = "Very close to you! ";
      } else if (userDistance > 3.0 && isPhysical) {
        score -= 10;
        distanceReason = "Remote location might increase travel effort. ";
      }
    }

    // ── Normalize ───────────────────────────────────────────────────
    let matchScore = Math.min(Math.max(Math.round(score), 10), 98);
    if (matchingSkills.length === 0) matchScore = Math.min(matchScore, 35);

    // ── Generate reason ─────────────────────────────────────────────
    let reason = matchingSkills.length > 0
      ? `Great match! Your skill in ${matchingSkills.map((s) => `'${s}'`).join(" & ")} aligns perfectly with this ${job.propertytype} task. ${priceReason}${distanceReason}You can complete this easily!`
      : `Potential match! This ${job.propertytype} task in ${job.location} may suit your profile. ${priceReason}${distanceReason}`;

    // ── Override: Printing + stationery job → guaranteed top score ──
    const isPrintUser = userSkills.includes("printing") || userSkills.includes("stationery") || userBio.includes("print");
    const isPrintJob  = jobText.includes("print") || jobText.includes("stationery") || jobText.includes("notes") || jobText.includes("photocopy") || jobText.includes("xerox");
    if (isPrintUser && isPrintJob) {
      matchScore = Math.max(matchScore, 95);
      reason = `Top Pick! 🖨️ You have 'Printing' as a skill — perfect for this task! Just visit the stationery shop, get the notes printed, deliver them, and earn your reward. ${priceReason}`;
      if (!matchingSkills.includes("printing")) matchingSkills.push("printing");
    }

    // ── Override: Delivery/errands + delivery job → high score ─────
    const isDeliveryUser = userSkills.includes("delivery") || userSkills.includes("errands") || userBio.includes("deliver");
    const isDeliveryJob  = jobText.includes("deliver") || jobText.includes("pickup") || jobText.includes("fetch") || jobText.includes("bring") || jobText.includes("collect");
    if (isDeliveryUser && isDeliveryJob) {
      matchScore = Math.max(matchScore, 88);
      reason = `Strong Match! 🚴 Your delivery & errand skills are exactly what this task needs. Pick it up and earn! ${priceReason}${distanceReason}`;
      if (!matchingSkills.includes("delivery")) matchingSkills.push("delivery");
    }

    return { jobId: job._id.toString(), matchScore, reason };
  });
}

// GET: Calculate Smart Matches and render recommendations
exports.getSmartMatches = async (req, res) => {
  try {
    const User = require("../models/user");
    const Home = require("../models/home");

    const user = await User.findById(req.session.user._id);
    const activeJobs = await Home.find();

    // Check if profile is complete (needs bio or at least 1 skill)
    if (!user.bio && (!user.skills || user.skills.length === 0)) {
      return res.render("store/smart-matches", {
        pageTitle: "AI Smart Matches",
        currentPage: "smart-matches",
        isLoggedIn: true,
        user: user,
        matches: [],
        profileIncomplete: true,
        aiUsed: false,
      });
    }

    // Filter out jobs owned by the user themselves (but keep legacy jobs that have no owner)
    const otherJobs = activeJobs.filter(
      (job) => !job.owner || job.owner.toString() !== user._id.toString()
    );

    if (otherJobs.length === 0) {
      return res.render("store/smart-matches", {
        pageTitle: "AI Smart Matches",
        currentPage: "smart-matches",
        isLoggedIn: true,
        user: user,
        matches: [],
        profileIncomplete: false,
        aiUsed: false,
      });
    }

    let matchResults = [];
    let aiUsed = false;

    // Trigger OpenAI semantic analysis if API key is active
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().startsWith("sk-")) {
      try {
        const jobsData = otherJobs.map((job) => ({
          id: job._id.toString(),
          title: job.houseName,
          description: job.description || "",
          category: job.propertytype,
          location: job.location,
          price: job.price,
        }));

        const aiPrompt = `
You are the AI Smart Matcher for a Campus Micro-Job Portal.
Analyze the following student's profile (skills, bio, expected hourly rate, and distance from campus center) against a list of active campus micro-jobs.

STUDENT PROFILE:
- Skills: ${JSON.stringify(user.skills)}
- Bio: ${JSON.stringify(user.bio)}
- Expected Rate: ₹${user.expectedPrice || 0}/hr
- Distance from Campus Center: ${user.distance || 0} km

ACTIVE MICRO-JOBS:
${JSON.stringify(jobsData, null, 2)}

TASK:
1. For each micro-job, calculate a Match Score (an integer from 0 to 100) representing how well the student's skills, experience, bio, rate expectations, and campus distance align with the job's title, description, category, pay, and location.
   - If the job pay meets or exceeds their expected rate, and skills match, the match score should be high (85-100%).
   - If the student has the required skills but the pay is significantly below their expected rate, adjust the score lower (e.g. decrease by 15-20 points).
   - If the student resides far from campus center (>3 km) and it is a physical/delivery job, adjust the score lower.
   - If the job is about "printing notes" or "stationery" and they have "printing", "stationery", "errands" or mention a printer in bio, the match score should be extremely high (85-100%).
2. Provide a highly personalized, friendly 1-2 sentence explanation ("reason") in English for why they are a good match, referring to their rate match or distance advantage if relevant. Speak directly to the student. Keep it conversational, encouraging, and under 40 words.

Return ONLY a valid JSON object, containing a single key "matches", which maps to an array of match objects:
{
  "matches": [
    {
      "jobId": "string",
      "matchScore": number,
      "reason": "string"
    }
  ]
}
`;

        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a professional JSON-generating AI system that always produces valid JSON and never wraps it in markdown blocks.",
            },
            { role: "user", content: aiPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 1500,
        });

        const parsedContent = JSON.parse(response.choices[0].message.content);
        if (parsedContent && Array.isArray(parsedContent.matches)) {
          matchResults = parsedContent.matches;
          aiUsed = true;
          console.log("[AI Matching Engine executed successfully]");
        }
      } catch (aiError) {
        console.error("[AI Engine Failed, falling back to local NLP]", aiError?.message || aiError);
      }
    }

    // Trigger local fallback if AI wasn't run or returned empty
    if (matchResults.length === 0) {
      matchResults = localMatchEngine(user, otherJobs);
      aiUsed = false;
      console.log("[Local NLP Fallback Match Engine executed successfully]");
    }

    // Merge match attributes back into original MongoDB document items
    const matchedJobs = otherJobs
      .map((job) => {
        const matchData = matchResults.find(
          (m) => m.jobId === job._id.toString()
        ) || {
          matchScore: 35,
          reason: "Matches general campus micro-job profile parameters.",
        };

        return {
          ...job.toObject(),
          matchScore: matchData.matchScore,
          matchReason: matchData.reason,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore); // Sort by highest score first

    res.render("store/smart-matches", {
      pageTitle: "🎯 Smart Matches",
      currentPage: "smart-matches",
      isLoggedIn: true,
      user: user,
      matches: matchedJobs,
      profileIncomplete: false,
      aiUsed: aiUsed,
    });
  } catch (error) {
    console.error("[getSmartMatches Controller Error]", error);
    res.redirect("/");
  }
};

